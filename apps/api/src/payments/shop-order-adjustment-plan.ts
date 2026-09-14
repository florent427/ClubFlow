import { InvoiceStatus, ShopOrderStatus } from '@prisma/client';
import {
  activeQty,
  dueCents,
  hasExited,
  netPaidCents,
  planRefunds,
  planWriteOffs,
  type ShopOrderPlanInvoice,
  type ShopOrderPlanOrderLine,
  type ShopOrderRefundAction,
  type ShopOrderWriteOff,
} from './shop-order-refund-plan';

export type AdjustmentPlanLine = ShopOrderPlanOrderLine & {
  unitPriceCents: number;
};

/** L'article pris en échange, tel qu'il est en vente à cet instant. */
export type AdjustmentNewItem = {
  variantId: string;
  label: string;
  unitPriceCents: number;
  /** Déclinaison ET produit en vente. */
  active: boolean;
  trackStock: boolean;
  available: number;
  preorderEnabled: boolean;
};

export type ShopOrderAdjustmentPlanInput = {
  order: {
    status: ShopOrderStatus;
    fulfilledAt: Date | null;
    deliveredAt: Date | null;
    lines: AdjustmentPlanLine[];
  };
  lineId: string;
  /** Unités retirées de la ligne. */
  qty: number;
  /** Échange : l'article pris et sa quantité. `null` : annulation d'articles. */
  exchange: null | { newQty: number; item: AdjustmentNewItem | null };
  /** Commande remise : l'adhérent a rapporté l'article. */
  goodsReturned: boolean;
  /** L'article rendu est déclaré perdu, cassé ou volé. */
  goodsLost: boolean;
  invoices: ShopOrderPlanInvoice[];
  /** Prélèvements d'échéance partis mais pas encore dénoués. */
  inFlightCents: number;
};

export type ShopOrderAdjustmentPlan = {
  /** Raisons de refuser. Vide : l'ajustement peut avoir lieu. */
  blockers: string[];
  delivered: boolean;
  exited: boolean;
  /** Échange d'une commande remise : l'adhérent signe ce qu'il reçoit. */
  signatureRequired: boolean;
  removedCents: number;
  addedCents: number;
  /** Ajouté − retiré. */
  differenceCents: number;
  goods: {
    /** Unités qui attendaient l'arrivage : l'attente baisse, rien à rendre. */
    fromAwaiting: number;
    /** Unités seulement réservées, libérées. */
    releaseUnits: number;
    /** Unités sorties du stock, qui reviennent au club. */
    returnUnits: number;
  };
  newItem: null | {
    label: string;
    unitPriceCents: number;
    quantity: number;
    reservedUnits: number;
    awaitingUnits: number;
  };
  /** Facture du reste à payer, quand la différence est due. */
  supplementCents: number;
  refunds: ShopOrderRefundAction[];
  refundCents: number;
  writeOffs: ShopOrderWriteOff[];
  writeOffCents: number;
  /** Factures du reste à payer sans encaissement, entièrement éteintes. */
  voidInvoiceIds: string[];
  /** Factures ouvertes que l'ajustement solde. */
  settleInvoiceIds: string[];
  /** La facture de la commande est soldée : la commande en attente passe payée. */
  settlesOrder: boolean;
};

const sum = (values: number[]) => values.reduce((a, b) => a + b, 0);

/**
 * LE calcul d'un ajustement de commande — annulation d'articles ou échange
 * (ADR-0020) —, montré à l'admin avant qu'il confirme puis exécuté tel quel.
 *
 * Pur, comme le plan d'annulation (ADR-0019) : l'aperçu et l'exécution
 * appellent la même fonction sur les mêmes données.
 *
 * L'argent ne suit que la différence entre ce qui est retiré et ce qui est
 * ajouté :
 *  - due : une facture du reste à payer ;
 *  - à rendre : ce qui a été payé au-delà du nouveau montant de la commande
 *    est rendu, du plus récent encaissement au plus ancien ; le reste de la
 *    différence est éteint par un avoir.
 */
export function planShopOrderAdjustment(
  input: ShopOrderAdjustmentPlanInput,
): ShopOrderAdjustmentPlan {
  const { order, invoices, exchange } = input;
  const blockers: string[] = [];
  const delivered = order.deliveredAt !== null;
  const exited = hasExited(order);

  const plan: ShopOrderAdjustmentPlan = {
    blockers,
    delivered,
    exited,
    signatureRequired: exchange !== null && delivered,
    removedCents: 0,
    addedCents: 0,
    differenceCents: 0,
    goods: { fromAwaiting: 0, releaseUnits: 0, returnUnits: 0 },
    newItem: null,
    supplementCents: 0,
    refunds: [],
    refundCents: 0,
    writeOffs: [],
    writeOffCents: 0,
    voidInvoiceIds: [],
    settleInvoiceIds: [],
    settlesOrder: false,
  };

  if (order.status === ShopOrderStatus.CANCELLED) {
    blockers.push('Cette commande est annulée.');
    return plan;
  }
  const line = order.lines.find((l) => l.id === input.lineId);
  if (!line) {
    blockers.push('Article introuvable dans cette commande.');
    return plan;
  }
  const active = activeQty(line);
  if (!Number.isInteger(input.qty) || input.qty < 1 || input.qty > active) {
    blockers.push(
      active > 0
        ? `Quantité invalide : entre 1 et ${active}.`
        : 'Cet article est déjà entièrement retiré de la commande.',
    );
    return plan;
  }
  if (exchange && (!Number.isInteger(exchange.newQty) || exchange.newQty < 1)) {
    blockers.push('Indique combien d’articles sont pris en échange.');
    return plan;
  }

  if (delivered && !input.goodsReturned) {
    blockers.push('Commande remise : l’adhérent doit rapporter l’article.');
  }
  if (input.goodsLost && !exited) {
    blockers.push(
      'Rien n’a quitté le club sur cette commande : l’article ne peut pas être déclaré perdu.',
    );
  }
  if (input.inFlightCents > 0) {
    blockers.push(
      'Un prélèvement d’échéance est en cours de dénouement : attends son issue.',
    );
  }
  const activeUnits = sum(order.lines.map(activeQty));
  if (activeUnits - input.qty + (exchange?.newQty ?? 0) <= 0) {
    blockers.push(
      'C’est le dernier article de la commande : annule plutôt la commande.',
    );
  }

  // Les unités qui attendaient l'arrivage n'ont rien réservé : on les retire
  // en premier, et il ne reste que le reste à libérer ou à reprendre.
  if (line.variantId !== null) {
    const fromAwaiting = Math.min(input.qty, line.awaitingStockQty);
    const rest = input.qty - fromAwaiting;
    plan.goods = {
      fromAwaiting,
      releaseUnits: exited ? 0 : rest,
      returnUnits: exited ? rest : 0,
    };
  }

  plan.removedCents = input.qty * line.unitPriceCents;

  if (exchange) {
    const item = exchange.item;
    if (!item || !item.active) {
      blockers.push('Le nouvel article n’est pas en vente.');
    } else {
      plan.addedCents = exchange.newQty * item.unitPriceCents;
      // Même déclinaison : ce que l'échange rend redevient disponible pour ce
      // qu'il prend — sauf un article déclaré perdu.
      const freed =
        item.variantId === line.variantId && !input.goodsLost
          ? plan.goods.releaseUnits + plan.goods.returnUnits
          : 0;
      const available = Math.max(0, item.available + freed);
      const reservedUnits = item.trackStock
        ? Math.min(exchange.newQty, available)
        : exchange.newQty;
      const awaitingUnits = exchange.newQty - reservedUnits;
      if (awaitingUnits > 0 && (delivered || !item.preorderEnabled)) {
        blockers.push(
          delivered
            ? `Stock insuffisant pour remettre « ${item.label} » : ${available} disponible(s).`
            : `Stock insuffisant pour « ${item.label} » : ${available} disponible(s).`,
        );
      }
      plan.newItem = {
        label: item.label,
        unitPriceCents: item.unitPriceCents,
        quantity: exchange.newQty,
        reservedUnits,
        awaitingUnits,
      };
    }
  }

  plan.differenceCents = plan.addedCents - plan.removedCents;

  if (plan.differenceCents > 0) {
    plan.supplementCents = plan.differenceCents;
  } else if (plan.differenceCents < 0) {
    const giveBack = -plan.differenceCents;
    const live = invoices.filter((i) => i.status !== InvoiceStatus.VOID);
    const effective = sum(live.map((i) => i.amountCents - i.creditNotesCents));
    const netPaid = sum(live.map((i) => netPaidCents(i, blockers)));
    // Rendu : ce qui a été payé au-delà du nouveau montant facturé. Ce montant
    // n'est jamais négatif : une commande antérieure à la facturation n'a rien
    // encaissé, donc rien à rendre.
    plan.refundCents = Math.min(
      giveBack,
      Math.max(0, netPaid - Math.max(0, effective - giveBack)),
    );
    plan.refunds = planRefunds(invoices, plan.refundCents, blockers);
    const extinction = planWriteOffs(
      invoices,
      giveBack - plan.refundCents,
      blockers,
    );
    plan.writeOffs = extinction.writeOffs;
    plan.writeOffCents = sum(extinction.writeOffs.map((w) => w.amountCents));
    plan.voidInvoiceIds = extinction.voidInvoiceIds;
  }

  // Facture soldée : ouverte, avec encore des encaissements, et plus rien de
  // dû une fois l'avoir d'extinction émis.
  for (const inv of invoices) {
    if (inv.status !== InvoiceStatus.OPEN) continue;
    const writtenOff = sum(
      plan.writeOffs.filter((w) => w.invoiceId === inv.id).map((w) => w.amountCents),
    );
    if (writtenOff === 0) continue;
    const refunded = sum(
      plan.refunds.filter((r) => r.invoiceId === inv.id).map((r) => r.amountCents),
    );
    const netAfter = netPaidCents(inv, []) - refunded;
    if (netAfter > 0 && dueCents(inv, []) - writtenOff === 0) {
      plan.settleInvoiceIds.push(inv.id);
    }
  }
  const orderInvoice = invoices.find((i) => !i.supplement);
  plan.settlesOrder =
    order.status === ShopOrderStatus.PENDING &&
    orderInvoice !== undefined &&
    plan.settleInvoiceIds.includes(orderInvoice.id);

  return plan;
}
