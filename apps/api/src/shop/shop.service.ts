import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, ShopOrderStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ShopPurchaseOrdersService } from './shop-purchase-orders.service';
import { ShopStockService } from './shop-stock.service';

type ViewerIdentity = {
  memberId?: string | null;
  contactId?: string | null;
};

@Injectable()
export class ShopService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly stock: ShopStockService,
    private readonly purchases: ShopPurchaseOrdersService,
  ) {}

  // --- Products ---

  async listProductsAdmin(clubId: string) {
    const rows = await this.prisma.shopProduct.findMany({
      where: { clubId },
      orderBy: [{ active: 'desc' }, { createdAt: 'desc' }],
      include: { variants: { orderBy: { createdAt: 'asc' } } },
    });
    const onOrder = await this.onOrderFor(clubId, rows);
    return rows.map((p) => this.shapeProduct(p, { withQuantities: true, onOrder }));
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
    const onOrder = await this.onOrderFor(clubId, [row]);
    return this.shapeProduct(row, { withQuantities: true, onOrder });
  }

  /**
   * Encours fournisseur des déclinaisons affichées (ADR-0013 §4).
   *
   * Une seule requête pour tout l'écran : le calcul est DÉRIVÉ, donc il ne
   * doit pas coûter une requête par ligne. Jamais appelé sur le chemin
   * PUBLIC — l'acheteur n'a pas à connaître l'encours d'achat du club.
   */
  private onOrderFor(
    clubId: string,
    products: Array<{ variants: Array<{ id: string }> }>,
  ) {
    return this.purchases.onOrderByVariant(
      clubId,
      products.flatMap((p) => p.variants.map((v) => v.id)),
    );
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
    opts: { withQuantities: boolean; onOrder?: Map<string, number> },
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
      variants: variants.map((v) => this.shapeVariant(v, priceOf(v), opts)),
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
    opts: { withQuantities: boolean; onOrder?: Map<string, number> },
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
      avgCostCents,
      marginCents,
      marginRate,
      inStock: !v.trackStock || v.available > 0,
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
    return this.hydrateBuyers(rows);
  }

  async placeOrder(
    clubId: string,
    viewer: ViewerIdentity,
    input: {
      lines: Array<{ variantId: string; quantity: number }>;
      note?: string;
    },
  ) {
    const order = await this.prisma.$transaction((tx) =>
      this.placeOrderInTx(tx, clubId, viewer, input),
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
  ): Promise<Prisma.ShopOrderGetPayload<{ include: { lines: true } }>> {
    if (!viewer.memberId && !viewer.contactId) {
      throw new ForbiddenException('Profil requis pour commander.');
    }
    if (input.lines.length === 0) {
      throw new BadRequestException('Commande vide.');
    }

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
      include: { product: { select: { id: true, name: true, priceCents: true } } },
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
    for (const line of created.lines) {
      await this.stock.reserve(tx, {
        clubId,
        variantId: line.variantId!,
        qty: line.quantity,
        orderId: created.id,
        orderLineId: line.id,
      });
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

    const row = await tx.shopOrder.findFirstOrThrow({
      where: { id: orderId, clubId },
      include: { lines: true },
    });
    for (const line of row.lines) {
      if (!line.variantId) continue; // ligne antérieure aux variantes
      await this.stock.fulfill(tx, {
        clubId,
        variantId: line.variantId,
        qty: line.quantity,
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
      const claimed = await tx.shopOrder.updateMany({
        where: { id: orderId, clubId, status: ShopOrderStatus.PENDING },
        data: { status: ShopOrderStatus.PAID, paidAt: new Date() },
      });
      if (claimed.count !== 1) {
        await this.assertTransitionRefused(tx, clubId, orderId, 'payer');
      }

      const row = await tx.shopOrder.findFirstOrThrow({
        where: { id: orderId, clubId },
        include: { lines: true },
      });

      // Sortie physique : la marchandise quitte le placard. `available` n'est
      // pas retouché, il avait déjà baissé à la réservation.
      for (const line of row.lines) {
        if (!line.variantId) continue; // ligne antérieure aux variantes
        await this.stock.fulfill(tx, {
          clubId,
          variantId: line.variantId,
          qty: line.quantity,
          orderId: row.id,
          orderLineId: line.id,
        });
      }
      return row;
    });
    return (await this.hydrateBuyers([updated]))[0];
  }

  /**
   * PENDING → CANCELLED. Une commande PAYÉE ne s'annule pas ici : il faudrait
   * rembourser, et aucun chemin de remboursement n'existe côté boutique.
   */
  async cancelOrder(clubId: string, orderId: string) {
    const updated = await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.shopOrder.updateMany({
        where: { id: orderId, clubId, status: ShopOrderStatus.PENDING },
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

      for (const line of row.lines) {
        if (!line.variantId) continue;
        await this.stock.release(tx, {
          clubId,
          variantId: line.variantId,
          qty: line.quantity,
          orderId: row.id,
          orderLineId: line.id,
        });
      }
      return row;
    });
    return (await this.hydrateBuyers([updated]))[0];
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
      select: { status: true },
    });
    if (!current) throw new NotFoundException('Commande introuvable');
    const label =
      current.status === ShopOrderStatus.PAID ? 'déjà payée' : 'déjà annulée';
    throw new BadRequestException(
      `Impossible de ${verb} cette commande : elle est ${label}.`,
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
            select: { id: true, firstName: true, lastName: true },
          })
        : Promise.resolve([]),
      contactIds.length > 0
        ? this.prisma.contact.findMany({
            where: { id: { in: contactIds } },
            select: { id: true, firstName: true, lastName: true },
          })
        : Promise.resolve([]),
    ]);
    const memberById = new Map(members.map((m) => [m.id, m]));
    const contactById = new Map(contacts.map((c) => [c.id, c]));
    return orders.map((o) => {
      let first: string | null = null;
      let last: string | null = null;
      if (o.memberId && memberById.has(o.memberId)) {
        const m = memberById.get(o.memberId)!;
        first = m.firstName;
        last = m.lastName;
      } else if (o.contactId && contactById.has(o.contactId)) {
        const c = contactById.get(o.contactId)!;
        first = c.firstName;
        last = c.lastName;
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
        lines: o.lines.map((l) => ({
          id: l.id,
          orderId: l.orderId,
          productId: l.productId,
          variantId: l.variantId,
          quantity: l.quantity,
          unitPriceCents: l.unitPriceCents,
          label: l.label,
        })),
        buyerFirstName: first,
        buyerLastName: last,
      };
    });
  }
}
