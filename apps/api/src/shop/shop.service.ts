import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ClubPaymentMethod,
  InvoiceStatus,
  MediaVisibility,
  Prisma,
  ShopOrderStatus,
} from '@prisma/client';
import type { ShopDeliveryNoteData } from '../pdf/shop-delivery-note-pdf.service';
import { PrismaService } from '../prisma/prisma.service';
import { availabilityOf } from './enums/shop-availability.enum';
import { ShopPreorderService } from './shop-preorder.service';
import { ShopPurchaseOrdersService } from './shop-purchase-orders.service';
import { ShopStockService } from './shop-stock.service';

type ViewerIdentity = {
  memberId?: string | null;
  contactId?: string | null;
};

/** Ce que la projection d'un produit a le droit de montrer. */
type ShapeOptions = {
  /** Faux sur tout chemin public : aucune quantité, même dérivée. */
  withQuantities: boolean;
  onOrder?: Map<string, number>;
  preordered?: Map<string, number>;
};

/**
 * Comment une commande traite les CGV de la boutique (ADR-0017).
 *
 * Paramètre OBLIGATOIRE de `placeOrderInTx` : tout chemin qui crée une commande
 * doit le dire, et un chemin oublié ne compile pas. Ce n'est pas une précaution
 * abstraite — `viewerPlaceShopOrder` commande sans panier, à côté du checkout,
 * et une règle posée sur le seul checkout l'aurait laissé passer.
 */
export type ShopTermsConsent =
  /** L'adhérent commande : il doit avoir accepté la version EN VIGUEUR. */
  | { kind: 'MEMBER'; acceptedTermsId: string | null }
  /** Vente au comptoir : l'acceptation sera portée par la remise signée. */
  | { kind: 'COUNTER' };

/** Les CGV de la boutique, telles que les voient l'admin et l'adhérent. */
export type ShopTermsView = {
  /** Identifiant du PDF : c'est lui que l'adhérent renvoie en acceptant. */
  id: string;
  fileName: string;
  url: string;
  updatedAt: Date | null;
};

/**
 * Garde « aucun encaissement » d'une annulation sans remboursement (ADR-0019),
 * portée par l'écriture conditionnelle elle-même : commande sans facture, ou
 * facture sans aucun paiement.
 */
const WITHOUT_PAYMENT = {
  OR: [
    { invoice: { is: null } },
    { invoice: { is: { payments: { none: {} } } } },
  ],
} satisfies Prisma.ShopOrderWhereInput;

/**
 * Délai indicatif de précommande tel que saisi : les blancs sont retirés, et un
 * champ vide se lit « aucun délai annoncé » plutôt qu'une chaîne vide.
 */
function leadTimeOf(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? '';
  return trimmed.length > 0 ? trimmed : null;
}

@Injectable()
export class ShopService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly stock: ShopStockService,
    private readonly purchases: ShopPurchaseOrdersService,
    private readonly preorders: ShopPreorderService,
  ) {}

  // --- Products ---

  async listProductsAdmin(clubId: string) {
    const rows = await this.prisma.shopProduct.findMany({
      where: { clubId },
      orderBy: [{ active: 'desc' }, { createdAt: 'desc' }],
      include: { variants: { orderBy: { createdAt: 'asc' } } },
    });
    const counts = await this.adminCountsFor(clubId, rows);
    return rows.map((p) =>
      this.shapeProduct(p, { withQuantities: true, ...counts }),
    );
  }

  async listProductsPublic(clubId: string) {
    const rows = await this.prisma.shopProduct.findMany({
      where: { clubId, active: true },
      orderBy: [{ createdAt: 'desc' }],
      include: {
        variants: { where: { active: true }, orderBy: { createdAt: 'asc' } },
      },
    });
    // `withQuantities: false` : l'acheteur reçoit `inStock`, jamais un
    // chiffre — y compris les champs DÉRIVÉS des quantités (`stock`,
    // `variantsBelowThreshold`, `belowThreshold`), qui les trahiraient tout
    // autant. Le portail membre passe par ici.
    return rows.map((p) => this.shapeProduct(p, { withQuantities: false }));
  }

  /**
   * Recharge un produit sous sa forme GraphQL après écriture.
   *
   * Public parce que `ShopVariantsService` écrit lui aussi des variantes et
   * doit rendre le MÊME objet que les mutations produit — dupliquer la
   * projection ferait diverger les deux écrans à la première évolution.
   */
  async reloadProduct(clubId: string, id: string) {
    const row = await this.prisma.shopProduct.findFirstOrThrow({
      where: { id, clubId },
      include: { variants: { orderBy: { createdAt: 'asc' } } },
    });
    const counts = await this.adminCountsFor(clubId, [row]);
    return this.shapeProduct(row, { withQuantities: true, ...counts });
  }

  /**
   * Quantités DÉRIVÉES des déclinaisons affichées : l'encours fournisseur
   * (ADR-0013 §4) et les unités précommandées en attente d'arrivage
   * (ADR-0018).
   *
   * Une requête par compteur pour tout l'écran : le calcul est DÉRIVÉ, donc il
   * ne doit pas coûter une requête par ligne. Jamais appelé sur le chemin
   * PUBLIC — l'acheteur n'a pas à connaître l'encours d'achat du club, ni
   * combien d'autres attendent le même article.
   */
  private async adminCountsFor(
    clubId: string,
    products: Array<{ variants: Array<{ id: string }> }>,
  ) {
    const ids = products.flatMap((p) => p.variants.map((v) => v.id));
    const [onOrder, preordered] = await Promise.all([
      this.purchases.onOrderByVariant(clubId, ids),
      this.preorders.preorderedByVariant(clubId, ids),
    ]);
    return { onOrder, preordered };
  }

  /**
   * Projette un produit et ses variantes vers le type GraphQL.
   *
   * `stock` y est calculé — c'est le champ dérivé qui remplace la colonne
   * morte, et qui évite aux 18 opérations existantes de casser le jour du
   * déploiement (ADR-0012 §Conséquences).
   */
  private shapeProduct(
    p: Prisma.ShopProductGetPayload<{ include: { variants: true } }>,
    opts: ShapeOptions,
  ) {
    const variants = p.variants;
    const tracked = variants.filter((v) => v.trackStock && v.active);

    const priceOf = (v: (typeof variants)[number]) =>
      v.priceCents ?? p.priceCents;

    return {
      id: p.id,
      clubId: p.clubId,
      sku: p.sku,
      name: p.name,
      description: p.description,
      imageUrl: p.imageUrl,
      priceCents: p.priceCents,
      // Réglages de précommande : publics, ce ne sont pas des quantités.
      preorderEnabled: p.preorderEnabled,
      preorderLeadTime: p.preorderLeadTime,
      // Somme des variantes suivies, ou null si aucune ne l'est : c'est
      // exactement l'ancienne sémantique « illimité ».
      //
      // NEUTRALISÉ HORS ADMINISTRATION, et c'est un correctif : ce champ est
      // DÉRIVÉ des quantités, donc les masquer une à une ne suffisait pas.
      // Un adhérent muni de son JWT de portail pouvait lire le stock exact via
      // `viewerShopProducts { stock }` — GraphQL n'est pas un contrôle
      // d'accès, ne pas sélectionner un champ ne le protège pas.
      stock:
        !opts.withQuantities || tracked.length === 0
          ? null
          : tracked.reduce((sum, v) => sum + v.available, 0),
      // Valeur du stock au coût moyen pondéré (ADR-0013 §1) — REPORTING, pas
      // grand livre : aucun compte de stock 3xx n'existe au plan.
      //
      // NEUTRALISÉ HORS ADMINISTRATION comme tout le reste, et pour une raison
      // de plus : ce champ est dérivé d'une quantité ET d'un PRIX D'ACHAT. Un
      // adhérent qui le lit connaît la marge que son club fait sur lui.
      //
      // SOUS-ÉVALUE volontairement : une variante au coût inconnu (0) compte
      // pour rien plutôt que d'inventer une valeur. Le total est donc un
      // PLANCHER, pas une estimation — à présenter comme tel à l'écran.
      stockValueCents: opts.withQuantities
        ? tracked.reduce((sum, v) => sum + v.onHand * v.avgCostCents, 0)
        : null,
      hasVariants: variants.some((v) => !v.isDefault),
      priceFromCents:
        variants.length === 0
          ? p.priceCents
          : Math.min(...variants.map(priceOf)),
      // Même raison : le nombre de déclinaisons sous seuil trahit à la fois
      // une quantité et le niveau auquel le club réapprovisionne.
      variantsBelowThreshold: opts.withQuantities
        ? tracked.filter(
            (v) =>
              v.reorderThreshold !== null && v.available <= v.reorderThreshold,
          ).length
        : 0,
      variants: variants.map((v) =>
        this.shapeVariant(v, priceOf(v), p.preorderEnabled, opts),
      ),
      active: p.active,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
    };
  }

  /**
   * Projette une déclinaison. Extrait de `shapeProduct` parce que le bloc de
   * NEUTRALISATION y est désormais la partie la plus longue, et que ce qui
   * porte une garantie mérite de se relire d'un bloc.
   */
  private shapeVariant(
    v: Prisma.ShopProductVariantGetPayload<object>,
    unitPriceCents: number,
    preorderEnabled: boolean,
    opts: ShapeOptions,
  ) {
    // Coût d'achat, marge, taux de marge : trois champs DÉRIVÉS du coût
    // d'acquisition, donc trois fuites potentielles du prix fournisseur.
    //
    // Ils suivent EXACTEMENT le sort d'`available` (ADR-0012, et la régression
    // corrigée en urgence sur `stock`) : masquer les quantités une par une ne
    // suffit pas, il faut masquer aussi tout ce qui s'en déduit. Un adhérent
    // qui lit `marginCents` connaît le prix d'achat de son club, et un
    // fournisseur concurrent aussi.
    //
    // ZÉRO SIGNIFIE « COÛT INCONNU », PAS « GRATUIT ». Une variante jamais
    // réceptionnée, ou reçue sur une ligne dont le prix d'achat n'a pas été
    // saisi, garde `avgCostCents` à 0. En déduire une marge donnerait le prix
    // de vente entier — soit 100 % de marge affichée sur tout ce que le club
    // n'a pas encore chiffré, et le trésorier arbitrerait là-dessus.
    //
    // On rend donc les trois champs null dans ce cas. Un article réellement
    // gratuit est indiscernable d'un article non chiffré tant que la colonne
    // n'est pas nullable ; afficher « pas d'information » sur les deux est
    // honnête, afficher « marge totale » sur les deux ne l'est pas.
    const costKnown = opts.withQuantities && v.avgCostCents > 0;
    const avgCostCents = costKnown ? v.avgCostCents : null;
    const marginCents =
      avgCostCents === null ? null : unitPriceCents - avgCostCents;
    const marginRate =
      marginCents === null || unitPriceCents === 0
        ? null // un prix nul n'a pas de taux de marge, il a une division par zéro
        : marginCents / unitPriceCents;

    return {
      id: v.id,
      productId: v.productId,
      isDefault: v.isDefault,
      label: v.label,
      sku: v.sku,
      unitPriceCents,
      trackStock: v.trackStock,
      available: opts.withQuantities ? v.available : null,
      onHand: opts.withQuantities ? v.onHand : null,
      reorderThreshold: opts.withQuantities ? v.reorderThreshold : null,
      // Neutralisé hors administration comme `available` : « 20 arrivent »
      // est une quantité, et l'encours d'achat n'a rien à faire au portail.
      onOrder: opts.withQuantities ? opts.onOrder?.get(v.id) ?? 0 : null,
      // Idem : « 3 précommandées » est une quantité (ADR-0018).
      preorderedQty: opts.withQuantities
        ? opts.preordered?.get(v.id) ?? 0
        : null,
      avgCostCents,
      marginCents,
      marginRate,
      inStock: !v.trackStock || v.available > 0,
      // Ce que l'adhérent peut en faire, sans savoir combien il en reste.
      availability: availabilityOf(v, preorderEnabled),
      // Neutralisé hors administration au même titre que le reste : savoir
      // qu'une taille est « sous le seuil » revient à connaître à la fois la
      // quantité restante et la politique de réappro du club.
      belowThreshold:
        opts.withQuantities &&
        v.trackStock &&
        v.reorderThreshold !== null &&
        v.available <= v.reorderThreshold,
      active: v.active,
    };
  }

  /**
   * Crée un produit ET sa variante par défaut, dans la même transaction.
   *
   * Le formulaire reste celui d'avant : l'admin saisit un nom, un prix, un
   * stock, et ne voit jamais le mot « déclinaison ». La variante `isDefault`
   * est posée par le service — c'est elle qui fait qu'il n'existe QU'UN seul
   * chemin de vente, donc une seule garantie à tenir (ADR-0012 §1).
   *
   * `stock: undefined` signifiait « illimité » dans l'ancien formulaire. La
   * sémantique est reportée sur `trackStock`, pas sur un compteur nullable.
   */
  async createProduct(
    clubId: string,
    input: {
      name: string;
      sku?: string;
      description?: string;
      imageUrl?: string;
      priceCents: number;
      stock?: number;
      active?: boolean;
      reorderThreshold?: number;
      preorderEnabled?: boolean;
      preorderLeadTime?: string | null;
    },
  ) {
    const tracked = input.stock !== undefined && input.stock !== null;
    const quantity = tracked ? input.stock! : 0;

    return this.prisma.$transaction(async (tx) => {
      const product = await tx.shopProduct.create({
        data: {
          clubId,
          name: input.name,
          sku: input.sku ?? null,
          description: input.description ?? null,
          imageUrl: input.imageUrl ?? null,
          priceCents: input.priceCents,
          // Colonne morte (ADR-0012) : plus jamais écrite.
          stock: null,
          active: input.active !== false,
          preorderEnabled: input.preorderEnabled === true,
          preorderLeadTime: leadTimeOf(input.preorderLeadTime),
        },
      });
      const variant = await tx.shopProductVariant.create({
        data: {
          clubId,
          productId: product.id,
          optionSignature: '', // chaîne vide : c'est elle qui porte l'unicité
          isDefault: true,
          label: null,
          sku: input.sku ?? null,
          priceCents: null, // hérite du produit
          trackStock: tracked,
          onHand: 0,
          available: 0,
          reorderThreshold: input.reorderThreshold ?? null,
        },
      });
      // Le stock initial passe par le MOTEUR, qui l'archive. Le poser
      // directement à la création laisserait le journal irréconciliable dès le
      // premier produit — l'écart valant exactement ce stock initial.
      if (quantity > 0 || tracked) {
        await this.stock.open(tx, {
          clubId,
          variantId: variant.id,
          qty: quantity,
          trackStock: tracked,
        });
      }
      return product.id;
    })
      .then((id) => this.reloadProduct(clubId, id));
  }

  async updateProduct(
    clubId: string,
    id: string,
    input: {
      name?: string;
      sku?: string;
      description?: string;
      imageUrl?: string;
      priceCents?: number;
      stock?: number | null;
      active?: boolean;
      reorderThreshold?: number | null;
      preorderEnabled?: boolean | null;
      preorderLeadTime?: string | null;
    },
  ) {
    const existing = await this.prisma.shopProduct.findFirst({
      where: { id, clubId },
      include: { variants: { where: { isDefault: true }, take: 1 } },
    });
    if (!existing) throw new NotFoundException('Produit introuvable');
    const data: Prisma.ShopProductUpdateInput = {};
    if (input.name !== undefined) data.name = input.name;
    if (input.sku !== undefined) data.sku = input.sku;
    if (input.description !== undefined) data.description = input.description;
    if (input.imageUrl !== undefined) data.imageUrl = input.imageUrl;
    if (input.priceCents !== undefined) data.priceCents = input.priceCents;
    if (input.active !== undefined) data.active = input.active;
    // Un `null` venu du formulaire ne décoche rien : seul un booléen change la
    // précommande. Le délai, lui, s'efface par une chaîne vide ou `null`.
    if (typeof input.preorderEnabled === 'boolean') {
      data.preorderEnabled = input.preorderEnabled;
    }
    if (input.preorderLeadTime !== undefined) {
      data.preorderLeadTime = leadTimeOf(input.preorderLeadTime);
    }
    // `stock` n'est PLUS écrit sur le produit (colonne morte, ADR-0012).
    // Deux sources de vérité concurrentes seraient pires que tout.

    await this.prisma.shopProduct.update({ where: { id }, data });

    // Le champ `stock` du formulaire d'un produit SIMPLE pilote la variante
    // par défaut, via une correction d'inventaire — ce que l'admin déclare
    // là, c'est ce qu'il a compté. Le mouvement en garde la trace.
    const def = existing.variants[0];
    if (input.stock !== undefined && def && def.isDefault) {
      if (input.stock === null) {
        await this.prisma.shopProductVariant.update({
          where: { id: def.id },
          data: { trackStock: false },
        });
      } else {
        if (!def.trackStock) {
          // Passage d'illimité à suivi : la remise à zéro passe par le
          // moteur, qui l'archive. L'écrire à la main ferait apparaître, dans
          // le journal, une correction sortie de nulle part — la vraie
          // discontinuité, elle, n'y figurerait pas.
          await this.prisma.$transaction((tx) =>
            this.stock.open(tx, {
              clubId,
              variantId: def.id,
              qty: 0,
              trackStock: true,
              reason: 'Passage en stock suivi depuis la fiche produit',
            }),
          );
        }
        await this.stock.adjust({
          clubId,
          variantId: def.id,
          countedOnHand: input.stock,
          reason: 'Saisie depuis la fiche produit',
        });
      }
      // Du stock a pu redevenir vendable, ou cesser d'être compté : les
      // précommandes en attente passent avant tout nouvel acheteur (ADR-0018).
      await this.preorders.allocateQuietly(clubId, [def.id]);
    }

    // Un seuil modifié doit pouvoir alerter de nouveau : sans cette remise à
    // zéro, un seuil relevé n'alerterait plus jamais, l'ancienne alerte
    // masquant tous les passages suivants.
    if (input.reorderThreshold !== undefined) {
      await this.prisma.shopProductVariant.updateMany({
        where: { productId: id, clubId },
        data: {
          reorderThreshold: input.reorderThreshold,
          lowStockAlertedAt: null,
        },
      });
    }

    return this.reloadProduct(clubId, id);
  }

  async deleteProduct(clubId: string, id: string): Promise<boolean> {
    const existing = await this.prisma.shopProduct.findFirst({
      where: { id, clubId },
    });
    if (!existing) return false;
    const used = await this.prisma.shopOrderLine.count({
      where: { productId: id },
    });
    if (used > 0) {
      await this.prisma.shopProduct.update({
        where: { id },
        data: { active: false },
      });
      return true;
    }
    await this.prisma.shopProduct.delete({ where: { id } });
    return true;
  }

  // --- Orders ---

  async listOrdersAdmin(clubId: string) {
    const rows = await this.prisma.shopOrder.findMany({
      where: { clubId },
      orderBy: [{ createdAt: 'desc' }],
      include: { lines: true },
    });
    return this.hydrateBuyers(rows);
  }

  async listOrdersForViewer(clubId: string, viewer: ViewerIdentity) {
    if (!viewer.memberId && !viewer.contactId) return [];
    const rows = await this.prisma.shopOrder.findMany({
      where: {
        clubId,
        ...(viewer.memberId
          ? { memberId: viewer.memberId }
          : { contactId: viewer.contactId }),
      },
      orderBy: [{ createdAt: 'desc' }],
      include: { lines: true },
    });
    // Le motif d'une annulation par le club est une note interne : il reste
    // à l'administration.
    return (await this.hydrateBuyers(rows)).map((o) => ({
      ...o,
      cancelReason: null,
    }));
  }

  async placeOrder(
    clubId: string,
    viewer: ViewerIdentity,
    input: {
      lines: Array<{ variantId: string; quantity: number }>;
      note?: string;
      /** Version des CGV montrée à l'adhérent et acceptée par lui. */
      acceptedTermsId?: string | null;
    },
  ) {
    const order = await this.prisma.$transaction((tx) =>
      this.placeOrderInTx(tx, clubId, viewer, input, {
        kind: 'MEMBER',
        acceptedTermsId: input.acceptedTermsId ?? null,
      }),
    );
    return (await this.hydrateBuyers([order]))[0];
  }

  /**
   * Cœur atomique du passage de commande : agrégation, tarification,
   * création de la commande PENDING et RÉSERVATION du stock — le tout DANS la
   * transaction fournie. Extrait de `placeOrder` pour que le checkout panier
   * puisse créer la commande ET sa facture dans une seule transaction, sans
   * dupliquer la garantie anti-survente (`ShopStockService.reserve`) ni ouvrir
   * une fenêtre où une commande existerait sans facture (ou l'inverse).
   *
   * Public pour être réutilisable par `ShopCartService.checkout` ; ne DOIT
   * être appelé que depuis un `$transaction`.
   */
  async placeOrderInTx(
    tx: Prisma.TransactionClient,
    clubId: string,
    viewer: ViewerIdentity,
    input: {
      lines: Array<{ variantId: string; quantity: number }>;
      note?: string;
    },
    terms: ShopTermsConsent,
  ): Promise<Prisma.ShopOrderGetPayload<{ include: { lines: true } }>> {
    if (!viewer.memberId && !viewer.contactId) {
      throw new ForbiddenException('Profil requis pour commander.');
    }
    if (input.lines.length === 0) {
      throw new BadRequestException('Commande vide.');
    }
    const accepted = await this.resolveTermsConsentInTx(tx, clubId, terms);

    // AGRÉGATION AVANT TOUT, et c'est un correctif, pas une optimisation.
    //
    // L'ancien code validait puis décrémentait ligne par ligne, sans jamais
    // dédoublonner : un panier [{A,3},{A,3}] sur un stock de 5 passait les
    // deux validations indépendamment, puis décrémentait deux fois. Stock
    // final −1, avec une seule requête et aucune concurrence.
    const wanted = new Map<string, number>();
    for (const l of input.lines) {
      if (!Number.isInteger(l.quantity) || l.quantity < 1) {
        throw new BadRequestException('Quantité invalide.');
      }
      wanted.set(l.variantId, (wanted.get(l.variantId) ?? 0) + l.quantity);
    }

    const variants = await tx.shopProductVariant.findMany({
      where: {
        id: { in: Array.from(wanted.keys()) },
        clubId,
        active: true,
        product: { active: true },
      },
      include: {
        product: {
          select: { id: true, name: true, priceCents: true, preorderEnabled: true },
        },
      },
    });
    if (variants.length !== wanted.size) {
      throw new BadRequestException('Article indisponible.');
    }
    const byVariantId = new Map(variants.map((v) => [v.id, v]));

    // Le prix de la variante SURCHARGE celui du produit ; null hérite.
    const unitPriceOf = (v: (typeof variants)[number]) =>
      v.priceCents ?? v.product.priceCents;
    const labelOf = (v: (typeof variants)[number]) =>
      v.label ? `${v.product.name} — ${v.label}` : v.product.name;

    let totalCents = 0;
    for (const [variantId, qty] of wanted) {
      totalCents += unitPriceOf(byVariantId.get(variantId)!) * qty;
    }

    // TRI CROISSANT DES VARIANTES — anti-interblocage.
    //
    // Deux paniers [A,B] et [B,A] verrouilleraient les lignes en ordre
    // inverse et se bloqueraient mutuellement. Trois lignes de tri suppriment
    // un incident impossible à reproduire en développement.
    const orderedIds = Array.from(wanted.keys()).sort();

    const created = await tx.shopOrder.create({
      data: {
        clubId,
        memberId: viewer.memberId ?? null,
        contactId: viewer.memberId ? null : viewer.contactId ?? null,
        status: ShopOrderStatus.PENDING,
        totalCents,
        note: input.note ?? null,
        termsAssetId: accepted?.termsAssetId ?? null,
        termsAcceptedAt: accepted?.termsAcceptedAt ?? null,
        lines: {
          create: orderedIds.map((variantId) => {
            const v = byVariantId.get(variantId)!;
            return {
              productId: v.productId,
              variantId: v.id,
              quantity: wanted.get(variantId)!,
              unitPriceCents: unitPriceOf(v),
              // Libellé FIGÉ : il survit au renommage du produit.
              label: labelOf(v),
            };
          }),
        },
      },
      include: { lines: true },
    });

    // La réservation lève si le stock manque, ce qui annule TOUTE la
    // transaction — pas de commande sans stock pris, pas de stock pris sans
    // commande.
    //
    // Sauf précommande (ADR-0018) : l'article reste commandable épuisé. On
    // réserve ce qui reste, et le manque attend l'arrivage sur la ligne — dans
    // la même transaction, donc jamais visible à moitié.
    for (const line of created.lines) {
      const reservation = {
        clubId,
        variantId: line.variantId!,
        qty: line.quantity,
        orderId: created.id,
        orderLineId: line.id,
      };
      if (!byVariantId.get(line.variantId!)!.product.preorderEnabled) {
        await this.stock.reserve(tx, reservation);
        continue;
      }
      const awaiting =
        line.quantity - (await this.stock.reserveUpTo(tx, reservation));
      if (awaiting > 0) {
        await tx.shopOrderLine.update({
          where: { id: line.id },
          data: { awaitingStockQty: awaiting },
        });
        line.awaitingStockQty = awaiting;
      }
    }
    return created;
  }

  /**
   * Passe une commande PENDING → PAID et SORT le stock, de façon IDEMPOTENTE,
   * DANS la transaction fournie. C'est le point d'entrée du webhook « facture
   * payée » (imité du branchement facture→adhésion).
   *
   * Différence avec `markOrderPaid` (admin) : ici on ne LÈVE PAS si la
   * commande n'est plus PENDING. Le webhook Stripe peut se rejouer ; un second
   * passage doit être un no-op silencieux, pas une erreur qui ferait répondre
   * 500 et boucler le rejeu. L'idempotence est portée par la BASE : la sortie
   * de stock n'a lieu que si le `updateMany` conditionnel a réellement fait
   * basculer la commande (count === 1). Un rejeu retrouve la commande déjà
   * PAID, `count === 0`, et ne décompte rien une seconde fois.
   *
   * C'est le motif garantie-derrière-effet-de-bord : la sortie de stock EST la
   * garantie. Elle vit donc dans la même transaction que l'encaissement — si
   * elle échoue, le Payment n'est pas commité et Stripe rejouera proprement.
   */
  async fulfillPaidShopOrderInTx(
    tx: Prisma.TransactionClient,
    clubId: string,
    orderId: string,
  ): Promise<void> {
    const claimed = await tx.shopOrder.updateMany({
      where: { id: orderId, clubId, status: ShopOrderStatus.PENDING },
      data: { status: ShopOrderStatus.PAID, paidAt: new Date() },
    });
    // count 0 = déjà PAID (rejeu) ou CANCELLED : rien à sortir, et surtout pas
    // une exception qui casserait le webhook.
    if (claimed.count !== 1) return;

    await this.claimFulfilmentInTx(tx, clubId, orderId, 'PAYMENT');
  }

  /**
   * LA règle de sortie de stock (ADR-0017) : la marchandise quitte le placard à
   * la PREMIÈRE des deux actions — règlement complet ou remise signée.
   *
   * Un seul endroit décide, pour tous les chemins : webhook carte, encaissement
   * manuel, « Clôturer la commande », remise signée. Arbitré par la base :
   * `fulfilledAt` n'est posé que s'il est encore NULL, et c'est le `count` de
   * cette écriture conditionnelle qui autorise la sortie. Le second des deux
   * gestes retrouve `fulfilledAt` posé et ne décompte rien.
   *
   * Le statut attendu dépend du geste, et c'est ce qui dispense de tout
   * rattrapage des commandes antérieures :
   *  - au règlement, la commande vient de passer PAID dans la même
   *    transaction ;
   *  - à la remise, seule une commande encore EN ATTENTE sort ici. Une
   *    commande déjà PAYÉE est sortie à son paiement — y compris celles payées
   *    avant l'existence de `fulfilledAt`, qui l'ont toujours NULL.
   */
  private async claimFulfilmentInTx(
    tx: Prisma.TransactionClient,
    clubId: string,
    orderId: string,
    trigger: 'PAYMENT' | 'DELIVERY',
  ): Promise<void> {
    const claimed = await tx.shopOrder.updateMany({
      where: {
        id: orderId,
        clubId,
        fulfilledAt: null,
        status:
          trigger === 'PAYMENT'
            ? ShopOrderStatus.PAID
            : ShopOrderStatus.PENDING,
      },
      data: { fulfilledAt: new Date() },
    });
    if (claimed.count !== 1) return;

    const row = await tx.shopOrder.findFirstOrThrow({
      where: { id: orderId, clubId },
      include: { lines: true },
    });
    for (const line of row.lines) {
      if (!line.variantId) continue; // ligne antérieure aux variantes
      // Seules les unités RÉSERVÉES sortent. Celles qui attendent l'arrivage
      // sortiront quand il les servira (ADR-0018) — pas deux fois.
      const qty = line.quantity - line.awaitingStockQty;
      if (qty <= 0) continue;
      await this.stock.fulfill(tx, {
        clubId,
        variantId: line.variantId,
        qty,
        orderId: row.id,
        orderLineId: line.id,
      });
    }
  }

  // --- Configuration du 3× boutique (admin) ---

  /**
   * Seuil (centimes) à partir duquel le 3× est proposé en boutique. NULL = 3×
   * désactivé. Le `clubId` est dans le WHERE de l'écriture.
   */
  async setInstallmentThreshold(
    clubId: string,
    thresholdCents: number | null,
  ): Promise<number | null> {
    if (thresholdCents !== null && (!Number.isInteger(thresholdCents) || thresholdCents < 0)) {
      throw new BadRequestException(
        'Le seuil doit être un montant positif en centimes, ou nul pour désactiver.',
      );
    }
    const updated = await this.prisma.club.update({
      where: { id: clubId },
      data: { shopInstallmentThresholdCents: thresholdCents },
      select: { shopInstallmentThresholdCents: true },
    });
    return updated.shopInstallmentThresholdCents;
  }

  async getInstallmentThreshold(clubId: string): Promise<number | null> {
    const club = await this.prisma.club.findUnique({
      where: { id: clubId },
      select: { shopInstallmentThresholdCents: true },
    });
    return club?.shopInstallmentThresholdCents ?? null;
  }

  // --- Conditions générales de vente (ADR-0017) ---

  /**
   * Les CGV en vigueur, ou null. Les mêmes pour l'admin et pour l'adhérent :
   * l'identifiant rendu est celui que l'adhérent renverra en les acceptant.
   */
  async getShopTerms(clubId: string): Promise<ShopTermsView | null> {
    const club = await this.prisma.club.findUnique({
      where: { id: clubId },
      select: {
        shopTermsUpdatedAt: true,
        shopTermsAsset: {
          select: { id: true, fileName: true, publicUrl: true },
        },
      },
    });
    const asset = club?.shopTermsAsset ?? null;
    if (!club || !asset) return null;
    return {
      id: asset.id,
      fileName: asset.fileName,
      url: asset.publicUrl,
      updatedAt: club.shopTermsUpdatedAt,
    };
  }

  /**
   * Met en ligne les CGV de la boutique, ou les retire (`null`).
   *
   * Le PDF doit appartenir au club — `clubId` DANS le `where` de la lecture — et
   * il est rendu PUBLIC dans la même transaction : l'adhérent l'ouvre dans un
   * nouvel onglet, sans jeton, et un lien en 404 lui ferait accepter un texte
   * qu'il ne peut pas lire.
   *
   * Remplacer les CGV ne supprime rien : l'ancienne version reste la preuve de
   * ce qu'ont accepté les commandes passées sous elle.
   */
  async setShopTerms(
    clubId: string,
    mediaAssetId: string | null,
  ): Promise<ShopTermsView | null> {
    if (mediaAssetId === null) {
      await this.prisma.club.update({
        where: { id: clubId },
        data: { shopTermsAssetId: null, shopTermsUpdatedAt: null },
      });
      return null;
    }
    await this.prisma.$transaction(async (tx) => {
      const asset = await tx.mediaAsset.findFirst({
        where: { id: mediaAssetId, clubId },
        select: { id: true, mimeType: true },
      });
      if (!asset) {
        throw new NotFoundException('Document introuvable.');
      }
      if (asset.mimeType !== 'application/pdf') {
        throw new BadRequestException(
          'Les conditions générales de vente doivent être un fichier PDF.',
        );
      }
      await tx.mediaAsset.updateMany({
        where: { id: asset.id, clubId },
        data: { visibility: MediaVisibility.PUBLIC },
      });
      const club = await tx.club.findUnique({
        where: { id: clubId },
        select: { shopTermsAssetId: true },
      });
      // Re-désigner la version en vigueur ne la redate pas : sa date dit
      // depuis quand les adhérents l'acceptent.
      if (club?.shopTermsAssetId === asset.id) return;
      await tx.club.update({
        where: { id: clubId },
        data: { shopTermsAssetId: asset.id, shopTermsUpdatedAt: new Date() },
      });
    });
    return this.getShopTerms(clubId);
  }

  /**
   * Décide, au passage de commande, de l'acceptation des CGV (ADR-0017).
   *
   * Lue DANS la transaction de la commande : la version contrôlée est celle
   * que la commande enregistre. Et c'est l'identifiant du PDF montré à
   * l'adhérent qui est comparé, pas un simple « j'accepte » : si le club a
   * remplacé ses CGV pendant que la fenêtre de règlement était ouverte,
   * l'adhérent a accepté un texte qui n'est plus en vigueur, et la commande
   * enregistrerait une acceptation qu'il n'a jamais donnée.
   */
  private async resolveTermsConsentInTx(
    tx: Prisma.TransactionClient,
    clubId: string,
    consent: ShopTermsConsent,
  ): Promise<{ termsAssetId: string; termsAcceptedAt: Date } | null> {
    if (consent.kind === 'COUNTER') return null;
    const club = await tx.club.findUnique({
      where: { id: clubId },
      select: { shopTermsAssetId: true },
    });
    const enVigueur = club?.shopTermsAssetId ?? null;
    if (enVigueur === null) return null;
    if (consent.acceptedTermsId === null) {
      throw new BadRequestException(
        'Acceptez les conditions générales de vente de la boutique pour ' +
          'commander. Si elles ne vous sont pas proposées, mettez à jour ' +
          'l’application.',
      );
    }
    if (consent.acceptedTermsId !== enVigueur) {
      throw new BadRequestException(
        'Les conditions générales de vente de la boutique viennent d’être ' +
          'mises à jour : relisez-les et acceptez-les à nouveau.',
      );
    }
    return { termsAssetId: enVigueur, termsAcceptedAt: new Date() };
  }

  /**
   * Vente au comptoir : le club vend un article sur place, sans que l'adhérent
   * passe par son panier.
   *
   * Sans ce chemin, un club qui vend un kimono au dojo n'avait AUCUN moyen de
   * l'enregistrer. Seul le portail sait créer une commande, et l'admin ne sait
   * pas créer de facture libre : la recette restait hors des livres.
   *
   * Trois choix qui distinguent cette vente du passage en caisse du portail :
   *
   *  - La facture porte `shopOrderId`. C'est CE champ qui fait comptabiliser
   *    la recette en 708000 (ventes) plutôt qu'en 706100 (cotisations).
   *  - `lockedPaymentMethod` reste NULL, là où le portail le fige sur
   *    STRIPE_CARD : au comptoir on paie en espèces ou par chèque, et un mode
   *    figé sur la carte interdirait la saisie du règlement réel.
   *  - `familyId` est résolu depuis l'acheteur, ce que le portail ne fait pas.
   *    Sans lui, la facture n'apparaît sous aucun payeur et devient
   *    introuvable dans un écran de facturation qui en compte des dizaines.
   *
   * La commande reste PENDING et le stock RÉSERVÉ. Le club la marque payée
   * quand l'argent est là, ce qui sort la marchandise du placard : l'argent et
   * la marchandise sont deux faits distincts, on ne les confond pas. L'article
   * n'est pour autant pas revendable entre-temps — `available` a déjà baissé à
   * la réservation.
   */
  async recordCounterSale(
    clubId: string,
    input: {
      memberId?: string | null;
      contactId?: string | null;
      lines: Array<{ variantId: string; quantity: number }>;
      note?: string | null;
    },
  ) {
    const buyer = await this.resolveBuyerInClub(clubId, input);

    return this.prisma.$transaction(async (tx) => {
      const order = await this.placeOrderInTx(
        tx,
        clubId,
        { memberId: buyer.memberId, contactId: buyer.contactId },
        { lines: input.lines, note: input.note ?? undefined },
        { kind: 'COUNTER' },
      );
      const invoice = await this.createOrderInvoiceInTx(tx, clubId, order, {
        labelPrefix: 'Vente boutique',
      });
      return {
        orderId: order.id,
        invoiceId: invoice.id,
        totalCents: order.totalCents,
      };
    });
  }

  /**
   * La facture d'une commande boutique, définie en UN endroit.
   *
   * Trois chemins créent des commandes — le panier en ligne, le « régler sur
   * place » et la vente au comptoir — et la facture doit être la même partout
   * sur ce qui compte. `shopOrderId` décide du compte de produit : trois
   * copies de cette ligne, c'est la garantie qu'un chemin finira par
   * l'oublier. Ce n'est pas une crainte abstraite, c'est déjà arrivé pour
   * `familyId`, que le panier en ligne ne posait pas — sa facture
   * n'apparaissait alors sous aucun payeur.
   *
   * `lockedPaymentMethod` n'est posé que si l'appelant le demande : seul le
   * paiement en ligne impose la carte. Un règlement sur place ou au comptoir
   * se fait en espèces ou par chèque, et un mode figé l'interdirait.
   */
  async createOrderInvoiceInTx(
    tx: Prisma.TransactionClient,
    clubId: string,
    order: {
      id: string;
      totalCents: number;
      memberId: string | null;
      contactId: string | null;
    },
    opts?: {
      labelPrefix?: string;
      installmentsCount?: number;
      lockedPaymentMethod?: ClubPaymentMethod | null;
    },
  ): Promise<{ id: string }> {
    const buyer = await this.describeOrderBuyer(tx, clubId, order);
    return tx.invoice.create({
      data: {
        clubId,
        familyId: buyer.familyId,
        label: `${opts?.labelPrefix ?? 'Commande boutique'} — ${buyer.label}`,
        baseAmountCents: order.totalCents,
        amountCents: order.totalCents,
        status: InvoiceStatus.OPEN,
        installmentsCount: opts?.installmentsCount ?? 1,
        ...(opts?.lockedPaymentMethod
          ? { lockedPaymentMethod: opts.lockedPaymentMethod }
          : {}),
        shopOrderId: order.id,
      },
      select: { id: true },
    });
  }

  /**
   * Qui a commandé, et sous quel foyer sa facture doit apparaître.
   *
   * Lu depuis la COMMANDE et non depuis l'appelant : c'est elle qui porte
   * l'acheteur, donc la facture ne peut pas se retrouver au nom de quelqu'un
   * d'autre par une étourderie de paramètre.
   */
  private async describeOrderBuyer(
    tx: Prisma.TransactionClient,
    clubId: string,
    order: { memberId: string | null; contactId: string | null },
  ): Promise<{ label: string; familyId: string | null }> {
    if (order.memberId) {
      const member = await tx.member.findFirst({
        where: { id: order.memberId, clubId },
        select: { firstName: true, lastName: true },
      });
      const fm = await tx.familyMember.findFirst({
        where: { memberId: order.memberId, family: { clubId } },
        select: { familyId: true },
      });
      return {
        label: member
          ? `${member.firstName} ${member.lastName}`.trim()
          : 'adhérent',
        familyId: fm?.familyId ?? null,
      };
    }
    if (order.contactId) {
      const contact = await tx.contact.findFirst({
        where: { id: order.contactId, clubId },
        select: { firstName: true, lastName: true },
      });
      return {
        label: contact
          ? `${contact.firstName} ${contact.lastName}`.trim()
          : 'contact',
        familyId: null,
      };
    }
    return { label: 'acheteur inconnu', familyId: null };
  }

  /**
   * L'acheteur d'une vente au comptoir est DÉSIGNÉ par l'admin, il ne vient
   * pas d'un jeton. `placeOrderInTx` ne vérifie que les articles, pas
   * l'acheteur — sans ce contrôle, une vente pourrait être rattachée à
   * l'adhérent d'un autre club.
   */
  private async resolveBuyerInClub(
    clubId: string,
    input: { memberId?: string | null; contactId?: string | null },
  ): Promise<{
    memberId: string | null;
    contactId: string | null;
    familyId: string | null;
    label: string;
  }> {
    if (input.memberId) {
      const member = await this.prisma.member.findFirst({
        where: { id: input.memberId, clubId },
        select: { id: true, firstName: true, lastName: true },
      });
      if (!member) {
        throw new BadRequestException('Adhérent introuvable dans ce club.');
      }
      const fm = await this.prisma.familyMember.findFirst({
        where: { memberId: member.id, family: { clubId } },
        select: { familyId: true },
      });
      return {
        memberId: member.id,
        contactId: null,
        familyId: fm?.familyId ?? null,
        label: `${member.firstName} ${member.lastName}`.trim(),
      };
    }
    if (input.contactId) {
      const contact = await this.prisma.contact.findFirst({
        where: { id: input.contactId, clubId },
        select: { id: true, firstName: true, lastName: true },
      });
      if (!contact) {
        throw new BadRequestException('Contact introuvable dans ce club.');
      }
      return {
        memberId: null,
        contactId: contact.id,
        familyId: null,
        label: `${contact.firstName} ${contact.lastName}`.trim(),
      };
    }
    throw new BadRequestException('Acheteur requis.');
  }

  /**
   * PENDING → PAID. Aucune autre transition n'est permise.
   *
   * L'ancien code ne testait AUCUN statut : une commande annulée — dont le
   * stock avait déjà été rendu — pouvait repasser payée, vendant l'article une
   * seconde fois. Le statut attendu est désormais dans le WHERE de l'écriture,
   * donc arbitré par la base et non par un `if` lu hors transaction.
   */
  async markOrderPaid(clubId: string, orderId: string) {
    const updated = await this.prisma.$transaction(async (tx) => {
      // Une commande qui a une facture À ENCAISSER ne se marque plus payée
      // d'un clic. Ce raccourci basculait le statut et sortait le stock sans
      // créer aucun paiement : la commande affichait « Payée », la facture
      // restait « À payer », et la comptabilité ne recevait rien. Encaisser la
      // facture fait désormais tout — argent, n° de chèque, écriture ET
      // clôture de la commande.
      //
      // Restent permises : la commande sans facture (antérieure au 2026-09-12,
      // quand « régler sur place » n'en produisait pas) et la commande dont la
      // facture est déjà payée, où il ne reste qu'à sortir la marchandise. Le
      // contrôle vit côté serveur pour valoir aussi pour un onglet
      // d'administration resté ouvert sur l'ancien écran.
      const aEncaisser = await tx.invoice.findFirst({
        where: { shopOrderId: orderId, clubId, status: InvoiceStatus.OPEN },
        select: { id: true },
      });
      if (aEncaisser) {
        throw new BadRequestException(
          'Cette commande a une facture à encaisser : enregistre le paiement ' +
            'dans Facturation. C’est lui qui clôture la commande et écrit la ' +
            'comptabilité.',
        );
      }

      const claimed = await tx.shopOrder.updateMany({
        where: { id: orderId, clubId, status: ShopOrderStatus.PENDING },
        data: { status: ShopOrderStatus.PAID, paidAt: new Date() },
      });
      if (claimed.count !== 1) {
        await this.assertTransitionRefused(tx, clubId, orderId, 'payer');
      }

      // Sortie physique, sauf si la remise signée l'a déjà faite.
      await this.claimFulfilmentInTx(tx, clubId, orderId, 'PAYMENT');

      return tx.shopOrder.findFirstOrThrow({
        where: { id: orderId, clubId },
        include: { lines: true },
      });
    });
    return (await this.hydrateBuyers([updated]))[0];
  }

  /**
   * PENDING → CANCELLED, sans aucun encaissement. Une commande payée, ou
   * partiellement réglée, passe par « Annuler et rembourser »
   * (`ShopOrderRefundsService`, ADR-0019) : il faut rendre l'argent.
   */
  async cancelOrder(clubId: string, orderId: string) {
    const { row: updated, released } = await this.prisma.$transaction(async (tx) => {
      // `fulfilledAt: null` : une commande REMISE avant d'être payée n'a plus de
      // réservation à libérer — la marchandise est partie. L'annuler rendrait au
      // stock vendable des articles qui ne sont plus dans le placard.
      const claimed = await tx.shopOrder.updateMany({
        where: {
          id: orderId,
          clubId,
          status: ShopOrderStatus.PENDING,
          fulfilledAt: null,
          ...WITHOUT_PAYMENT,
        },
        data: {
          status: ShopOrderStatus.CANCELLED,
          cancelledAt: new Date(),
        },
      });
      if (claimed.count !== 1) {
        await this.assertTransitionRefused(tx, clubId, orderId, 'annuler');
      }

      const row = await tx.shopOrder.findFirstOrThrow({
        where: { id: orderId, clubId },
        include: { lines: true },
      });

      const freed = await this.releaseReservationsInTx(tx, clubId, row);

      // La facture suit, comme à l'annulation par l'adhérent (ADR-0019). La
      // garde « aucun encaissement » est aussi dans CETTE écriture : une
      // facture qui porte un paiement ne s'annule jamais.
      await tx.invoice.updateMany({
        where: {
          shopOrderId: row.id,
          clubId,
          status: InvoiceStatus.OPEN,
          payments: { none: {} },
        },
        data: {
          status: InvoiceStatus.VOID,
          voidReason: 'Commande annulée par le club.',
        },
      });
      return { row, released: freed };
    });
    // Le stock rendu sert d'abord les précommandes en attente (ADR-0018).
    await this.preorders.allocateQuietly(clubId, released);
    return (await this.hydrateBuyers([updated]))[0];
  }

  /**
   * PENDING → CANCELLED déclenché par LE PROPRIÉTAIRE de la commande (viewer),
   * qui libère le stock réservé et met la facture liée à VOID.
   *
   * MÊME logique que `cancelOrder` (admin), mais l'appartenance viewer entre
   * DANS le `where` de l'écriture conditionnelle : `id` + `clubId` + `status`
   * PENDING + (`memberId` XOR `contactId`). C'est le `count` de l'`updateMany`
   * qui arbitre — pas un `findFirst` lu hors transaction. Un membre ne peut
   * donc pas annuler la commande d'un autre : le prédicat ne mord pas, count=0,
   * on refuse.
   *
   * IDEMPOTENT : un second appel voit la commande déjà CANCELLED, l'`updateMany`
   * conditionnel renvoie count=0 et l'on n'atteint JAMAIS la libération de
   * stock — le stock n'est donc relâché qu'une fois. Cette garantie est portée
   * par le WHERE de la base (db push : ni CHECK ni trigger — ADR-0003), pas par
   * un `if` applicatif.
   *
   * La facture liée passe à VOID dans la MÊME transaction : sans cela, une
   * facture OPEN survivrait à une commande annulée (et un paiement tardif la
   * solderait). Voidée conditionnellement (status OPEN dans le where) pour ne
   * jamais rétrograder une facture déjà payée.
   */
  async cancelOrderForViewer(
    clubId: string,
    viewer: ViewerIdentity,
    orderId: string,
  ) {
    const memberId = viewer.memberId ?? null;
    const contactId = viewer.contactId ?? null;
    if (!memberId && !contactId) {
      throw new ForbiddenException('Profil requis pour annuler une commande.');
    }
    const { row: updated, released } = await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.shopOrder.updateMany({
        where: {
          id: orderId,
          clubId,
          status: ShopOrderStatus.PENDING,
          // Remise avant paiement : la marchandise est partie, rien à libérer.
          fulfilledAt: null,
          ...(memberId ? { memberId } : { contactId }),
          // Un règlement déjà encaissé se rend : c'est un geste du club
          // (ADR-0019), pas une annulation depuis le portail.
          ...WITHOUT_PAYMENT,
        },
        data: {
          status: ShopOrderStatus.CANCELLED,
          cancelledAt: new Date(),
        },
      });
      if (claimed.count !== 1) {
        await this.assertViewerCancelRefused(tx, clubId, viewer, orderId);
      }

      const row = await tx.shopOrder.findFirstOrThrow({
        where: { id: orderId, clubId },
        include: { lines: true },
      });

      // Libère la réservation faite au checkout. `available` remonte, `onHand`
      // n'a jamais bougé (la marchandise n'était que réservée).
      const freed = await this.releaseReservationsInTx(tx, clubId, row);

      // Facture liée → VOID, dans la MÊME transaction. Scopée par
      // `shopOrderId` + `clubId` + `status OPEN` : une facture déjà PAID n'est
      // pas rétrogradée (le cas ne peut d'ailleurs pas se produire, la commande
      // n'aurait pas été PENDING).
      await tx.invoice.updateMany({
        where: {
          shopOrderId: row.id,
          clubId,
          status: InvoiceStatus.OPEN,
          payments: { none: {} },
        },
        data: {
          status: InvoiceStatus.VOID,
          voidReason: 'Commande annulée par le membre.',
        },
      });

      return { row, released: freed };
    });
    await this.preorders.allocateQuietly(clubId, released);
    return (await this.hydrateBuyers([updated]))[0];
  }

  /**
   * Libère ce qu'une commande annulée tenait en réserve, et renvoie les
   * déclinaisons dont du stock est redevenu vendable.
   *
   * Seules les unités RÉSERVÉES sont rendues : celles qui attendaient
   * l'arrivage n'ont jamais été prises (ADR-0018). Leur attente est remise à
   * zéro dans la même transaction — une commande annulée n'attend plus rien,
   * et aucun arrivage ne doit plus la servir.
   */
  private async releaseReservationsInTx(
    tx: Prisma.TransactionClient,
    clubId: string,
    order: Prisma.ShopOrderGetPayload<{ include: { lines: true } }>,
  ): Promise<string[]> {
    const released: string[] = [];
    for (const line of order.lines) {
      if (!line.variantId) continue;
      const qty = line.quantity - line.awaitingStockQty;
      if (qty <= 0) continue;
      await this.stock.release(tx, {
        clubId,
        variantId: line.variantId,
        qty,
        orderId: order.id,
        orderLineId: line.id,
      });
      released.push(line.variantId);
    }
    await this.clearAwaitingInTx(tx, order);
    return released;
  }

  /** Une commande annulée n'attend plus rien : aucun arrivage ne doit la servir. */
  private async clearAwaitingInTx(
    tx: Prisma.TransactionClient,
    order: Prisma.ShopOrderGetPayload<{ include: { lines: true } }>,
  ): Promise<void> {
    if (!order.lines.some((l) => l.awaitingStockQty > 0)) return;
    await tx.shopOrderLine.updateMany({
      where: { orderId: order.id, awaitingStockQty: { gt: 0 } },
      data: { awaitingStockQty: 0 },
    });
    for (const line of order.lines) line.awaitingStockQty = 0;
  }

  /**
   * Annulation par le CLUB d'une commande, payée ou non, remise ou non
   * (ADR-0019) : la commande et le stock. L'argent est traité par l'appelant
   * (`ShopOrderRefundsService`, module paiements), dans la MÊME transaction.
   *
   * L'écriture conditionnelle porte l'état LU pour le plan montré à l'admin —
   * statut, sortie du stock, remise. Si la commande a changé entre l'aperçu et
   * la confirmation, rien n'est écrit : le plan ne vaut plus.
   *
   * Marchandise :
   *  - seulement réservée : libérée ;
   *  - sortie du stock (payée, ou remise) : retour client, suivi d'une perte
   *    pour les lignes que l'admin déclare abîmées ;
   *  - en attente d'arrivage : l'attente s'éteint.
   *
   * Une commande remise exige que l'adhérent ait rapporté les articles : le
   * club ne reprend en stock que ce qu'il a récupéré.
   *
   * Renvoie la commande annulée et les déclinaisons redevenues vendables,
   * servies aux précommandes APRÈS le commit (ADR-0018).
   */
  async cancelWithReturnInTx(
    tx: Prisma.TransactionClient,
    clubId: string,
    userId: string,
    input: {
      orderId: string;
      reason: string;
      goodsReturned: boolean;
      /** Lignes dont l'article rendu est déclaré perdu. */
      lostLineIds: string[];
      expected: {
        status: ShopOrderStatus;
        fulfilled: boolean;
        delivered: boolean;
      };
    },
  ): Promise<{
    order: Prisma.ShopOrderGetPayload<{ include: { lines: true } }>;
    released: string[];
  }> {
    const reason = input.reason.trim();
    if (!reason) {
      throw new BadRequestException('Indique le motif de l’annulation.');
    }
    if (input.expected.status === ShopOrderStatus.CANCELLED) {
      throw new BadRequestException('Cette commande est déjà annulée.');
    }
    if (input.expected.delivered && !input.goodsReturned) {
      throw new BadRequestException(
        'Cette commande a été remise : l’adhérent doit rapporter les articles pour qu’elle soit annulée.',
      );
    }

    const claimed = await tx.shopOrder.updateMany({
      where: {
        id: input.orderId,
        clubId,
        status: input.expected.status,
        fulfilledAt: input.expected.fulfilled ? { not: null } : null,
        deliveredAt: input.expected.delivered ? { not: null } : null,
      },
      data: {
        status: ShopOrderStatus.CANCELLED,
        cancelledAt: new Date(),
        cancelReason: reason,
        cancelledByUserId: userId,
      },
    });
    if (claimed.count !== 1) {
      const current = await tx.shopOrder.findFirst({
        where: { id: input.orderId, clubId },
        select: { status: true },
      });
      if (!current) throw new NotFoundException('Commande introuvable');
      throw new BadRequestException(
        current.status === ShopOrderStatus.CANCELLED
          ? 'Cette commande est déjà annulée.'
          : 'Cette commande vient de changer : recharge la page avant de l’annuler.',
      );
    }

    const order = await tx.shopOrder.findFirstOrThrow({
      where: { id: input.orderId, clubId },
      include: { lines: true },
    });
    const lost = new Set(input.lostLineIds);
    for (const lineId of lost) {
      if (!order.lines.some((l) => l.id === lineId)) {
        throw new BadRequestException('Une ligne déclarée perdue n’appartient pas à cette commande.');
      }
    }

    const exited =
      input.expected.status === ShopOrderStatus.PAID || input.expected.fulfilled;
    if (!exited) {
      if (lost.size > 0) {
        throw new BadRequestException(
          'Rien n’a quitté le club sur cette commande : aucun article ne peut être déclaré perdu.',
        );
      }
      const released = await this.releaseReservationsInTx(tx, clubId, order);
      return { order, released };
    }

    const released: string[] = [];
    for (const line of order.lines) {
      if (!line.variantId) continue;
      const qty = line.quantity - line.awaitingStockQty;
      if (qty <= 0) continue;
      const tracked = await this.stock.returnToStock(tx, {
        clubId,
        variantId: line.variantId,
        qty,
        orderId: order.id,
        orderLineId: line.id,
        userId,
        reason: `Retour client : ${reason}`,
      });
      if (!tracked) continue;
      if (lost.has(line.id)) {
        await this.stock.recordShrinkage(
          {
            clubId,
            variantId: line.variantId,
            qty,
            userId,
            reason: `Article rendu déclaré perdu : ${reason}`,
            orderId: order.id,
            orderLineId: line.id,
          },
          tx,
        );
      } else {
        released.push(line.variantId);
      }
    }
    await this.clearAwaitingInTx(tx, order);
    return { order, released };
  }

  /** Une commande sous sa forme d'administration, après un geste fait hors de ce service. */
  async getOrderAdmin(clubId: string, orderId: string) {
    const row = await this.prisma.shopOrder.findFirstOrThrow({
      where: { id: orderId, clubId },
      include: { lines: true },
    });
    return (await this.hydrateBuyers([row]))[0];
  }

  // --- Remise signée (ADR-0017) ---

  /** Au-delà, ce n'est plus une signature au doigt : on refuse. */
  static readonly DELIVERY_SIGNATURE_MAX_CHARS = 400_000;

  /** Les 8 octets par lesquels commence tout fichier PNG. */
  private static readonly PNG_SIGNATURE = Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  ]);

  /**
   * Remet la commande à l'adhérent, qui signe sur le téléphone de l'admin.
   *
   * Une seule écriture porte toute la preuve : date, admin, signataire et
   * signature PNG, conditionnés à `deliveredAt: null` — c'est aussi elle qui
   * arbitre une double remise. La marchandise sort ensuite du stock si la
   * commande n'était pas encore payée : la remise est alors la première des
   * deux actions.
   *
   * Remise AVANT paiement permise : le règlement peut suivre, en ligne ou sur
   * place. Commande annulée : refusée. Commande dont un article attend encore
   * l'arrivage (ADR-0018) : refusée aussi — la personne signerait un bon qui
   * ne dit pas ce qui reste dû.
   *
   * Vente au comptoir, ou commande antérieure aux CGV : si le club a des CGV en
   * ligne et que la commande n'en porte aucune acceptation, c'est la signature
   * qui la porte. L'écran de remise le dit à la personne qui signe, et le bon
   * de livraison l'écrit.
   */
  async deliverOrder(
    clubId: string,
    userId: string,
    input: { orderId: string; signerName: string; signaturePng: string },
  ) {
    const signerName = input.signerName.trim();
    if (signerName.length === 0 || signerName.length > 160) {
      throw new BadRequestException(
        'Indique le nom de la personne qui retire la commande (160 caractères au plus).',
      );
    }
    // Un base64 bien formé ne suffit pas : on vérifie que ce sont bien les
    // octets d'un PNG. Le bon de livraison sait survivre à une image abîmée,
    // mais ce qui est figé comme preuve doit au moins être une image.
    const base64 = input.signaturePng.slice(input.signaturePng.indexOf(',') + 1);
    if (
      input.signaturePng.length > ShopService.DELIVERY_SIGNATURE_MAX_CHARS ||
      !/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(input.signaturePng) ||
      !Buffer.from(base64.slice(0, 12), 'base64')
        .subarray(0, 8)
        .equals(ShopService.PNG_SIGNATURE)
    ) {
      throw new BadRequestException(
        'Signature illisible : fais signer de nouveau.',
      );
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const now = new Date();
      const claimed = await tx.shopOrder.updateMany({
        where: {
          id: input.orderId,
          clubId,
          deliveredAt: null,
          status: { in: [ShopOrderStatus.PENDING, ShopOrderStatus.PAID] },
          // Précommande (ADR-0018) : on ne remet pas ce qui n'est pas arrivé.
          lines: { none: { awaitingStockQty: { gt: 0 } } },
        },
        data: {
          deliveredAt: now,
          deliveredByUserId: userId,
          deliverySignerName: signerName,
          deliverySignaturePng: input.signaturePng,
        },
      });
      if (claimed.count !== 1) {
        // Lecture APRÈS l'échec : elle n'arbitre rien, elle nomme le refus.
        const current = await tx.shopOrder.findFirst({
          where: { id: input.orderId, clubId },
          select: {
            status: true,
            deliveredAt: true,
            lines: { select: { awaitingStockQty: true } },
          },
        });
        if (!current) throw new NotFoundException('Commande introuvable');
        throw new BadRequestException(
          current.status === ShopOrderStatus.CANCELLED
            ? 'Impossible de remettre cette commande : elle est annulée.'
            : current.deliveredAt
              ? 'Cette commande a déjà été remise.'
              : current.lines.some((l) => l.awaitingStockQty > 0)
                ? 'Impossible de remettre cette commande : des articles sont ' +
                  'encore en attente d’arrivage. Remets-la quand tout est arrivé.'
                : 'Cette commande vient de changer : recharge la page.',
        );
      }

      const club = await tx.club.findUnique({
        where: { id: clubId },
        select: { shopTermsAssetId: true },
      });
      if (club?.shopTermsAssetId) {
        // Conditionnel : une acceptation déjà donnée à la commande reste celle
        // qui fait foi, même si le club a remplacé ses CGV depuis.
        await tx.shopOrder.updateMany({
          where: { id: input.orderId, clubId, termsAcceptedAt: null },
          data: { termsAssetId: club.shopTermsAssetId, termsAcceptedAt: now },
        });
      }

      await this.claimFulfilmentInTx(tx, clubId, input.orderId, 'DELIVERY');

      return tx.shopOrder.findFirstOrThrow({
        where: { id: input.orderId, clubId },
        include: { lines: true },
      });
    });
    return (await this.hydrateBuyers([updated]))[0];
  }

  /**
   * Les données du bon de livraison, telles que figées à la remise. `null` si
   * la commande n'existe pas dans ce club ou n'a pas été remise : le bon
   * n'existe qu'une fois la signature recueillie.
   */
  async getDeliveryNote(
    clubId: string,
    orderId: string,
  ): Promise<ShopDeliveryNoteData | null> {
    const order = await this.prisma.shopOrder.findFirst({
      where: { id: orderId, clubId, deliveredAt: { not: null } },
      include: {
        lines: true,
        club: { select: { name: true, siret: true, address: true } },
        termsAsset: { select: { fileName: true } },
      },
    });
    if (!order?.deliveredAt || !order.deliverySignaturePng) return null;

    const [shaped] = await this.hydrateBuyers([order]);
    const buyerName =
      `${shaped.buyerFirstName ?? ''} ${shaped.buyerLastName ?? ''}`.trim() ||
      null;
    const png = order.deliverySignaturePng;
    return {
      club: {
        name: order.club.name,
        siret: order.club.siret ?? null,
        address: order.club.address ?? null,
      },
      order: {
        reference: `CMD-${order.id.slice(0, 8).toUpperCase()}`,
        createdAt: order.createdAt,
        totalCents: order.totalCents,
        paid: order.status === ShopOrderStatus.PAID,
        paidAt: order.paidAt,
        lines: order.lines.map((l) => ({
          quantity: l.quantity,
          label: l.label,
          unitPriceCents: l.unitPriceCents,
        })),
      },
      buyerName,
      delivery: {
        deliveredAt: order.deliveredAt,
        signerName: order.deliverySignerName ?? '',
        signaturePng: Buffer.from(png.slice(png.indexOf(',') + 1), 'base64'),
      },
      terms:
        order.termsAcceptedAt && order.termsAsset
          ? {
              fileName: order.termsAsset.fileName,
              acceptedAt: order.termsAcceptedAt,
            }
          : null,
    };
  }

  /**
   * Explique POURQUOI l'annulation viewer a été refusée, une fois qu'elle l'a
   * été. Scopée par `clubId` + identité viewer pour ne pas divulguer la
   * commande d'un autre. Arrive APRÈS l'échec de l'écriture conditionnelle :
   * elle n'arbitre rien, elle ne fait que nommer le refus.
   */
  private async assertViewerCancelRefused(
    tx: Prisma.TransactionClient,
    clubId: string,
    viewer: ViewerIdentity,
    orderId: string,
  ): Promise<never> {
    const memberId = viewer.memberId ?? null;
    const contactId = viewer.contactId ?? null;
    const current = await tx.shopOrder.findFirst({
      where: {
        id: orderId,
        clubId,
        ...(memberId ? { memberId } : { contactId }),
      },
      select: {
        status: true,
        deliveredAt: true,
        invoice: { select: { payments: { select: { id: true }, take: 1 } } },
      },
    });
    if (!current) throw new NotFoundException('Commande introuvable');
    const raison =
      current.status === ShopOrderStatus.PAID
        ? 'elle est déjà payée'
        : current.status === ShopOrderStatus.CANCELLED
          ? 'elle est déjà annulée'
          : current.deliveredAt
            ? 'elle vous a déjà été remise, adressez-vous au club'
            : (current.invoice?.payments.length ?? 0) > 0
              ? 'un règlement a déjà été encaissé, adressez-vous au club pour être remboursé'
              : 'elle vient de changer, rechargez la page';
    throw new BadRequestException(
      `Impossible d’annuler cette commande : ${raison}.`,
    );
  }

  /**
   * Explique POURQUOI une transition a été refusée, une fois qu'elle l'a été.
   *
   * La lecture arrive après l'échec de l'écriture conditionnelle, donc elle
   * n'arbitre rien — elle ne sert qu'à produire un message utile. Lever un
   * « commande introuvable » sur une commande déjà payée enverrait le
   * trésorier chercher au mauvais endroit.
   */
  private async assertTransitionRefused(
    tx: Prisma.TransactionClient,
    clubId: string,
    orderId: string,
    verb: string,
  ): Promise<never> {
    const current = await tx.shopOrder.findFirst({
      where: { id: orderId, clubId },
      select: {
        status: true,
        deliveredAt: true,
        invoice: { select: { payments: { select: { id: true }, take: 1 } } },
      },
    });
    if (!current) throw new NotFoundException('Commande introuvable');
    const raison =
      current.status === ShopOrderStatus.PAID
        ? 'elle est déjà payée'
        : current.status === ShopOrderStatus.CANCELLED
          ? 'elle est déjà annulée'
          : current.deliveredAt
            ? 'elle a déjà été remise à l’adhérent'
            : (current.invoice?.payments.length ?? 0) > 0
              ? 'un règlement a été encaissé, utilise « Annuler et rembourser »'
              : 'elle vient de changer, rechargez la page';
    const de = /^[aeiou]/.test(verb) ? 'd’' : 'de ';
    throw new BadRequestException(
      `Impossible ${de}${verb} cette commande : ${raison}.`,
    );
  }

  private async hydrateBuyers(
    orders: Array<
      Prisma.ShopOrderGetPayload<{ include: { lines: true } }>
    >,
  ) {
    const memberIds = Array.from(
      new Set(orders.map((o) => o.memberId).filter((v): v is string => !!v)),
    );
    const contactIds = Array.from(
      new Set(orders.map((o) => o.contactId).filter((v): v is string => !!v)),
    );
    const [members, contacts] = await Promise.all([
      memberIds.length > 0
        ? this.prisma.member.findMany({
            where: { id: { in: memberIds } },
            select: { id: true, firstName: true, lastName: true, email: true },
          })
        : Promise.resolve([]),
      contactIds.length > 0
        ? this.prisma.contact.findMany({
            where: { id: { in: contactIds } },
            select: {
              id: true,
              firstName: true,
              lastName: true,
              user: { select: { email: true } },
            },
          })
        : Promise.resolve([]),
    ]);
    const memberById = new Map(members.map((m) => [m.id, m]));
    const contactById = new Map(contacts.map((c) => [c.id, c]));

    // Une commande est « payable en ligne » si elle porte une facture OUVERTE.
    // C'est ce booléen — et non le seul statut PENDING — qui permet aux écrans
    // de n'afficher « Payer » que là où le repaiement aboutira.
    //
    // Les commandes « réglées sur place » en portent désormais une, elles
    // aussi : sans facture, l'argent remis au club n'entrait dans aucune
    // écriture. Un adhérent qui avait choisi de régler sur place voit donc
    // maintenant « Payer » — et c'est tant mieux : il peut changer d'avis, et
    // le double règlement est impossible, la seconde saisie se heurtant à une
    // facture déjà soldée.
    const orderIds = orders.map((o) => o.id);
    // LA facture de chaque commande (`shopOrderId` est unique), quel que soit
    // son statut. L'écran d'administration en a besoin pour proposer
    // « Encaisser » et ouvrir directement le tiroir de la facture, au lieu de
    // la chercher parmi toutes celles du club.
    const orderInvoices =
      orderIds.length > 0
        ? await this.prisma.invoice.findMany({
            where: { shopOrderId: { in: orderIds } },
            select: { id: true, shopOrderId: true, status: true },
          })
        : [];
    const invoiceByOrderId = new Map<
      string,
      { id: string; status: InvoiceStatus }
    >();
    for (const inv of orderInvoices) {
      if (inv.shopOrderId) {
        invoiceByOrderId.set(inv.shopOrderId, { id: inv.id, status: inv.status });
      }
    }

    return orders.map((o) => {
      let first: string | null = null;
      let last: string | null = null;
      let email: string | null = null;
      if (o.memberId && memberById.has(o.memberId)) {
        const m = memberById.get(o.memberId)!;
        first = m.firstName;
        last = m.lastName;
        email = m.email ?? null;
      } else if (o.contactId && contactById.has(o.contactId)) {
        const c = contactById.get(o.contactId)!;
        first = c.firstName;
        last = c.lastName;
        // Un contact n'a pas d'adresse propre : c'est celle de son compte.
        email = c.user?.email ?? null;
      }
      return {
        id: o.id,
        clubId: o.clubId,
        memberId: o.memberId,
        contactId: o.contactId,
        status: o.status,
        totalCents: o.totalCents,
        note: o.note,
        createdAt: o.createdAt,
        updatedAt: o.updatedAt,
        paidAt: o.paidAt,
        cancelledAt: o.cancelledAt,
        cancelReason: o.cancelReason,
        termsAcceptedAt: o.termsAcceptedAt,
        fulfilledAt: o.fulfilledAt,
        deliveredAt: o.deliveredAt,
        deliverySignerName: o.deliverySignerName,
        payableOnline:
          invoiceByOrderId.get(o.id)?.status === InvoiceStatus.OPEN,
        invoiceId: invoiceByOrderId.get(o.id)?.id ?? null,
        invoiceStatus: invoiceByOrderId.get(o.id)?.status ?? null,
        lines: o.lines.map((l) => ({
          id: l.id,
          orderId: l.orderId,
          productId: l.productId,
          variantId: l.variantId,
          quantity: l.quantity,
          unitPriceCents: l.unitPriceCents,
          label: l.label,
          awaitingStockQty: l.awaitingStockQty,
        })),
        buyerFirstName: first,
        buyerLastName: last,
        buyerEmail: email,
      };
    });
  }
}
