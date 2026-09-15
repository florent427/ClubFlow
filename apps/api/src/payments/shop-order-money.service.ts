import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import {
  ChequeStatus,
  ClubFinancialAccountKind,
  ClubPaymentMethod,
  InvoiceStatus,
  Prisma,
} from '@prisma/client';
import { ClubFinancialAccountsService } from '../accounting/club-financial-accounts.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreditNotesService } from './credit-notes.service';
import { PaymentScheduleEngineService } from './payment-schedule-engine.service';
import {
  ShopOrderRefundKind,
  type ShopOrderPlanInvoice,
  type ShopOrderRefundAction,
  type ShopOrderWriteOff,
} from './shop-order-refund-plan';
import { StripeCheckoutService } from './stripe-checkout.service';
import { StripeRefundsService } from './stripe-refunds.service';

/** Méthode du paiement négatif, selon la façon dont l'argent est rendu. */
const REFUND_METHOD: Record<
  Exclude<ShopOrderRefundKind, ShopOrderRefundKind.CARD>,
  ClubPaymentMethod
> = {
  [ShopOrderRefundKind.CASH]: ClubPaymentMethod.MANUAL_CASH,
  [ShopOrderRefundKind.TRANSFER]: ClubPaymentMethod.MANUAL_TRANSFER,
  [ShopOrderRefundKind.CHEQUE_RETURN]: ClubPaymentMethod.MANUAL_CHECK,
  [ShopOrderRefundKind.CHEQUE_DEPOSITED]: ClubPaymentMethod.MANUAL_TRANSFER,
  [ShopOrderRefundKind.CHEQUE_PARTIAL]: ClubPaymentMethod.MANUAL_TRANSFER,
  // Aucun argent ne sort : le paiement négatif rend le crédit, sans compte
  // financier, et sa contre-passation revient sur 419100 (ADR-0022).
  [ShopOrderRefundKind.CREDIT]: ClubPaymentMethod.PAYER_CREDIT,
};

const invoiceInclude = {
  payments: {
    orderBy: { createdAt: 'asc' },
    include: {
      cheque: {
        select: {
          id: true,
          number: true,
          status: true,
          depositId: true,
          deposit: { select: { financialAccountId: true } },
        },
      },
    },
  },
} satisfies Prisma.InvoiceInclude;

export type LoadedOrderInvoice = Prisma.InvoiceGetPayload<{
  include: typeof invoiceInclude;
}> & { creditNotesCents: number; supplement: boolean };

/** Un rendu par espèces, virement ou chèque, à contre-passer après le commit. */
export type ManualRefund = {
  creditNoteId: string;
  sourcePaymentId: string;
  refundFinancialAccountId: string | null;
  amountCents: number;
};

export type CardRefundResult = {
  paymentId: string;
  amountCents: number;
  ok: boolean;
  error: string | null;
};

/**
 * L'argent d'une commande boutique : ses factures — celle de la commande et
 * celles du reste à payer d'un échange —, et ce qu'on y rend ou éteint
 * (ADR-0019, ADR-0020).
 *
 * Partagé par l'annulation de la commande et par l'ajustement d'une ligne :
 * les deux exécutent le même genre de plan, et doivent le faire de la même
 * façon — mêmes gardes, mêmes avoirs, mêmes contre-passations.
 */
@Injectable()
export class ShopOrderMoneyService {
  private readonly logger = new Logger(ShopOrderMoneyService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly creditNotes: CreditNotesService,
    private readonly stripeRefunds: StripeRefundsService,
    private readonly scheduleEngine: PaymentScheduleEngineService,
    private readonly stripeCheckout: StripeCheckoutService,
    private readonly financialAccounts: ClubFinancialAccountsService,
  ) {}

  /** Les factures de la commande, telles que les plans les lisent. */
  async loadInvoices(clubId: string, orderId: string) {
    const rows = await this.prisma.invoice.findMany({
      where: {
        clubId,
        isCreditNote: false,
        OR: [
          { shopOrderId: orderId },
          { shopAdjustment: { is: { orderId } } },
        ],
      },
      include: invoiceInclude,
      orderBy: { createdAt: 'asc' },
    });
    const creditNotes = rows.length
      ? await this.prisma.invoice.findMany({
          where: {
            clubId,
            isCreditNote: true,
            status: { not: InvoiceStatus.VOID },
            parentInvoiceId: { in: rows.map((r) => r.id) },
          },
          select: { parentInvoiceId: true, amountCents: true },
        })
      : [];
    const invoices: LoadedOrderInvoice[] = rows.map((r) => ({
      ...r,
      supplement: r.shopOrderId !== orderId,
      creditNotesCents: creditNotes
        .filter((c) => c.parentInvoiceId === r.id)
        .reduce((sum, c) => sum + c.amountCents, 0),
    }));

    let inFlightCents = 0;
    for (const inv of invoices) {
      inFlightCents += await this.scheduleEngine.sumInFlightForInvoice(inv.id);
    }

    const planInvoices: ShopOrderPlanInvoice[] = invoices.map((inv) => ({
      id: inv.id,
      supplement: inv.supplement,
      status: inv.status,
      amountCents: inv.amountCents,
      creditNotesCents: inv.creditNotesCents,
      createdAt: inv.createdAt,
      payments: inv.payments.map((p) => ({
        id: p.id,
        amountCents: p.amountCents,
        method: p.method,
        externalRef: p.externalRef,
        refundedPaymentId: p.refundedPaymentId,
        createdAt: p.createdAt,
        cheque: p.cheque
          ? {
              id: p.cheque.id,
              number: p.cheque.number,
              status: p.cheque.status,
              depositId: p.cheque.depositId,
              depositAccountId: p.cheque.deposit?.financialAccountId ?? null,
            }
          : null,
      })),
    }));

    return { invoices, planInvoices, inFlightCents };
  }

  /**
   * Refuse si l'argent de la commande a bougé depuis la lecture du plan : un
   * règlement, un avoir, une facture de plus ou un statut changé le rendraient
   * faux. L'appelant tient le verrou de ces factures (ADR-0022, §3) : une
   * saisie, une imputation ou une annulation ne s'intercale plus entre cette
   * relecture et son commit.
   */
  async assertUnchangedInTx(
    tx: Prisma.TransactionClient,
    clubId: string,
    orderId: string,
    invoices: LoadedOrderInvoice[],
  ): Promise<void> {
    const current = await tx.invoice.findMany({
      where: {
        clubId,
        isCreditNote: false,
        OR: [
          { shopOrderId: orderId },
          { shopAdjustment: { is: { orderId } } },
        ],
      },
      select: { id: true, status: true },
    });
    if (current.length !== invoices.length) {
      throw new BadRequestException(
        'Une facture vient d’être émise sur cette commande : recharge la page.',
      );
    }
    for (const inv of invoices) {
      const payments = await tx.payment.count({
        where: { invoiceId: inv.id, clubId },
      });
      if (payments !== inv.payments.length) {
        throw new BadRequestException(
          'Un règlement vient d’être enregistré sur cette commande : recharge la page.',
        );
      }
      const credit = await tx.invoice.aggregate({
        where: {
          parentInvoiceId: inv.id,
          clubId,
          isCreditNote: true,
          status: { not: InvoiceStatus.VOID },
        },
        _sum: { amountCents: true },
      });
      if ((credit._sum.amountCents ?? 0) !== inv.creditNotesCents) {
        throw new BadRequestException(
          'Un avoir vient d’être émis sur cette commande : recharge la page.',
        );
      }
      // Après les deux gardes précédentes : un règlement complet change aussi
      // le statut, et « un règlement vient d'être enregistré » le dit mieux.
      if (current.find((c) => c.id === inv.id)?.status !== inv.status) {
        throw new BadRequestException(
          'Une facture de cette commande vient de changer : recharge la page.',
        );
      }
    }
  }

  /**
   * Écrit, dans la transaction de l'appelant, ce que le plan rend et éteint :
   * chèques rendus, paiements négatifs et leurs avoirs, avoirs d'extinction,
   * factures annulées ou soldées. Les remboursements carte partent après le
   * commit (`afterCommit`).
   */
  async applyInTx(
    tx: Prisma.TransactionClient,
    clubId: string,
    invoices: LoadedOrderInvoice[],
    plan: {
      refunds: ShopOrderRefundAction[];
      writeOffs: ShopOrderWriteOff[];
      voidInvoiceIds: string[];
      settleInvoiceIds?: string[];
    },
    labels: {
      /** Motif des avoirs de remboursement. */
      refund: string;
      /** Motif des avoirs d'extinction. */
      writeOff: string;
      /** Motif d'une facture annulée. */
      voidReason: string;
      /** Note portée sur un chèque rendu. */
      chequeNote: string;
    },
  ): Promise<ManualRefund[]> {
    const manual: ManualRefund[] = [];
    let clubBankId: string | null | undefined;

    for (const action of plan.refunds) {
      if (action.kind === ShopOrderRefundKind.CARD) continue;
      const invoice = invoices.find((i) => i.id === action.invoiceId);
      const original = invoice?.payments.find((p) => p.id === action.paymentId);
      if (!original) {
        throw new Error(`Encaissement ${action.paymentId} absent des factures lues.`);
      }

      if (action.kind === ShopOrderRefundKind.CHEQUE_RETURN) {
        // Même garde que la remise en banque, dans l'autre sens : un chèque
        // remis entre-temps ne se rend plus, et tout est annulé.
        const returned = await tx.cheque.updateMany({
          where: {
            id: action.chequeId!,
            clubId,
            status: ChequeStatus.PENDING,
            depositId: null,
          },
          data: { status: ChequeStatus.CANCELLED, notes: labels.chequeNote },
        });
        if (returned.count !== 1) {
          throw new BadRequestException(
            `Le chèque ${action.chequeNumber ? `n° ${action.chequeNumber} ` : ''}vient d’être remis en banque : recharge la page.`,
          );
        }
      }

      // Une part de chèque en portefeuille se reverse par virement depuis la
      // banque du club : le chèque, lui, reste à remettre.
      let outAccountId = action.bankAccountId;
      if (action.kind === ShopOrderRefundKind.CHEQUE_PARTIAL) {
        if (clubBankId === undefined) {
          clubBankId =
            (
              await this.financialAccounts.getDefault(
                clubId,
                ClubFinancialAccountKind.BANK,
              )
            )?.id ?? null;
        }
        if (!clubBankId) {
          throw new BadRequestException(
            'Aucun compte bancaire par défaut : impossible de reverser la part d’un chèque. Configure-le dans la comptabilité.',
          );
        }
        outAccountId = clubBankId;
      }

      await tx.payment.create({
        data: {
          clubId,
          invoiceId: action.invoiceId,
          amountCents: -action.amountCents,
          method: REFUND_METHOD[action.kind],
          refundedPaymentId: original.id,
          financialAccountId: outAccountId ?? original.financialAccountId,
          paidByMemberId: original.paidByMemberId,
          paidByContactId: original.paidByContactId,
        },
      });
      // L'avoir du montant rendu (ADR-0011) : sans lui, la facture
      // redeviendrait due de ce que l'on vient de rendre.
      const creditNote = await this.creditNotes.create({
        tx,
        clubId,
        parentInvoiceId: action.invoiceId,
        amountCents: action.amountCents,
        reason: labels.refund,
      });
      manual.push({
        creditNoteId: creditNote.id,
        sourcePaymentId: original.id,
        refundFinancialAccountId: outAccountId,
        amountCents: action.amountCents,
      });
    }

    for (const w of plan.writeOffs) {
      // Jamais encaissé, donc jamais constaté en comptabilité : cet avoir
      // n'appelle aucune contre-passation.
      await this.creditNotes.create({
        tx,
        clubId,
        parentInvoiceId: w.invoiceId,
        amountCents: w.amountCents,
        reason: labels.writeOff,
      });
    }

    for (const id of plan.voidInvoiceIds) {
      // Ouverte et sans paiement, relu sous le verrou de l'appelant (ADR-0022,
      // §3). La garde reste dans l'écriture : un paiement écrit sans ce verrou
      // empêcherait encore la facture de s'annuler, et rien ne serait écrit.
      const voided = await tx.invoice.updateMany({
        where: {
          id,
          clubId,
          status: InvoiceStatus.OPEN,
          payments: { none: {} },
        },
        data: { status: InvoiceStatus.VOID, voidReason: labels.voidReason },
      });
      if (voided.count !== 1) {
        throw new BadRequestException(
          'Une facture de cette commande vient de changer : recharge la page.',
        );
      }
    }

    for (const id of plan.settleInvoiceIds ?? []) {
      await tx.invoice.updateMany({
        where: { id, clubId, status: InvoiceStatus.OPEN },
        data: { status: InvoiceStatus.PAID },
      });
    }

    return manual;
  }

  /**
   * Après le commit : contre-passations des rendus manuels, remboursements
   * carte, échéanciers et sessions de paiement des factures annulées ou
   * soldées. Rien de tout cela ne défait ce qui est commité ; chaque échec se
   * dit.
   */
  async afterCommit(
    clubId: string,
    context: string,
    args: {
      manual: ManualRefund[];
      refunds: ShopOrderRefundAction[];
      reason: string;
      closed: Array<{ invoiceId: string; wasOpen: boolean; status: InvoiceStatus }>;
    },
  ): Promise<CardRefundResult[]> {
    for (const m of args.manual) {
      await this.creditNotes
        .recordAccounting(
          clubId,
          m.creditNoteId,
          m.sourcePaymentId,
          m.refundFinancialAccountId,
        )
        .catch((err: Error) => {
          this.logger.warn(
            `[boutique] contre-passation impossible pour l’avoir ${m.creditNoteId} — ${err.message}`,
          );
        });
    }

    // Remboursements carte : l'argent part de Stripe, l'enregistrement arrive
    // par le webhook (ADR-0011). Un refus ne défait pas le geste : il est rendu
    // à l'admin, qui relance depuis la facture.
    const cardRefunds: CardRefundResult[] = [];
    for (const action of args.refunds) {
      if (action.kind !== ShopOrderRefundKind.CARD) continue;
      try {
        const res = await this.stripeRefunds.refundPayment({
          clubId,
          paymentId: action.paymentId,
          amountCents: action.amountCents,
          reason: args.reason,
        });
        cardRefunds.push({
          paymentId: action.paymentId,
          amountCents: res.amountCents,
          ok: true,
          error: null,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        this.logger.error(
          `[boutique] ${context}, mais le remboursement carte de l’encaissement ${action.paymentId} a échoué : ${message}`,
        );
        cardRefunds.push({
          paymentId: action.paymentId,
          amountCents: action.amountCents,
          ok: false,
          error: message,
        });
      }
    }

    for (const c of args.closed) {
      await this.closeInvoice(clubId, c.invoiceId, c.wasOpen, c.status);
    }
    return cardRefunds;
  }

  /**
   * Une facture annulée ou soldée perd son échéancier et sa session de
   * paiement : une session restée ouverte ferait payer ce qui n'est plus dû.
   */
  async closeInvoice(
    clubId: string,
    invoiceId: string,
    wasOpen: boolean,
    status: InvoiceStatus,
  ): Promise<void> {
    try {
      await this.scheduleEngine.closeScheduleForInvoice(invoiceId, status);
    } catch (err) {
      this.logger.error(
        `[boutique] échéancier de la facture ${invoiceId} non clôturé — ${err instanceof Error ? err.message : String(err)}`,
      );
    }
    if (!wasOpen) return;
    await this.expireSessions(clubId, [invoiceId]);
  }

  /**
   * Ferme la session de paiement de chaque facture : ouverte, elle demanderait
   * un montant qui n'est plus dû. Un échec se dit, sans rien défaire.
   */
  async expireSessions(clubId: string, invoiceIds: string[]): Promise<void> {
    for (const invoiceId of invoiceIds) {
      try {
        await this.stripeCheckout.expireCheckoutSessionForInvoice(clubId, invoiceId);
      } catch (err) {
        this.logger.error(
          `[boutique] session de paiement de la facture ${invoiceId} non fermée : elle peut rester PAYABLE — ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
  }
}
