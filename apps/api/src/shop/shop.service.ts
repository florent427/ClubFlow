import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, ShopOrderStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
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
  ) {}

  // --- Products ---

  async listProductsAdmin(clubId: string) {
    const rows = await this.prisma.shopProduct.findMany({
      where: { clubId },
      orderBy: [{ active: 'desc' }, { createdAt: 'desc' }],
      include: { variants: { orderBy: { createdAt: 'asc' } } },
    });
    return rows.map((p) => this.shapeProduct(p, { withQuantities: true }));
  }

  async listProductsPublic(clubId: string) {
    const rows = await this.prisma.shopProduct.findMany({
      where: { clubId, active: true },
      orderBy: [{ createdAt: 'desc' }],
      include: {
        variants: { where: { active: true }, orderBy: { createdAt: 'asc' } },
      },
    });
    // `withQuantities: false` : l'acheteur reçoit `inStock`, jamais un chiffre.
    return rows.map((p) => this.shapeProduct(p, { withQuantities: false }));
  }

  /** Recharge un produit sous sa forme GraphQL après écriture. */
  private async reloadProduct(clubId: string, id: string) {
    const row = await this.prisma.shopProduct.findFirstOrThrow({
      where: { id, clubId },
      include: { variants: { orderBy: { createdAt: 'asc' } } },
    });
    return this.shapeProduct(row, { withQuantities: true });
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
    opts: { withQuantities: boolean },
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
      stock:
        tracked.length === 0
          ? null
          : tracked.reduce((sum, v) => sum + v.available, 0),
      hasVariants: variants.some((v) => !v.isDefault),
      priceFromCents:
        variants.length === 0
          ? p.priceCents
          : Math.min(...variants.map(priceOf)),
      variantsBelowThreshold: tracked.filter(
        (v) => v.reorderThreshold !== null && v.available <= v.reorderThreshold,
      ).length,
      variants: variants.map((v) => ({
        id: v.id,
        productId: v.productId,
        isDefault: v.isDefault,
        label: v.label,
        sku: v.sku,
        unitPriceCents: priceOf(v),
        trackStock: v.trackStock,
        available: opts.withQuantities ? v.available : null,
        onHand: opts.withQuantities ? v.onHand : null,
        reorderThreshold: opts.withQuantities ? v.reorderThreshold : null,
        inStock: !v.trackStock || v.available > 0,
        belowThreshold:
          v.trackStock &&
          v.reorderThreshold !== null &&
          v.available <= v.reorderThreshold,
        active: v.active,
      })),
      active: p.active,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
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
      await tx.shopProductVariant.create({
        data: {
          clubId,
          productId: product.id,
          optionSignature: '', // chaîne vide : c'est elle qui porte l'unicité
          isDefault: true,
          label: null,
          sku: input.sku ?? null,
          priceCents: null, // hérite du produit
          trackStock: tracked,
          onHand: quantity,
          available: quantity,
          reorderThreshold: input.reorderThreshold ?? null,
        },
      });
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
          await this.prisma.shopProductVariant.update({
            where: { id: def.id },
            data: { trackStock: true, onHand: 0, available: 0 },
          });
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

    const variants = await this.prisma.shopProductVariant.findMany({
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

    const order = await this.prisma.$transaction(async (tx) => {
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
    });

    return (await this.hydrateBuyers([order]))[0];
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
