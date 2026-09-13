import {
  ChequeStatus,
  ClubPaymentMethod,
  InvoiceStatus,
  ShopOrderStatus,
} from '@prisma/client';

/** Comment un encaissement est rendu à l'annulation d'une commande (ADR-0019). */
export enum ShopOrderRefundKind {
  /** Remboursement Stripe, sur la carte qui a payé. */
  CARD = 'CARD',
  /** Rendu en espèces. */
  CASH = 'CASH',
  /** Rendu par virement, depuis le compte de l'encaissement. */
  TRANSFER = 'TRANSFER',
  /** Chèque encore en portefeuille : rendu à l'adhérent. */
  CHEQUE_RETURN = 'CHEQUE_RETURN',
  /** Chèque déjà remis : remboursé depuis la banque de sa remise. */
  CHEQUE_DEPOSITED = 'CHEQUE_DEPOSITED',
}

export type ShopOrderPlanPayment = {
  id: string;
  amountCents: number;
  method: ClubPaymentMethod;
  externalRef: string | null;
  refundedPaymentId: string | null;
  cheque: null | {
    id: string;
    number: string | null;
    status: ChequeStatus;
    depositId: string | null;
    /** Compte bancaire de la remise, si le chèque a été remis. */
    depositAccountId: string | null;
  };
};

export type ShopOrderPlanInput = {
  order: {
    status: ShopOrderStatus;
    fulfilledAt: Date | null;
    deliveredAt: Date | null;
    lines: Array<{
      id: string;
      label: string;
      quantity: number;
      awaitingStockQty: number;
      variantId: string | null;
    }>;
  };
  invoice: null | {
    status: InvoiceStatus;
    amountCents: number;
    /** Avoirs déjà émis sur la facture, hors avoirs annulés. */
    creditNotesCents: number;
    payments: ShopOrderPlanPayment[];
  };
  /** Prélèvements d'échéance partis mais pas encore dénoués. */
  inFlightCents: number;
};

export type ShopOrderRefundAction = {
  kind: ShopOrderRefundKind;
  paymentId: string;
  /** Ce qui reste à rendre sur cet encaissement : montant moins ses remboursements. */
  amountCents: number;
  chequeId: string | null;
  chequeNumber: string | null;
  /** Compte d'où part l'argent d'un chèque déjà remis : la banque de sa remise. */
  bankAccountId: string | null;
};

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

export type ShopOrderCancellationPlan = {
  /** Raisons de refuser l'annulation. Vide : elle peut avoir lieu. */
  blockers: string[];
  delivered: boolean;
  /** Vrai si la marchandise est sortie du stock (payée, ou remise). */
  exited: boolean;
  refunds: ShopOrderRefundAction[];
  /** Reste dû jamais encaissé, éteint par un avoir d'annulation. */
  writeOffCents: number;
  /** Facture sans aucun encaissement : elle est simplement annulée. */
  voidInvoice: boolean;
  lines: ShopOrderPlanLine[];
};

/**
 * LE calcul de l'annulation d'une commande boutique (ADR-0019), montré à
 * l'admin avant qu'il confirme puis exécuté tel quel.
 *
 * Pur : aucune lecture, aucune écriture. C'est ce qui permet de garantir que
 * l'aperçu et l'exécution disent la même chose — ils appellent la même
 * fonction sur les mêmes données.
 *
 * Chaque encaissement est rendu par son propre moyen, pour ce qui n'en a pas
 * déjà été remboursé. Le reste dû jamais encaissé est éteint par un avoir, et
 * une facture sans aucun encaissement est simplement annulée : la comptabilité
 * étant tenue à l'encaissement, ni l'un ni l'autre n'appelle d'écriture.
 */
export function planShopOrderCancellation(
  input: ShopOrderPlanInput,
): ShopOrderCancellationPlan {
  const { order, invoice } = input;
  const blockers: string[] = [];

  if (order.status === ShopOrderStatus.CANCELLED) {
    blockers.push('Cette commande est déjà annulée.');
  }
  if (input.inFlightCents > 0) {
    blockers.push(
      'Un prélèvement d’échéance est en cours de dénouement : attends son issue avant d’annuler.',
    );
  }

  // ADR-0017 : la marchandise est sortie au règlement complet ou à la remise.
  const exited =
    order.status === ShopOrderStatus.PAID || order.fulfilledAt !== null;
  const delivered = order.deliveredAt !== null;

  const refunds: ShopOrderRefundAction[] = [];
  let netPaidCents = 0;
  if (invoice) {
    // Ce qui a déjà été rendu, encaissement par encaissement.
    const refundedByPayment = new Map<string, number>();
    for (const p of invoice.payments) {
      if (p.amountCents >= 0) continue;
      if (!p.refundedPaymentId) {
        blockers.push(
          'La facture porte un remboursement rattaché à aucun encaissement : annule depuis la facture.',
        );
        continue;
      }
      refundedByPayment.set(
        p.refundedPaymentId,
        (refundedByPayment.get(p.refundedPaymentId) ?? 0) - p.amountCents,
      );
    }
    for (const p of invoice.payments) {
      if (p.amountCents <= 0) continue;
      const net = p.amountCents - (refundedByPayment.get(p.id) ?? 0);
      if (net <= 0) continue;
      netPaidCents += net;
      const action = refundActionFor(p, net, blockers);
      if (action) refunds.push(action);
    }
  }

  const hasPayments = (invoice?.payments.length ?? 0) > 0;
  const voidInvoice =
    invoice !== null && !hasPayments && invoice.status === InvoiceStatus.OPEN;
  // Chaque remboursement émet un avoir de son montant (ADR-0011). Avec l'avoir
  // d'annulation, les avoirs couvrent alors exactement la facture.
  const writeOffCents =
    invoice !== null && hasPayments && invoice.status !== InvoiceStatus.VOID
      ? Math.max(0, invoice.amountCents - invoice.creditNotesCents - netPaidCents)
      : 0;

  const lines = order.lines.map((l) => {
    const units = l.variantId ? Math.max(0, l.quantity - l.awaitingStockQty) : 0;
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
    writeOffCents,
    voidInvoice,
    lines,
  };
}

function refundActionFor(
  p: ShopOrderPlanPayment,
  amountCents: number,
  blockers: string[],
): ShopOrderRefundAction | null {
  const base = {
    paymentId: p.id,
    amountCents,
    chequeId: null,
    chequeNumber: null,
    bankAccountId: null,
  };
  switch (p.method) {
    case ClubPaymentMethod.STRIPE_CARD:
      if (!p.externalRef?.startsWith('pi_')) {
        blockers.push(
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
        return {
          ...base,
          kind: ShopOrderRefundKind.CHEQUE_RETURN,
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
      blockers.push(
        `Le chèque ${cheque.number ? `n° ${cheque.number} ` : ''}est impayé ou annulé : régularise-le avant d’annuler la commande.`,
      );
      return null;
    }
  }
}
