import {
  InvoiceStatus,
  PaymentScheduleInstallmentStatus,
} from '@prisma/client';
import { invoicePaymentTotals } from './invoice-totals';

/**
 * Solde réel d'une facture, tel qu'il fait foi au moment de décider d'un
 * encaissement (cf. ADR-0009).
 *
 * Ce calcul existe parce qu'une facture peut être soldée par un chemin que le
 * plan d'échéances ignore : règlement manuel saisi par le trésorier, paiement
 * via un client mobile ancien, ou avoir émis après coup. Le moteur de
 * prélèvement doit donc relire cet état juste avant de débiter, et pas se fier
 * au plan établi à la souscription.
 *
 * Les avoirs sont déduits : les oublier ferait prélever un adhérent du montant
 * de l'avoir en trop.
 *
 * Les prélèvements EN VOL le sont aussi. C'est le point le moins intuitif : le
 * moteur n'écrit jamais de ligne Payment, c'est le webhook de succès qui le
 * fait. Entre l'appel à Stripe et ce webhook — 3 à 5 jours en SEPA — l'argent
 * est engagé mais invisible des tables Payment. Sans cette déduction, deux
 * échéances dues le même jour se croient toutes deux couvertes par le solde
 * entier, et le trésorier peut encaisser un chèque par-dessus un prélèvement
 * déjà parti.
 */

export type InvoiceBalance = {
  /** `null` si la facture n'existe pas (ou pas dans ce club). */
  status: InvoiceStatus | null;
  /** Montant restant dû d'après ce qui est CONSTATÉ (paiements, avoirs). */
  balanceCents: number;
  /**
   * Montant déjà engagé chez Stripe et pas encore constaté : échéances parties
   * dont le webhook n'est pas revenu.
   */
  inFlightCents: number;
  /**
   * Ce qu'on peut encore réclamer sans risquer un doublon : le solde dû moins
   * ce qui est déjà en vol. C'est CETTE valeur qui doit plafonner un
   * prélèvement ou autoriser un encaissement, jamais `balanceCents`.
   */
  collectableCents: number;
  /** Vrai si la facture peut encore recevoir un encaissement. */
  isCollectable: boolean;
};

/**
 * Sous-ensemble de PrismaService utilisé ici.
 *
 * Volontairement lâche sur les types de retour : les types générés par Prisma
 * pour `aggregate` dépendent des champs sélectionnés et ne se laissent pas
 * décrire structurellement sans les réimporter. Un test passe un double par
 * `as unknown as InvoiceBalanceReader`.
 */
export type InvoiceBalanceReader = {
  invoice: {
    findFirst: (args: never) => Promise<unknown>;
    aggregate: (args: never) => Promise<unknown>;
  };
  payment: {
    aggregate: (args: never) => Promise<unknown>;
  };
  paymentScheduleInstallment: {
    aggregate: (args: never) => Promise<unknown>;
  };
};

type InvoiceRow = {
  id: string;
  amountCents: number;
  status: InvoiceStatus;
  isCreditNote: boolean;
};

type SumRow = { _sum?: { amountCents?: number | null } | null };

export async function resolveInvoiceBalance(
  prisma: InvoiceBalanceReader,
  invoiceId: string,
  clubId?: string,
): Promise<InvoiceBalance> {
  const invoice = (await prisma.invoice.findFirst({
    where: { id: invoiceId, ...(clubId ? { clubId } : {}) },
    select: {
      id: true,
      amountCents: true,
      status: true,
      isCreditNote: true,
    },
  } as never)) as InvoiceRow | null;
  if (!invoice) {
    return {
      status: null,
      balanceCents: 0,
      inFlightCents: 0,
      collectableCents: 0,
      isCollectable: false,
    };
  }

  const [paidAgg, creditAgg, inFlightAgg] = (await Promise.all([
    prisma.payment.aggregate({
      where: { invoiceId: invoice.id },
      _sum: { amountCents: true },
    } as never),
    prisma.invoice.aggregate({
      where: {
        parentInvoiceId: invoice.id,
        isCreditNote: true,
        // Un avoir annulé ne déduit plus rien.
        status: { not: InvoiceStatus.VOID },
      },
      _sum: { amountCents: true },
    } as never),
    // Échéances parties chez Stripe dont le sort n'est pas encore connu :
    // un PaymentIntent existe, aucun Payment ne leur est encore rattaché.
    prisma.paymentScheduleInstallment.aggregate({
      where: {
        schedule: { invoiceId: invoice.id },
        status: {
          in: [
            PaymentScheduleInstallmentStatus.PROCESSING,
            PaymentScheduleInstallmentStatus.REQUIRES_ACTION,
          ],
        },
        stripePaymentIntentId: { not: null },
        paymentId: null,
      },
      _sum: { amountCents: true },
    } as never),
  ])) as [SumRow, SumRow, SumRow];

  const { balanceCents } = invoicePaymentTotals(
    invoice.amountCents,
    paidAgg._sum?.amountCents ?? 0,
    creditAgg._sum?.amountCents ?? 0,
    invoice.isCreditNote,
  );

  const inFlightCents = inFlightAgg._sum?.amountCents ?? 0;
  const collectableCents = Math.max(0, balanceCents - inFlightCents);

  return {
    status: invoice.status,
    balanceCents,
    inFlightCents,
    collectableCents,
    isCollectable: invoice.status === InvoiceStatus.OPEN && collectableCents > 0,
  };
}
