import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ClubPaymentMethod,
  InvoiceStatus,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ShopService } from './shop.service';

/** Identité du viewer propriétaire d'un panier boutique. */
type ViewerIdentity = {
  memberId?: string | null;
  contactId?: string | null;
};

/** Ligne de panier projetée pour le portail — SANS aucune quantité de stock. */
export type ShopCartItemView = {
  id: string;
  variantId: string;
  productId: string;
  label: string;
  imageUrl: string | null;
  quantity: number;
  unitPriceCents: number;
  lineTotalCents: number;
  /**
   * Booléen SEULEMENT. Le membre voit « en stock / épuisé », jamais combien il
   * en reste : c'est la même discipline que `shapeProduct` (ADR-0012). Exposer
   * `available` ici trahirait le stock exact du club.
   */
  inStock: boolean;
  /** Le produit ou la déclinaison n'est plus vendable (désactivé/supprimé). */
  unavailable: boolean;
};

export type ShopCartView = {
  id: string;
  totalCents: number;
  items: ShopCartItemView[];
};

export type ShopCartCheckoutResult = {
  orderId: string;
  invoiceId: string;
  totalCents: number;
  installmentsCount: number;
};

/**
 * Panier boutique côté VIEWER : ajout/maj/retrait de déclinaisons, puis
 * transformation en commande + facture au checkout.
 *
 * DEUX INVARIANTS structurants (cf. modèle Prisma ShopCart) :
 *
 *  1. Le panier NE RÉSERVE PAS le stock. On valide seulement la disponibilité
 *     (`inStock`) à l'ajout et de nouveau au checkout. La réservation atomique,
 *     seule garantie anti-survente, reste au passage de commande via le chemin
 *     EXISTANT (`ShopService.placeOrderInTx` → `ShopStockService.reserve`).
 *
 *  2. Confidentialité : on n'expose JAMAIS de quantité de stock au membre.
 *     Chaque ligne ne porte que son `inStock` (booléen), son prix et sa
 *     quantité commandée.
 *
 * Toute écriture porte le `clubId` + l'identité du viewer DANS son WHERE : la
 * frontière (tenant + propriété du panier) est tenue par la requête, pas par
 * une lecture d'arbitrage préalable.
 */
@Injectable()
export class ShopCartService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly shop: ShopService,
  ) {}

  private assertViewer(viewer: ViewerIdentity): {
    memberId: string | null;
    contactId: string | null;
  } {
    const memberId = viewer.memberId ?? null;
    const contactId = viewer.contactId ?? null;
    if (!memberId && !contactId) {
      throw new ForbiddenException('Profil requis pour gérer un panier.');
    }
    return { memberId, contactId };
  }

  /** Filtre Prisma identifiant le panier du viewer dans ce club. */
  private ownerWhere(
    clubId: string,
    viewer: { memberId: string | null; contactId: string | null },
  ): Prisma.ShopCartWhereInput {
    return {
      clubId,
      // Un membre a toujours priorité sur un éventuel contactId : un profil
      // portail est l'un OU l'autre, jamais les deux à la fois.
      ...(viewer.memberId
        ? { memberId: viewer.memberId }
        : { contactId: viewer.contactId }),
    };
  }

  /**
   * Retourne le panier du viewer, en le créant s'il n'existe pas. Le `clubId`
   * et le propriétaire vont DANS l'écriture de création.
   */
  private async getOrCreateCart(
    clubId: string,
    viewer: { memberId: string | null; contactId: string | null },
  ): Promise<{ id: string }> {
    const existing = await this.prisma.shopCart.findFirst({
      where: this.ownerWhere(clubId, viewer),
      select: { id: true },
    });
    if (existing) return existing;
    return this.prisma.shopCart.create({
      data: {
        clubId,
        memberId: viewer.memberId,
        contactId: viewer.memberId ? null : viewer.contactId,
      },
      select: { id: true },
    });
  }

  /**
   * Charge le panier + ses lignes, résout prix/label/inStock. NE renvoie
   * aucune quantité de stock. Réutilisé par toutes les mutations pour
   * renvoyer l'état à jour.
   */
  async getCart(clubId: string, viewer: ViewerIdentity): Promise<ShopCartView> {
    const owner = this.assertViewer(viewer);
    const cart = await this.prisma.shopCart.findFirst({
      where: this.ownerWhere(clubId, owner),
      include: {
        items: {
          orderBy: { createdAt: 'asc' },
          include: {
            variant: {
              include: {
                product: {
                  select: {
                    id: true,
                    name: true,
                    priceCents: true,
                    imageUrl: true,
                    active: true,
                  },
                },
              },
            },
          },
        },
      },
    });
    if (!cart) {
      return { id: '', totalCents: 0, items: [] };
    }
    return this.shapeCart(cart);
  }

  private shapeCart(
    cart: Prisma.ShopCartGetPayload<{
      include: {
        items: {
          include: {
            variant: {
              include: {
                product: {
                  select: {
                    id: true;
                    name: true;
                    priceCents: true;
                    imageUrl: true;
                    active: true;
                  };
                };
              };
            };
          };
        };
      };
    }>,
  ): ShopCartView {
    let totalCents = 0;
    const items: ShopCartItemView[] = cart.items.map((it) => {
      const v = it.variant;
      const p = v.product;
      const unitPriceCents = v.priceCents ?? p.priceCents;
      const lineTotalCents = unitPriceCents * it.quantity;
      // Vendable et compté dans le total UNIQUEMENT si le produit ET la
      // déclinaison sont encore actifs. Un article désactivé après l'ajout
      // reste visible (le membre doit comprendre pourquoi son total change),
      // mais ne pèse pas dans le total et sera refusé au checkout.
      const unavailable = !p.active || !v.active;
      // `inStock` : booléen dérivé, jamais la quantité. Une variante non
      // suivie est toujours en stock ; une variante suivie l'est si
      // `available > 0`. `available` NE SORT PAS d'ici.
      const inStock = !unavailable && (!v.trackStock || v.available > 0);
      if (!unavailable) totalCents += lineTotalCents;
      return {
        id: it.id,
        variantId: v.id,
        productId: p.id,
        label: v.label ? `${p.name} — ${v.label}` : p.name,
        imageUrl: p.imageUrl,
        quantity: it.quantity,
        unitPriceCents,
        lineTotalCents,
        inStock,
        unavailable,
      };
    });
    return { id: cart.id, totalCents, items };
  }

  /**
   * Ajoute (ou CUMULE) une déclinaison au panier. Valide que la variante
   * appartient au club, est active, son produit actif, et qu'elle est
   * `inStock` — sans rien réserver.
   */
  async addItem(
    clubId: string,
    viewer: ViewerIdentity,
    variantId: string,
    quantity: number,
  ): Promise<ShopCartView> {
    const owner = this.assertViewer(viewer);
    if (!Number.isInteger(quantity) || quantity < 1) {
      throw new BadRequestException('Quantité invalide.');
    }
    const variant = await this.prisma.shopProductVariant.findFirst({
      where: { id: variantId, clubId, active: true, product: { active: true } },
      select: { id: true, trackStock: true, available: true },
    });
    if (!variant) {
      throw new NotFoundException('Article introuvable ou indisponible.');
    }
    // Constat de disponibilité (booléen), PAS une réservation : on refuse
    // seulement d'ajouter un article manifestement épuisé. La garantie
    // anti-survente reste au checkout.
    if (variant.trackStock && variant.available <= 0) {
      throw new BadRequestException('Cet article est épuisé.');
    }
    const cart = await this.getOrCreateCart(clubId, owner);
    // Upsert par (cartId, variantId) : ré-ajouter CUMULE la quantité. Le
    // `clubId` va dans la création comme dans la mise à jour.
    await this.prisma.shopCartItem.upsert({
      where: { cartId_variantId: { cartId: cart.id, variantId } },
      create: { clubId, cartId: cart.id, variantId, quantity },
      update: { quantity: { increment: quantity } },
    });
    return this.getCart(clubId, owner);
  }

  /**
   * Fixe la quantité d'une ligne. Une quantité < 1 retire la ligne. L'écriture
   * est scopée par clubId + propriété du panier : un membre ne peut pas
   * toucher la ligne d'un autre. On teste le `count` pour ne pas échouer en
   * silence si la ligne n'appartient pas au viewer.
   */
  async setItemQuantity(
    clubId: string,
    viewer: ViewerIdentity,
    itemId: string,
    quantity: number,
  ): Promise<ShopCartView> {
    const owner = this.assertViewer(viewer);
    if (!Number.isInteger(quantity)) {
      throw new BadRequestException('Quantité invalide.');
    }
    if (quantity < 1) {
      return this.removeItem(clubId, viewer, itemId);
    }
    const updated = await this.prisma.shopCartItem.updateMany({
      where: { id: itemId, clubId, cart: this.ownerWhere(clubId, owner) },
      data: { quantity },
    });
    if (updated.count !== 1) {
      throw new NotFoundException('Ligne de panier introuvable.');
    }
    return this.getCart(clubId, owner);
  }

  async removeItem(
    clubId: string,
    viewer: ViewerIdentity,
    itemId: string,
  ): Promise<ShopCartView> {
    const owner = this.assertViewer(viewer);
    const deleted = await this.prisma.shopCartItem.deleteMany({
      where: { id: itemId, clubId, cart: this.ownerWhere(clubId, owner) },
    });
    if (deleted.count !== 1) {
      throw new NotFoundException('Ligne de panier introuvable.');
    }
    return this.getCart(clubId, owner);
  }

  async clearCart(
    clubId: string,
    viewer: ViewerIdentity,
  ): Promise<ShopCartView> {
    const owner = this.assertViewer(viewer);
    const cart = await this.prisma.shopCart.findFirst({
      where: this.ownerWhere(clubId, owner),
      select: { id: true },
    });
    if (cart) {
      await this.prisma.shopCartItem.deleteMany({
        where: { cartId: cart.id, clubId },
      });
    }
    return this.getCart(clubId, owner);
  }

  /**
   * Transforme le panier en commande + facture, dans UNE transaction :
   *
   *  1. `ShopService.placeOrderInTx` (chemin atomique EXISTANT) crée la
   *     commande PENDING et RÉSERVE le stock — la garantie anti-survente
   *     n'est pas contournée.
   *  2. Le choix 3×/comptant est arbitré par le SERVEUR contre le seuil du
   *     club, une fois le total réel connu. Un 3× demandé sous le seuil LÈVE,
   *     ce qui annule toute la transaction (commande et réservation comprises).
   *  3. Une `Invoice` est créée, liée à la commande par `shopOrderId`. C'est
   *     ce lien que le webhook « facture payée » suivra pour solder la
   *     commande et sortir le stock.
   *  4. Le panier est vidé — comme la validation d'un panier d'adhésion crée
   *     l'Invoice avant le paiement.
   *
   * Ne crée PAS la session Stripe : cet appel vit dans la couche viewer, qui
   * seule connaît `StripeCheckoutService` (le module boutique ne dépend pas du
   * module paiements, pour éviter une dépendance circulaire avec le webhook).
   */
  async checkout(
    clubId: string,
    viewer: ViewerIdentity,
    /** true = le membre demande le 3×. Le serveur peut le refuser. */
    wantsInstallments: boolean,
  ): Promise<ShopCartCheckoutResult> {
    const owner = this.assertViewer(viewer);
    const cart = await this.prisma.shopCart.findFirst({
      where: this.ownerWhere(clubId, owner),
      include: { items: true },
    });
    if (!cart || cart.items.length === 0) {
      throw new BadRequestException('Votre panier est vide.');
    }

    const club = await this.prisma.club.findUnique({
      where: { id: clubId },
      select: { shopInstallmentThresholdCents: true, name: true },
    });
    const thresholdCents = club?.shopInstallmentThresholdCents ?? null;

    const lines = cart.items.map((i) => ({
      variantId: i.variantId,
      quantity: i.quantity,
    }));

    const result = await this.prisma.$transaction(async (tx) => {
      // 1. Commande + réservation (chemin atomique existant).
      const order = await this.shop.placeOrderInTx(tx, clubId, owner, { lines });

      // 2. Arbitrage 3× par le SERVEUR — jamais par le client. Le 3× exige un
      // seuil configuré ET un total qui l'atteint. Sinon : comptant.
      let installmentsCount = 1;
      if (wantsInstallments) {
        if (thresholdCents === null || order.totalCents < thresholdCents) {
          throw new BadRequestException(
            'Le paiement en 3× n’est pas disponible pour ce montant.',
          );
        }
        installmentsCount = 3;
      }

      // 3. Facture liée à la commande.
      const invoice = await tx.invoice.create({
        data: {
          clubId,
          label: `Commande boutique${club?.name ? ` — ${club.name}` : ''}`,
          baseAmountCents: order.totalCents,
          amountCents: order.totalCents,
          status: InvoiceStatus.OPEN,
          installmentsCount,
          lockedPaymentMethod: ClubPaymentMethod.STRIPE_CARD,
          shopOrderId: order.id,
        },
        select: { id: true },
      });

      // 4. Le panier est consommé : on le vide dans la même transaction.
      await tx.shopCartItem.deleteMany({ where: { cartId: cart.id, clubId } });

      return {
        orderId: order.id,
        invoiceId: invoice.id,
        totalCents: order.totalCents,
        installmentsCount,
      };
    });

    return result;
  }

  /**
   * Validation du panier SANS paiement en ligne : « régler sur place ».
   *
   * La commande est créée et le stock RÉSERVÉ (même chemin atomique que le
   * checkout Stripe), mais AUCUNE facture ni session Stripe n'est produite : la
   * commande reste PENDING jusqu'à ce que le club la marque payée
   * (`markShopOrderPaid`) quand l'adhérent règle en espèces/chèque au club.
   *
   * La réservation est identique au checkout en ligne — un article validé « sur
   * place » n'est donc pas revendable en double —, et le panier est vidé dans la
   * même transaction. L'annulation par l'adhérent (`viewerCancelShopOrder`)
   * libère le stock, exactement comme pour une commande en ligne abandonnée.
   */
  async checkoutOnSite(
    clubId: string,
    viewer: ViewerIdentity,
  ): Promise<{ orderId: string }> {
    const owner = this.assertViewer(viewer);
    const cart = await this.prisma.shopCart.findFirst({
      where: this.ownerWhere(clubId, owner),
      include: { items: true },
    });
    if (!cart || cart.items.length === 0) {
      throw new BadRequestException('Votre panier est vide.');
    }
    const lines = cart.items.map((i) => ({
      variantId: i.variantId,
      quantity: i.quantity,
    }));

    return this.prisma.$transaction(async (tx) => {
      const order = await this.shop.placeOrderInTx(tx, clubId, owner, { lines });
      await tx.shopCartItem.deleteMany({ where: { cartId: cart.id, clubId } });
      return { orderId: order.id };
    });
  }
}
