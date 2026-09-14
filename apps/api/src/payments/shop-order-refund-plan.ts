import {
  ChequeStatus,
  ClubPaymentMethod,
  InvoiceStatus,
  ShopOrderStatus,
} from '@prisma/client';

/** Comment un encaissement est rendu (ADR-0019, ADR-0020). */
export enum ShopOrderRefundKind {
  /** Remboursement Stripe, sur la carte qui a payé. */
  CARD = 'CARD',
  /** Rendu en espèces. */
  CASH = 'CASH',
  /** Rendu par virement, depuis le compte de l'encaissement. */
  TRANSFER = 'TRANSFER',
  /** Chèque encore en portefeuille : rendu à l'adhérent, en entier. */
  CHEQUE_RETURN = 'CHEQUE_RETURN',
  /** Chèque déjà remis : remboursé depuis la banque de sa remise. */
  CHEQUE_DEPOSITED = 'CHEQUE_DEPOSITED',
  /**
   * Chèque encore en portefeuille dont on ne rend qu'une part (ADR-0020) : un
   * chèque ne se coupe pas. La part est reversée par virement depuis la banque
   * du club, et le chèque reste à remettre.
   */
  CHEQUE_PARTIAL = 'CHEQUE_PARTIAL',
}

export type ShopOrderPlanPayment = {
  id: string;
  amountCents: number;
  method: ClubPaymentMethod;
  externalRef: string | null;
  refundedPaymentId: string | null;
  createdAt: Date;
  cheque: null | {
    id: string;
    number: string | null;
    status: ChequeStatus;
    depositId: string | null;
    /** Compte bancaire de la remise, si le chèque a été remis. */
    depositAccountId: string | null;
  };
};

/**
 * Une facture de la commande : celle de la commande, ou celle du reste à payer
 * d'un échange (ADR-0020).
 */
export type ShopOrderPlanInvoice = {
  id: string;
  supplement: boolean;
  status: InvoiceStatus;
  amountCents: number;
  /** Avoirs déjà émis sur la facture, hors avoirs annulés. */
  creditNotesCents: number;
  createdAt: Date;
  payments: ShopOrderPlanPayment[];
};

export type ShopOrderRefundAction = {
  kind: ShopOrderRefundKind;
  paymentId: string;
  /** Facture de l'encaissement rendu : son avoir s'y rattache. */
  invoiceId: string;
  amountCents: number;
  chequeId: string | null;
  chequeNumber: string | null;
  /**
   * Compte d'où part l'argent d'un chèque : la banque de sa remise. NULL pour
   * une part de chèque en portefeuille — le service prend la banque du club.
   */
  bankAccountId: string | null;
};

export type ShopOrderWriteOff = { invoiceId: string; amountCents: number };

export type ShopOrderPlanLine = {
  lineId: string;
  label: string;
  /** Unités déjà sorties du stock, qui reviennent au club. */
  returnUnits: number;
  /** Unités seulement réservées, libérées. */
  releaseUnits: number;
  /** Unités en attente d'arrivage : l'attente s'éteint. */
  awaitingUnits: number;
};

export type ShopOrderPlanOrderLine = {
  id: string;
  label: string;
  quantity: number;
  cancelledQty: number;
  awaitingStockQty: number;
  variantId: string | null;
};

export type ShopOrderPlanInput = {
  order: {
    status: ShopOrderStatus;
    fulfilledAt: Date | null;
    deliveredAt: Date | null;
    lines: ShopOrderPlanOrderLine[];
  };
  invoices: ShopOrderPlanInvoice[];
  /** Prélèvements d'échéance partis mais pas encore dénoués. */
  inFlightCents: number;
};

export type ShopOrderCancellationPlan = {
  /** Raisons de refuser l'annulation. Vide : elle peut avoir lieu. */
  blockers: string[];
  delivered: boolean;
  /** Vrai si la marchandise est sortie du stock (payée, ou remise). */
  exited: boolean;
  refunds: ShopOrderRefundAction[];
  /** Reste dû jamais encaissé, éteint par un avoir, facture par facture. */
  writeOffs: ShopOrderWriteOff[];
  writeOffCents: number;
  /** Factures sans aucun encaissement : simplement annulées. */
  voidInvoiceIds: string[];
  voidInvoice: boolean;
  lines: ShopOrderPlanLine[];
};

const ORPHAN_REFUND =
  'La facture porte un remboursement rattaché à aucun encaissement : annule depuis la facture.';

/** Unités de la ligne encore dans la commande (ADR-0020). */
export function activeQty(line: {
  quantity: number;
  cancelledQty: number;
}): number {
  return line.quantity - line.cancelledQty;
}

/** Sortie du stock (ADR-0017) : au règlement complet ou à la remise. */
export function hasExited(order: {
  status: ShopOrderStatus;
  fulfilledAt: Date | null;
}): boolean {
  return order.status === ShopOrderStatus.PAID || order.fulfilledAt !== null;
}

function pushOnce(blockers: string[], message: string): void {
  if (!blockers.includes(message)) blockers.push(message);
}

/**
 * Les encaissements d'une facture qui ont encore quelque chose à rendre : leur
 * montant moins leurs remboursements.
 */
export function netPayments(
  invoice: ShopOrderPlanInvoice,
  blockers: string[],
): Array<{ payment: ShopOrderPlanPayment; netCents: number }> {
  const refunded = new Map<string, number>();
  for (const p of invoice.payments) {
    if (p.amountCents >= 0) continue;
    if (!p.refundedPaymentId) {
      pushOnce(blockers, ORPHAN_REFUND);
      continue;
    }
    refunded.set(
      p.refundedPaymentId,
      (refunded.get(p.refundedPaymentId) ?? 0) - p.amountCents,
    );
  }
  return invoice.payments
    .filter((p) => p.amountCents > 0)
    .map((p) => ({ payment: p, netCents: p.amountCents - (refunded.get(p.id) ?? 0) }))
    .filter((x) => x.netCents > 0);
}

export function netPaidCents(
  invoice: ShopOrderPlanInvoice,
  blockers: string[],
): number {
  return netPayments(invoice, blockers).reduce((sum, x) => sum + x.netCents, 0);
}

/** Reste dû d'une facture, avoirs déduits (ADR-0011). */
export function dueCents(
  invoice: ShopOrderPlanInvoice,
  blockers: string[],
): number {
  if (invoice.status === InvoiceStatus.VOID) return 0;
  return Math.max(
    0,
    invoice.amountCents - invoice.creditNotesCents - netPaidCents(invoice, blockers),
  );
}

/**
 * Rend `amountCents` sur les encaissements de la commande, du plus récent au
 * plus ancien, chacun par son propre moyen (ADR-0020). Le plus récent d'abord :
 * c'est le règlement de ce qui vient d'être ajouté — un reste à payer, un
 * complément — qui se défait en premier.
 */
export function planRefunds(
  invoices: ShopOrderPlanInvoice[],
  amountCents: number,
  blockers: string[],
): ShopOrderRefundAction[] {
  if (amountCents <= 0) return [];
  const candidates = invoices
    .filter((i) => i.status !== InvoiceStatus.VOID)
    .flatMap((i) => netPayments(i, blockers).map((x) => ({ ...x, invoiceId: i.id })))
    .sort(
      (a, b) =>
        b.payment.createdAt.getTime() - a.payment.createdAt.getTime() ||
        (a.payment.id < b.payment.id ? 1 : a.payment.id > b.payment.id ? -1 : 0),
    );

  const actions: ShopOrderRefundAction[] = [];
  let remaining = amountCents;
  for (const c of candidates) {
    if (remaining <= 0) break;
    const take = Math.min(c.netCents, remaining);
    const action = refundActionFor(c.payment, c.invoiceId, take, blockers);
    if (action) actions.push(action);
    remaining -= take;
  }
  if (remaining > 0) {
    pushOnce(
      blockers,
      'Le montant à rendre dépasse ce qui a été encaissé sur la commande.',
    );
  }
  return actions;
}

/**
 * Éteint `amountCents` de reste dû par des avoirs, sur les factures qui en ont
 * encore — factures du reste à payer d'abord, de la plus récente à la plus
 * ancienne. Une facture sans aucun encaissement ni avoir, entièrement éteinte,
 * est annulée plutôt que couverte d'un avoir.
 *
 * Renvoie ce qui n'a trouvé aucune facture : une commande antérieure à la
 * facturation n'a rien à éteindre.
 */
export function planWriteOffs(
  invoices: ShopOrderPlanInvoice[],
  amountCents: number,
  blockers: string[],
): { writeOffs: ShopOrderWriteOff[]; voidInvoiceIds: string[]; uncoveredCents: number } {
  const ordered = invoices
    .filter((i) => i.status !== InvoiceStatus.VOID)
    .sort(
      (a, b) =>
        Number(b.supplement) - Number(a.supplement) ||
        b.createdAt.getTime() - a.createdAt.getTime(),
    );
  const writeOffs: ShopOrderWriteOff[] = [];
  const voidInvoiceIds: string[] = [];
  let remaining = amountCents;
  for (const inv of ordered) {
    if (remaining <= 0) break;
    const due = dueCents(inv, blockers);
    if (due <= 0) continue;
    if (
      inv.status === InvoiceStatus.OPEN &&
      inv.payments.length === 0 &&
      inv.creditNotesCents === 0 &&
      remaining >= inv.amountCents
    ) {
      voidInvoiceIds.push(inv.id);
      remaining -= inv.amountCents;
      continue;
    }
    const take = Math.min(due, remaining);
    writeOffs.push({ invoiceId: inv.id, amountCents: take });
    remaining -= take;
  }
  return { writeOffs, voidInvoiceIds, uncoveredCents: Math.max(0, remaining) };
}

/**
 * LE calcul de l'annulation d'une commande entière (ADR-0019), montré à
 * l'admin avant qu'il confirme puis exécuté tel quel.
 *
 * Pur : aucune lecture, aucune écriture. C'est ce qui garantit que l'aperçu et
 * l'exécution disent la même chose — ils appellent la même fonction sur les
 * mêmes données.
 *
 * Chaque encaissement de chaque facture de la commande — la sienne et celles
 * du reste à payer d'un échange (ADR-0020) — est rendu par son propre moyen,
 * pour ce qui n'en a pas déjà été remboursé. Le reste dû jamais encaissé est
 * éteint par un avoir, et une facture sans aucun encaissement est simplement
 * annulée : la comptabilité étant tenue à l'encaissement, ni l'un ni l'autre
 * n'appelle d'écriture.
 */
export function planShopOrderCancellation(
  input: ShopOrderPlanInput,
): ShopOrderCancellationPlan {
  const { order, invoices } = input;
  const blockers: string[] = [];

  if (order.status === ShopOrderStatus.CANCELLED) {
    blockers.push('Cette commande est déjà annulée.');
  }
  if (input.inFlightCents > 0) {
    blockers.push(
      'Un prélèvement d’échéance est en cours de dénouement : attends son issue avant d’annuler.',
    );
  }

  const exited = hasExited(order);
  const delivered = order.deliveredAt !== null;

  const netPaidTotal = invoices.reduce(
    (sum, inv) => sum + (inv.status === InvoiceStatus.VOID ? 0 : netPaidCents(inv, blockers)),
    0,
  );
  const refunds = planRefunds(invoices, netPaidTotal, blockers);

  // Chaque remboursement émet un avoir de son montant (ADR-0011). Avec l'avoir
  // d'annulation, les avoirs couvrent alors exactement chaque facture.
  const writeOffs: ShopOrderWriteOff[] = [];
  const voidInvoiceIds: string[] = [];
  for (const inv of invoices) {
    if (inv.status === InvoiceStatus.VOID) continue;
    if (inv.payments.length === 0) {
      if (inv.status === InvoiceStatus.OPEN) voidInvoiceIds.push(inv.id);
      continue;
    }
    const due = dueCents(inv, blockers);
    if (due > 0) writeOffs.push({ invoiceId: inv.id, amountCents: due });
  }

  const lines = order.lines.map((l) => {
    const units = l.variantId
      ? Math.max(0, activeQty(l) - l.awaitingStockQty)
      : 0;
    return {
      lineId: l.id,
      label: l.label,
      returnUnits: exited ? units : 0,
      releaseUnits: exited ? 0 : units,
      awaitingUnits: l.variantId ? l.awaitingStockQty : 0,
    };
  });

  return {
    blockers,
    delivered,
    exited,
    refunds,
    writeOffs,
    writeOffCents: writeOffs.reduce((sum, w) => sum + w.amountCents, 0),
    voidInvoiceIds,
    voidInvoice: voidInvoiceIds.length > 0,
    lines,
  };
}

function refundActionFor(
  p: ShopOrderPlanPayment,
  invoiceId: string,
  amountCents: number,
  blockers: string[],
): ShopOrderRefundAction | null {
  const base = {
    paymentId: p.id,
    invoiceId,
    amountCents,
    chequeId: null,
    chequeNumber: null,
    bankAccountId: null,
  };
  switch (p.method) {
    case ClubPaymentMethod.STRIPE_CARD:
      if (!p.externalRef?.startsWith('pi_')) {
        pushOnce(
          blockers,
          'Un règlement par carte n’a pas de référence Stripe : il ne peut pas être remboursé depuis ClubFlow.',
        );
        return null;
      }
      return { ...base, kind: ShopOrderRefundKind.CARD };
    case ClubPaymentMethod.MANUAL_CASH:
      return { ...base, kind: ShopOrderRefundKind.CASH };
    case ClubPaymentMethod.MANUAL_TRANSFER:
      return { ...base, kind: ShopOrderRefundKind.TRANSFER };
    case ClubPaymentMethod.MANUAL_CHECK: {
      const cheque = p.cheque;
      // Chèque saisi avant le portefeuille (ADR-0015) : il a été enregistré
      // directement en banque, c'est de là qu'il se rembourse.
      if (!cheque) return { ...base, kind: ShopOrderRefundKind.TRANSFER };
      if (cheque.status === ChequeStatus.PENDING && cheque.depositId === null) {
        // Rendre le chèque, c'est rendre TOUT son montant : seulement s'il
        // n'a encore rien remboursé, et si c'est tout ce qu'on rend.
        const whole = amountCents === p.amountCents;
        return {
          ...base,
          kind: whole
            ? ShopOrderRefundKind.CHEQUE_RETURN
            : ShopOrderRefundKind.CHEQUE_PARTIAL,
          chequeId: cheque.id,
          chequeNumber: cheque.number,
        };
      }
      if (cheque.status === ChequeStatus.DEPOSITED && cheque.depositAccountId) {
        return {
          ...base,
          kind: ShopOrderRefundKind.CHEQUE_DEPOSITED,
          chequeId: cheque.id,
          chequeNumber: cheque.number,
          bankAccountId: cheque.depositAccountId,
        };
      }
      pushOnce(
        blockers,
        `Le chèque ${cheque.number ? `n° ${cheque.number} ` : ''}est impayé ou annulé : régularise-le avant d’annuler.`,
      );
      return null;
    }
  }
}
