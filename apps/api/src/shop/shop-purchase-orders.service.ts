import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  Prisma,
  ShopPurchaseOrderStatus,
  ShopReceiptDiscrepancyReason,
} from '@prisma/client';
import { AccountingMappingService } from '../accounting/accounting-mapping.service';
import { PrismaService } from '../prisma/prisma.service';
import { ShopStockService } from './shop-stock.service';

/**
 * Commandes fournisseur : envoi, réception, rapprochement (ADR-0013).
 *
 * TROIS PRINCIPES, tous hérités de l'ADR-0012 et repris tels quels :
 *
 *  1. toute transition d'état est un `updateMany` conditionnel dont on teste
 *     le `count`, jamais un `if` lu hors transaction. Une commande déjà REÇUE
 *     ne peut pas être reçue une seconde fois, une CANCELLED ne repasse pas
 *     ORDERED — et c'est la base qui l'arbitre, pas nous ;
 *  2. le `clubId` est DANS l'écriture, jamais dans un `findFirst` préalable :
 *     la frontière multi-tenant est tenue par la même requête que la garantie
 *     métier ;
 *  3. AUCUNE écriture comptable (ADR-0013 §1). Le grand livre est en
 *     trésorerie de bout en bout ; l'écriture naît au paiement du fournisseur,
 *     pas à la réception de la marchandise.
 */

/**
 * Statuts pendant lesquels une commande pèse sur l'encours et peut recevoir
 * de la marchandise. DRAFT n'y est pas — un brouillon n'a rien commandé —,
 * RECEIVED et CANCELLED non plus : elles sont soldées.
 */
const RECEIVABLE: ShopPurchaseOrderStatus[] = [
  ShopPurchaseOrderStatus.ORDERED,
  ShopPurchaseOrderStatus.PARTIALLY_RECEIVED,
];

/** Statuts qu'une annulation peut encore atteindre. */
const CANCELLABLE: ShopPurchaseOrderStatus[] = [
  ShopPurchaseOrderStatus.DRAFT,
  ShopPurchaseOrderStatus.ORDERED,
  ShopPurchaseOrderStatus.PARTIALLY_RECEIVED,
];

/**
 * Tentatives d'attribution d'une référence avant d'abandonner.
 *
 * Chaque échec est un P2002 sur `@@unique([clubId, reference])`, donc une
 * course réellement perdue contre une autre création. Huit collisions
 * d'affilée sur le même club ne se produisent pas ; au-delà, mieux vaut une
 * erreur franche qu'une boucle qui ne se termine pas.
 */
const REFERENCE_ATTEMPTS = 8;

/**
 * Clé de résolution du compte d'achat proposé au trésorier. Le mapping du club
 * l'emporte ; à défaut, `AccountingMappingService` retombe sur `607000`.
 */
const SHOP_PURCHASE_SOURCE = 'SHOP_PURCHASE';

/**
 * Ce qu'on ramène d'une facture rapprochée : de quoi la reconnaître à l'écran,
 * rien de plus. La facture reste un objet du grand livre, pas de la boutique.
 */
const INVOICE_SELECT = {
  id: true,
  label: true,
  amountCents: true,
  occurredAt: true,
  invoiceNumber: true,
} as const;

export type ReceiveLineInput = {
  orderLineId: string;
  receivedQty: number;
  discrepancyReason?: ShopReceiptDiscrepancyReason | null;
  discrepancyNote?: string | null;
};

@Injectable()
export class ShopPurchaseOrdersService {
  private readonly logger = new Logger(ShopPurchaseOrdersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly stock: ShopStockService,
    private readonly mapping: AccountingMappingService,
  ) {}

  // ------------------------------------------------------------------
  // A. Fournisseurs
  // ------------------------------------------------------------------

  listSuppliers(clubId: string, includeInactive = false) {
    return this.prisma.shopSupplier.findMany({
      where: { clubId, ...(includeInactive ? {} : { active: true }) },
      orderBy: [{ active: 'desc' }, { name: 'asc' }],
    });
  }

  async createSupplier(
    clubId: string,
    input: {
      name: string;
      contactName?: string | null;
      email?: string | null;
      phone?: string | null;
      accountRef?: string | null;
      leadTimeDays?: number | null;
      notes?: string | null;
    },
  ) {
    const name = input.name.trim();
    if (name.length === 0) {
      throw new BadRequestException('Un fournisseur doit être nommé.');
    }
    try {
      return await this.prisma.shopSupplier.create({
        data: {
          clubId,
          name,
          contactName: input.contactName ?? null,
          email: input.email ?? null,
          phone: input.phone ?? null,
          accountRef: input.accountRef ?? null,
          leadTimeDays: input.leadTimeDays ?? null,
          notes: input.notes ?? null,
        },
      });
    } catch (err: unknown) {
      // L'homonymie est arbitrée par `@@unique([clubId, name])`, pas par une
      // lecture préalable : deux créations simultanées passeraient toutes deux
      // la lecture, et l'historique se fragmenterait sur deux fiches jumelles.
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        throw new BadRequestException(
          `Un fournisseur nommé « ${name} » existe déjà dans ce club.`,
        );
      }
      throw err;
    }
  }

  /**
   * Met à jour un fournisseur. `active: false` en tient lieu de SUPPRESSION :
   * `ShopPurchaseOrder.supplier` porte un `onDelete: Restrict`, donc un
   * fournisseur déjà commandé ne peut pas disparaître sans emporter
   * l'historique qui le référence.
   */
  async updateSupplier(
    clubId: string,
    supplierId: string,
    input: {
      name?: string;
      contactName?: string | null;
      email?: string | null;
      phone?: string | null;
      accountRef?: string | null;
      leadTimeDays?: number | null;
      notes?: string | null;
      active?: boolean;
    },
  ) {
    const data: Prisma.ShopSupplierUpdateManyMutationInput = {};
    if (input.name !== undefined) {
      const name = input.name.trim();
      if (name.length === 0) {
        throw new BadRequestException('Un fournisseur doit être nommé.');
      }
      data.name = name;
    }
    if (input.contactName !== undefined) data.contactName = input.contactName;
    if (input.email !== undefined) data.email = input.email;
    if (input.phone !== undefined) data.phone = input.phone;
    if (input.accountRef !== undefined) data.accountRef = input.accountRef;
    if (input.leadTimeDays !== undefined) data.leadTimeDays = input.leadTimeDays;
    if (input.notes !== undefined) data.notes = input.notes;
    if (input.active !== undefined) data.active = input.active;

    // `updateMany` scopé par clubId, et non `update` par identifiant : la
    // frontière multi-tenant est portée par l'écriture elle-même.
    const updated = await this.prisma.shopSupplier.updateMany({
      where: { id: supplierId, clubId },
      data,
    });
    if (updated.count !== 1) {
      throw new NotFoundException('Fournisseur introuvable.');
    }
    return this.prisma.shopSupplier.findFirstOrThrow({
      where: { id: supplierId, clubId },
    });
  }

  // ------------------------------------------------------------------
  // B. Commandes
  // ------------------------------------------------------------------

  listOrders(clubId: string, args: { status?: ShopPurchaseOrderStatus } = {}) {
    return this.prisma.shopPurchaseOrder.findMany({
      where: { clubId, ...(args.status ? { status: args.status } : {}) },
      orderBy: [{ createdAt: 'desc' }],
      include: {
        supplier: true,
        lines: { orderBy: { createdAt: 'asc' } },
        receptions: {
          orderBy: { receivedAt: 'desc' },
          include: { lines: true },
        },
        accountingEntries: {
          orderBy: { occurredAt: 'desc' },
          select: INVOICE_SELECT,
        },
      },
    });
  }

  async getOrder(clubId: string, orderId: string) {
    const row = await this.prisma.shopPurchaseOrder.findFirst({
      where: { id: orderId, clubId },
      include: {
        supplier: true,
        lines: { orderBy: { createdAt: 'asc' } },
        receptions: {
          orderBy: { receivedAt: 'desc' },
          include: { lines: true },
        },
        accountingEntries: {
          orderBy: { occurredAt: 'desc' },
          select: INVOICE_SELECT,
        },
      },
    });
    if (!row) throw new NotFoundException('Commande fournisseur introuvable.');
    return row;
  }

  /**
   * Crée un BROUILLON, avec éventuellement ses premières lignes.
   *
   * La lecture du fournisseur est une vérification d'EXISTENCE scopée au club,
   * pas l'arbitrage d'une transition : sans elle, un `supplierId` d'un autre
   * tenant satisferait la clé étrangère et la commande naîtrait rattachée au
   * fournisseur d'un autre club. Prisma ne sait pas conditionner un `connect`
   * sur une seconde colonne, donc la lecture est ici le seul chemin. Le pire
   * cas d'une course — un fournisseur désactivé entre-temps — donne un
   * brouillon sur un fournisseur inactif, ce qui ne casse aucune garantie.
   */
  async createOrder(
    clubId: string,
    input: {
      supplierId: string;
      notes?: string | null;
      lines?: Array<{
        variantId: string;
        orderedQty: number;
        unitCostCents?: number;
      }>;
    },
  ) {
    const supplier = await this.prisma.shopSupplier.findFirst({
      where: { id: input.supplierId, clubId, active: true },
      select: { id: true },
    });
    if (!supplier) {
      throw new BadRequestException('Fournisseur introuvable ou désactivé.');
    }

    const lines = this.normalizeDraftLines(input.lines ?? []);
    if (lines.length > 0) {
      await this.assertVariantsBelongToClub(
        clubId,
        lines.map((l) => l.variantId),
      );
    }

    const order = await this.createWithReference(clubId, {
      supplierId: input.supplierId,
      notes: input.notes ?? null,
      status: ShopPurchaseOrderStatus.DRAFT,
      lines: {
        create: lines.map((l) => ({
          clubId,
          variantId: l.variantId,
          orderedQty: l.orderedQty,
          unitCostCents: l.unitCostCents,
        })),
      },
    });
    return this.getOrder(clubId, order.id);
  }

  /**
   * Attribue une référence lisible et crée la commande.
   *
   * PAS de `count() + 1` lu puis écrit : c'est le check-then-act que tout ce
   * dépôt cherche à supprimer. La référence est PROPOSÉE à partir du maximum
   * observé, puis ARBITRÉE par `@@unique([clubId, reference])`. Deux créations
   * simultanées proposent le même numéro ; la base en refuse une avec un
   * P2002, et celle-là recommence — la seconde lecture voit alors la référence
   * que la première vient de committer. La garantie n'est jamais dans la
   * lecture, elle est dans la contrainte.
   *
   * Le maximum est calculé EN MÉMOIRE et non par `orderBy: 'desc'` : les
   * références sont des chaînes, et « CF-2026-1000 » se classe avant
   * « CF-2026-999 » en ordre lexicographique. Le tri SQL donnerait donc, au
   * millième bon de commande, un numéro déjà pris — indéfiniment.
   */
  private async createWithReference(
    clubId: string,
    data: Omit<Prisma.ShopPurchaseOrderUncheckedCreateInput, 'clubId' | 'reference'>,
  ) {
    const prefix = `CF-${new Date().getFullYear()}-`;

    for (let attempt = 0; attempt < REFERENCE_ATTEMPTS; attempt++) {
      const taken = await this.prisma.shopPurchaseOrder.findMany({
        where: { clubId, reference: { startsWith: prefix } },
        select: { reference: true },
      });
      const max = taken.reduce((acc, row) => {
        const n = Number.parseInt(row.reference.slice(prefix.length), 10);
        return Number.isFinite(n) && n > acc ? n : acc;
      }, 0);
      const reference = `${prefix}${String(max + 1).padStart(3, '0')}`;

      try {
        return await this.prisma.shopPurchaseOrder.create({
          data: { ...data, clubId, reference },
        });
      } catch (err: unknown) {
        if (
          err instanceof Prisma.PrismaClientKnownRequestError &&
          err.code === 'P2002'
        ) {
          this.logger.log(
            `[appro] référence ${reference} déjà prise sur ${clubId} — nouvelle tentative`,
          );
          continue;
        }
        throw err;
      }
    }
    throw new BadRequestException(
      'Impossible d’attribuer une référence de commande. Réessayez.',
    );
  }

  /**
   * Ajoute une ligne à un BROUILLON.
   *
   * L'état est réclamé par un `updateMany` conditionnel avant l'écriture, et
   * pas seulement vérifié : le verrou qu'il pose sur la ligne de commande
   * sérialise cet ajout avec un envoi concurrent. Sans lui, une ligne pourrait
   * se glisser dans une commande déjà partie chez le fournisseur — donc dans
   * l'encours, sans que personne l'ait jamais commandée.
   */
  async addLine(
    clubId: string,
    input: {
      orderId: string;
      variantId: string;
      orderedQty: number;
      unitCostCents?: number;
    },
  ) {
    const [line] = this.normalizeDraftLines([input]);
    await this.assertVariantsBelongToClub(clubId, [line.variantId]);

    await this.prisma.$transaction(async (tx) => {
      await this.claimDraft(tx, clubId, input.orderId, 'modifier');
      try {
        await tx.shopPurchaseOrderLine.create({
          data: {
            clubId,
            orderId: input.orderId,
            variantId: line.variantId,
            orderedQty: line.orderedQty,
            unitCostCents: line.unitCostCents,
          },
        });
      } catch (err: unknown) {
        // `@@unique([orderId, variantId])` : deux lignes pour le même article
        // rendraient le rapprochement ambigu.
        if (
          err instanceof Prisma.PrismaClientKnownRequestError &&
          err.code === 'P2002'
        ) {
          throw new BadRequestException(
            'Cette déclinaison figure déjà sur la commande — modifiez sa quantité.',
          );
        }
        throw err;
      }
    });
    return this.getOrder(clubId, input.orderId);
  }

  /** Retire une ligne d'un BROUILLON. Même arbitrage que l'ajout. */
  async removeLine(clubId: string, input: { orderId: string; lineId: string }) {
    await this.prisma.$transaction(async (tx) => {
      await this.claimDraft(tx, clubId, input.orderId, 'modifier');
      const removed = await tx.shopPurchaseOrderLine.deleteMany({
        where: { id: input.lineId, clubId, orderId: input.orderId },
      });
      if (removed.count !== 1) {
        throw new NotFoundException('Ligne de commande introuvable.');
      }
    });
    return this.getOrder(clubId, input.orderId);
  }

  /**
   * DRAFT → ORDERED. Pose `orderedAt` et dérive `expectedAt` du délai habituel
   * du fournisseur.
   *
   * Le comptage des lignes arrive APRÈS la réclamation, et c'est délibéré : le
   * `updateMany` a verrouillé la ligne de commande, donc `addLine` et
   * `removeLine` — qui réclament le même verrou — ne peuvent plus s'intercaler.
   * La lecture est alors sérialisée avec elles, et une commande vide ne peut
   * plus partir. Levée ⇒ toute la transaction est annulée, statut compris.
   */
  async sendOrder(clubId: string, orderId: string) {
    await this.prisma.$transaction(async (tx) => {
      const now = new Date();
      const claimed = await tx.shopPurchaseOrder.updateMany({
        where: {
          id: orderId,
          clubId,
          status: ShopPurchaseOrderStatus.DRAFT,
        },
        data: { status: ShopPurchaseOrderStatus.ORDERED, orderedAt: now },
      });
      if (claimed.count !== 1) {
        await this.explainRefusal(tx, clubId, orderId, 'envoyer');
      }

      const lineCount = await tx.shopPurchaseOrderLine.count({
        where: { orderId, clubId },
      });
      if (lineCount === 0) {
        throw new BadRequestException(
          'Une commande sans ligne ne peut pas être envoyée.',
        );
      }

      const order = await tx.shopPurchaseOrder.findFirstOrThrow({
        where: { id: orderId, clubId },
        include: { supplier: { select: { leadTimeDays: true } } },
      });
      const lead = order.supplier?.leadTimeDays;
      if (lead != null && lead > 0) {
        await tx.shopPurchaseOrder.updateMany({
          where: { id: orderId, clubId },
          data: {
            expectedAt: new Date(now.getTime() + lead * 24 * 60 * 60 * 1000),
          },
        });
      }
    });
    return this.getOrder(clubId, orderId);
  }

  /**
   * Annulation. Une commande déjà REÇUE ne s'annule pas : la marchandise est
   * entrée en stock, et un statut CANCELLED contredirait les mouvements qui
   * l'attestent.
   */
  async cancelOrder(clubId: string, orderId: string) {
    await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.shopPurchaseOrder.updateMany({
        where: { id: orderId, clubId, status: { in: CANCELLABLE } },
        data: {
          status: ShopPurchaseOrderStatus.CANCELLED,
          closedAt: new Date(),
        },
      });
      if (claimed.count !== 1) {
        await this.explainRefusal(tx, clubId, orderId, 'annuler');
      }
    });
    return this.getOrder(clubId, orderId);
  }

  // ------------------------------------------------------------------
  // C. Réception — le cœur du lot
  // ------------------------------------------------------------------

  /**
   * Enregistre une livraison : lignes reçues, mouvements de stock, cumuls,
   * statut recalculé. Le tout dans UNE transaction.
   *
   * L'ORDRE compte. Tout est VALIDÉ avant que quoi que ce soit ne soit écrit :
   * un motif manquant découvert après trois `restock` laisserait la garantie
   * derrière un effet de bord, et la levée n'annulerait que grâce à la
   * transaction — une protection qu'on ne veut pas avoir à supposer.
   *
   * AUCUNE écriture comptable ici (ADR-0013 §1) : la compta reste en
   * trésorerie, l'écriture naît au paiement du fournisseur.
   */
  async receiveOrder(
    clubId: string,
    input: {
      orderId: string;
      deliveryNote?: string | null;
      notes?: string | null;
      userId?: string | null;
      lines: ReceiveLineInput[];
    },
  ) {
    if (input.lines.length === 0) {
      throw new BadRequestException('Une réception sans ligne n’a rien à dire.');
    }
    const seen = new Set<string>();
    for (const l of input.lines) {
      if (seen.has(l.orderLineId)) {
        throw new BadRequestException(
          'Une même ligne de commande figure deux fois dans cette réception.',
        );
      }
      seen.add(l.orderLineId);
      if (!Number.isInteger(l.receivedQty) || l.receivedQty < 0) {
        throw new BadRequestException('Quantité reçue invalide.');
      }
    }

    await this.prisma.$transaction(async (tx) => {
      // LA garantie d'état, de tenant et de sérialisation, en une requête.
      // Une commande RECEIVED, CANCELLED, encore DRAFT, ou appartenant à un
      // autre club : `count` vaut 0 et rien n'est écrit. `updatedAt` est
      // touché faute de pouvoir écrire un `data` vide en Prisma ; l'écriture
      // est sans effet métier mais pose le verrou de ligne dont dépend tout
      // ce qui suit.
      const claimed = await tx.shopPurchaseOrder.updateMany({
        where: { id: input.orderId, clubId, status: { in: RECEIVABLE } },
        data: { updatedAt: new Date() },
      });
      if (claimed.count !== 1) {
        await this.explainRefusal(tx, clubId, input.orderId, 'réceptionner');
      }

      const order = await tx.shopPurchaseOrder.findFirstOrThrow({
        where: { id: input.orderId, clubId },
        select: { id: true, reference: true },
      });
      const orderLines = await tx.shopPurchaseOrderLine.findMany({
        where: { orderId: input.orderId, clubId },
      });
      const byId = new Map(orderLines.map((l) => [l.id, l]));

      // --- Passe de VALIDATION : aucune écriture avant qu'elle soit finie ---
      const planned = input.lines.map((entry) => {
        const line = byId.get(entry.orderLineId);
        if (!line) {
          throw new BadRequestException(
            'Cette ligne n’appartient pas à la commande réceptionnée.',
          );
        }
        if (line.closed) {
          throw new BadRequestException(
            'Cette ligne est soldée : plus rien n’est attendu dessus.',
          );
        }

        const cumulative = line.receivedQty + entry.receivedQty;
        const reason = entry.discrepancyReason ?? null;

        // LE MOTIF EST OBLIGATOIRE dès que le cumul s'écarte du commandé.
        // Un écart sans explication est une information perdue au moment
        // précis où quelqu'un la connaissait encore.
        if (cumulative !== line.orderedQty && reason === null) {
          throw new BadRequestException(
            `Écart de réception (${cumulative} reçu sur ${line.orderedQty} commandés) : ` +
              'un motif est obligatoire.',
          );
        }
        if (
          reason === ShopReceiptDiscrepancyReason.OTHER &&
          (entry.discrepancyNote ?? '').trim().length === 0
        ) {
          throw new BadRequestException(
            'Le motif « Autre » demande un commentaire.',
          );
        }

        // LA RÈGLE DE RAPPROCHEMENT (ADR-0013 §2). BACKORDER dit « ça
        // arrive » et laisse la ligne OUVERTE ; tous les autres motifs disent
        // « on ne l'aura jamais » et la SOLDENT, fût-elle courte. Sans cette
        // distinction, la commande resterait éternellement ouverte ou se
        // fermerait à tort — et le stock prévisionnel mentirait dans les deux
        // cas.
        const closed = reason !== ShopReceiptDiscrepancyReason.BACKORDER;

        return { entry, line, closed, reason };
      });

      // --- Passe d'ÉCRITURE ---
      const reception = await tx.shopPurchaseReception.create({
        data: {
          clubId,
          orderId: input.orderId,
          deliveryNote: input.deliveryNote ?? null,
          userId: input.userId ?? null,
          notes: input.notes ?? null,
        },
      });

      for (const { entry, line, closed, reason } of planned) {
        let movementId: string | null = null;
        if (entry.receivedQty > 0) {
          // Le moteur de stock, DANS notre transaction : le mouvement ne peut
          // pas survivre à l'annulation de la réception qui le justifie.
          const done = await this.stock.restock(
            {
              clubId,
              variantId: line.variantId,
              qty: entry.receivedQty,
              userId: input.userId ?? null,
              reason: `Réception sur commande ${order.reference}`,
            },
            tx,
          );
          movementId = done.movementId;

          // Le coût moyen pondéré, DANS la même transaction (ADR-0013 §1).
          await this.bumpAverageCost(
            tx,
            clubId,
            line.variantId,
            entry.receivedQty,
            line.unitCostCents,
          );
        }

        await tx.shopPurchaseReceptionLine.create({
          data: {
            clubId,
            receptionId: reception.id,
            orderLineId: line.id,
            receivedQty: entry.receivedQty,
            discrepancyReason: reason,
            discrepancyNote: entry.discrepancyNote ?? null,
            // LE RATTACHEMENT. C'est lui qui rend le journal précis :
            // « +17 reçu sur commande CF-2026-004 » au lieu de « +17 ».
            movementId,
          },
        });

        // `closed: false` dans le WHERE : une ligne soldée entre la validation
        // et ici ne se laisse pas ressusciter. La garantie est dans
        // l'écriture, pas dans le `if` de la passe précédente.
        const bumped = await tx.shopPurchaseOrderLine.updateMany({
          where: {
            id: line.id,
            clubId,
            orderId: input.orderId,
            closed: false,
          },
          data: { receivedQty: { increment: entry.receivedQty }, closed },
        });
        if (bumped.count !== 1) {
          throw new BadRequestException(
            'Cette ligne est soldée : plus rien n’est attendu dessus.',
          );
        }
      }

      // --- Statut CALCULÉ, jamais saisi (ADR-0013 §3) ---
      const fresh = await tx.shopPurchaseOrderLine.findMany({
        where: { orderId: input.orderId, clubId },
      });
      const settled = fresh.every(
        (l) => l.closed || l.receivedQty >= l.orderedQty,
      );
      const status = settled
        ? ShopPurchaseOrderStatus.RECEIVED
        : ShopPurchaseOrderStatus.PARTIALLY_RECEIVED;

      const moved = await tx.shopPurchaseOrder.updateMany({
        where: { id: input.orderId, clubId, status: { in: RECEIVABLE } },
        data: { status, closedAt: settled ? new Date() : null },
      });
      if (moved.count !== 1) {
        throw new BadRequestException(
          'Le statut de la commande a changé pendant la réception.',
        );
      }
    });

    return this.getOrder(clubId, input.orderId);
  }

  /**
   * Coût moyen pondéré de la déclinaison, après une entrée de `qty` unités
   * payées `unitCostCents` pièce.
   *
   *   nouveauCoût = (onHandAvant × avgAvant + qty × unitCost) / (onHandAvant + qty)
   *
   * OÙ EST LU `onHandAvant`, ET POURQUOI ICI
   *
   * La lecture arrive APRÈS `restock`, jamais avant. `restock` incrémente
   * `onHand` par un `updateMany` : sous READ COMMITTED, PostgreSQL pose alors
   * sur la ligne un verrou d'écriture qu'il conserve JUSQU'AU COMMIT de notre
   * transaction. Toute lecture postérieure, dans la même transaction, porte
   * donc sur une ligne que personne d'autre ne peut plus modifier — et
   * `onHandAvant` se retrouve par soustraction (`onHand − qty`) au lieu d'être
   * lu avant le verrou, où il aurait été un check-then-act ordinaire.
   *
   * Deux réceptions concurrentes sur la même déclinaison ne s'écrasent donc
   * pas : la seconde ATTEND au `restock`, puis lit le `onHand` et l'`avgCost`
   * que la première vient de committer, et pondère à partir de là.
   *
   * Le `updateMany` final reste malgré tout CONDITIONNEL sur les deux valeurs
   * lues (`onHand`, `avgCostCents`). Ce n'est pas une ceinture décorative :
   * c'est ce qui fait que la garantie tient sans avoir à SUPPOSER la
   * sémantique du verrou. Si l'hypothèse est fausse un jour, le `count` vaut
   * 0, la levée annule toute la réception, et l'on ne committe pas un coût
   * faux — au lieu de le committer en silence.
   *
   * DEUX RÉSERVES, énoncées plutôt que masquées :
   *  - une ligne laissée à `unitCostCents = 0` (coût non saisi) DILUE la
   *    moyenne vers le bas. Le champ vaut « inconnu », pas « gratuit », mais la
   *    formule ne sait pas faire la différence ;
   *  - une déclinaison NON SUIVIE n'a pas de coût moyen : `restock` la refuse
   *    en amont, donc on n'arrive jamais ici.
   */
  private async bumpAverageCost(
    tx: Prisma.TransactionClient,
    clubId: string,
    variantId: string,
    qty: number,
    unitCostCents: number,
  ) {
    const current = await tx.shopProductVariant.findFirst({
      where: { id: variantId, clubId },
      select: { onHand: true, avgCostCents: true },
    });
    if (!current) return;

    const onHandApres = current.onHand;
    const onHandAvant = onHandApres - qty;

    // Division par zéro : `onHandApres` est le dénominateur, et il vaut
    // `onHandAvant + qty`. Un stock corrigé à la baisse pendant que la
    // marchandise arrivait peut le laisser à zéro ou en dessous — auquel cas
    // il n'existe aucune moyenne à pondérer, et l'on ne touche à rien.
    if (onHandApres <= 0 || onHandAvant < 0) return;

    const suivant = Math.round(
      (onHandAvant * current.avgCostCents + qty * unitCostCents) / onHandApres,
    );

    const written = await tx.shopProductVariant.updateMany({
      where: {
        id: variantId,
        clubId,
        onHand: onHandApres,
        avgCostCents: current.avgCostCents,
      },
      data: { avgCostCents: suivant },
    });
    if (written.count !== 1) {
      throw new BadRequestException(
        'Le stock de cette déclinaison a changé pendant la réception : recommencez.',
      );
    }
  }

  // ------------------------------------------------------------------
  // E. Rapprochement facture / commande
  // ------------------------------------------------------------------

  /**
   * Rattache une écriture comptable DÉJÀ SAISIE à une commande fournisseur.
   *
   * LA LIGNE À NE PAS FRANCHIR (ADR-0013 §1) : rien ici ne CRÉE d'écriture.
   * Le grand livre est en trésorerie ; l'écriture naît au paiement du
   * fournisseur, saisie par le trésorier. Cette méthode ne fait que poser le
   * lien qui donne le rapprochement.
   *
   * DEUX ÉCRITURES, DEUX FRONTIÈRES DE TENANT, aucune lecture arbitrale :
   *  - le `updateMany` sur la commande PROUVE qu'elle appartient au club (son
   *    `count` le dit) et pose le verrou de ligne ;
   *  - celui sur l'écriture porte `clubId` dans son propre WHERE. Une écriture
   *    d'un autre club ne peut donc pas être rattachée à cette commande, même
   *    si son identifiant est connu.
   *
   * `cancelledAt: null` dans le prédicat : rapprocher une facture annulée
   * ferait mentir le total rapproché de la commande.
   */
  async linkInvoice(
    clubId: string,
    input: { orderId: string; entryId: string },
  ) {
    await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.shopPurchaseOrder.updateMany({
        where: { id: input.orderId, clubId },
        data: { updatedAt: new Date() },
      });
      if (claimed.count !== 1) {
        throw new NotFoundException('Commande fournisseur introuvable.');
      }

      const linked = await tx.accountingEntry.updateMany({
        where: { id: input.entryId, clubId, cancelledAt: null },
        data: { purchaseOrderId: input.orderId },
      });
      if (linked.count !== 1) {
        throw new BadRequestException(
          'Écriture comptable introuvable, annulée, ou appartenant à un autre club.',
        );
      }
    });
    return this.getOrder(clubId, input.orderId);
  }

  /**
   * Détache une facture. Tout le prédicat est dans le WHERE — club, écriture,
   * et commande d'origine : on ne peut pas détacher d'une commande une facture
   * qui n'y était pas rattachée.
   */
  async unlinkInvoice(
    clubId: string,
    input: { orderId: string; entryId: string },
  ) {
    const unlinked = await this.prisma.accountingEntry.updateMany({
      where: { id: input.entryId, clubId, purchaseOrderId: input.orderId },
      data: { purchaseOrderId: null },
    });
    if (unlinked.count !== 1) {
      throw new NotFoundException(
        'Cette écriture n’est pas rattachée à cette commande.',
      );
    }
    return this.getOrder(clubId, input.orderId);
  }

  /**
   * Compte d'achat PROPOSÉ au trésorier qui saisit sa facture fournisseur.
   *
   * Passe par le mécanisme de résolution DÉJÀ EN PLACE
   * (`AccountingMappingService`), qui laisse un club remplacer le défaut par
   * son propre mapping. Le fallback est `607000 Achats de marchandises`,
   * ajouté au plan seedé pour cet usage. Rien de neuf n'est inventé : c'est
   * une PROPOSITION, le trésorier reste libre de son compte.
   */
  proposedInvoiceAccount(clubId: string) {
    return this.mapping.resolveAccountWithLabel(clubId, SHOP_PURCHASE_SOURCE);
  }

  // ------------------------------------------------------------------
  // D. Quantité en commande — DÉRIVÉE, jamais stockée
  // ------------------------------------------------------------------

  /**
   * `onOrder` par déclinaison : ce qui est commandé et pas encore arrivé.
   *
   * Somme des `orderedQty − receivedQty` sur les lignes NON CLOSES des
   * commandes ORDERED ou PARTIALLY_RECEIVED. Une ligne close ne compte plus,
   * même incomplète — c'est tout l'intérêt d'avoir distingué « ça arrive » de
   * « on ne l'aura jamais ». Une commande CANCELLED ou encore DRAFT ne compte
   * pas non plus : rien n'a été commandé, ou plus rien ne l'est.
   *
   * DÉRIVÉE et non stockée (ADR-0013 §4) : un compteur de plus serait un
   * compteur de plus à tenir juste, et celui-ci n'arbitre AUCUNE garantie —
   * `onOrder` n'autorise jamais une vente, seul `available` le fait.
   */
  async onOrderByVariant(
    clubId: string,
    variantIds?: string[],
  ): Promise<Map<string, number>> {
    const byVariant = new Map<string, number>();
    if (variantIds && variantIds.length === 0) return byVariant;

    const lines = await this.prisma.shopPurchaseOrderLine.findMany({
      where: {
        clubId,
        closed: false,
        ...(variantIds ? { variantId: { in: variantIds } } : {}),
        order: { status: { in: RECEIVABLE } },
      },
      select: { variantId: true, orderedQty: true, receivedQty: true },
    });

    for (const l of lines) {
      // Une sur-livraison ne retire rien à l'encours des autres lignes : le
      // reliquat négatif est plancher à zéro, pas soustrait.
      const remaining = l.orderedQty - l.receivedQty;
      if (remaining <= 0) continue;
      byVariant.set(l.variantId, (byVariant.get(l.variantId) ?? 0) + remaining);
    }
    return byVariant;
  }

  // ------------------------------------------------------------------
  // Utilitaires
  // ------------------------------------------------------------------

  /**
   * Réclame l'état BROUILLON et pose le verrou de ligne. `updatedAt` est
   * touché faute de pouvoir écrire un `data` vide en Prisma.
   */
  private async claimDraft(
    tx: Prisma.TransactionClient,
    clubId: string,
    orderId: string,
    verb: string,
  ) {
    const claimed = await tx.shopPurchaseOrder.updateMany({
      where: { id: orderId, clubId, status: ShopPurchaseOrderStatus.DRAFT },
      data: { updatedAt: new Date() },
    });
    if (claimed.count !== 1) {
      await this.explainRefusal(tx, clubId, orderId, verb);
    }
  }

  /**
   * Explique POURQUOI une transition a été refusée, une fois qu'elle l'a été.
   *
   * La lecture arrive après l'échec de l'écriture conditionnelle : elle
   * n'arbitre rien, elle ne sert qu'à produire un message utile. Lever un
   * « commande introuvable » sur une commande déjà reçue enverrait le
   * trésorier chercher au mauvais endroit.
   */
  private async explainRefusal(
    tx: Prisma.TransactionClient,
    clubId: string,
    orderId: string,
    verb: string,
  ): Promise<never> {
    const current = await tx.shopPurchaseOrder.findFirst({
      where: { id: orderId, clubId },
      select: { status: true },
    });
    if (!current) {
      throw new NotFoundException('Commande fournisseur introuvable.');
    }
    const label: Record<ShopPurchaseOrderStatus, string> = {
      DRAFT: 'encore un brouillon',
      ORDERED: 'déjà envoyée',
      PARTIALLY_RECEIVED: 'déjà partiellement reçue',
      RECEIVED: 'déjà entièrement reçue',
      CANCELLED: 'annulée',
    };
    throw new BadRequestException(
      `Impossible de ${verb} cette commande : elle est ${label[current.status]}.`,
    );
  }

  private normalizeDraftLines(
    lines: Array<{
      variantId: string;
      orderedQty: number;
      unitCostCents?: number;
    }>,
  ) {
    const seen = new Set<string>();
    return lines.map((l) => {
      if (!Number.isInteger(l.orderedQty) || l.orderedQty < 1) {
        throw new BadRequestException(
          'Une ligne de commande porte au moins une unité.',
        );
      }
      if (seen.has(l.variantId)) {
        throw new BadRequestException(
          'Une même déclinaison figure deux fois : le rapprochement serait ambigu.',
        );
      }
      seen.add(l.variantId);
      // Montants en CENTIMES, comme partout dans le dépôt.
      return {
        variantId: l.variantId,
        orderedQty: l.orderedQty,
        unitCostCents: l.unitCostCents ?? 0,
      };
    });
  }

  /**
   * Vérifie que les déclinaisons commandées appartiennent bien au club.
   *
   * Même raison que pour le fournisseur : la clé étrangère de
   * `ShopPurchaseOrderLine.variant` ne connaît pas le tenant, et une commande
   * pourrait naître sur la déclinaison d'un autre club. Le `clubId` du WHERE
   * est ce qui rend cette lecture suffisante.
   */
  private async assertVariantsBelongToClub(
    clubId: string,
    variantIds: string[],
  ) {
    const found = await this.prisma.shopProductVariant.findMany({
      where: { id: { in: variantIds }, clubId },
      select: { id: true },
    });
    if (found.length !== new Set(variantIds).size) {
      throw new BadRequestException('Déclinaison introuvable.');
    }
  }
}
