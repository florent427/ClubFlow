import { ClubPaymentMethod, InvoicePurpose, type Prisma } from '@prisma/client';
import type { PayerCreditHolder } from './payer-credit-holder';

export type PayerCreditDeposit = {
  invoiceId: string;
  label: string;
  createdAt: Date;
  /** Net versé sur le reçu : un remboursement y compte en négatif. */
  amountCents: number;
  payments: Array<{
    id: string;
    amountCents: number;
    method: ClubPaymentMethod;
    externalRef: string | null;
    createdAt: Date;
  }>;
};

/** Une imputation du crédit sur une facture ; un crédit rendu est négatif. */
export type PayerCreditUse = {
  paymentId: string;
  invoiceId: string;
  invoiceLabel: string;
  amountCents: number;
  createdAt: Date;
};

export type PayerCreditBalance = {
  balanceCents: number;
  deposits: PayerCreditDeposit[];
  uses: PayerCreditUse[];
};

type Db = Pick<Prisma.TransactionClient, 'invoice' | 'payment'>;

/**
 * LA formule du crédit d'une personne (ADR-0022, §4), stockée nulle part :
 *
 *   paiements de ses reçus d'avance − ses paiements PAYER_CREDIT
 *
 * Remboursements et crédits rendus y comptent avec leur signe. Accepte une
 * transaction : l'imputation relit le crédit sous verrou.
 */
export async function readPayerCredit(
  db: Db,
  clubId: string,
  holder: PayerCreditHolder,
): Promise<PayerCreditBalance> {
  const receipts = await db.invoice.findMany({
    where: {
      clubId,
      purpose: InvoicePurpose.PAYER_CREDIT_DEPOSIT,
      OR: [
        { payerCreditMemberId: { in: holder.memberIds } },
        { payerCreditContactId: { in: holder.contactIds } },
      ],
    },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      label: true,
      createdAt: true,
      payments: {
        orderBy: { createdAt: 'asc' },
        select: {
          id: true,
          amountCents: true,
          method: true,
          externalRef: true,
          createdAt: true,
        },
      },
    },
  });
  const creditPayments = await db.payment.findMany({
    where: {
      clubId,
      method: ClubPaymentMethod.PAYER_CREDIT,
      OR: [
        { paidByMemberId: { in: holder.memberIds } },
        { paidByContactId: { in: holder.contactIds } },
      ],
    },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      amountCents: true,
      createdAt: true,
      invoice: { select: { id: true, label: true } },
    },
  });

  const deposits = receipts.map((r) => ({
    invoiceId: r.id,
    label: r.label,
    createdAt: r.createdAt,
    amountCents: r.payments.reduce((sum, p) => sum + p.amountCents, 0),
    payments: r.payments,
  }));
  const uses = creditPayments.map((p) => ({
    paymentId: p.id,
    invoiceId: p.invoice.id,
    invoiceLabel: p.invoice.label,
    amountCents: p.amountCents,
    createdAt: p.createdAt,
  }));
  const deposited = deposits.reduce((sum, d) => sum + d.amountCents, 0);
  const used = uses.reduce((sum, u) => sum + u.amountCents, 0);
  return { balanceCents: deposited - used, deposits, uses };
}
