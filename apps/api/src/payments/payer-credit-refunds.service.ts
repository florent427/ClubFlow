import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ClubPaymentMethod, InvoicePurpose } from '@prisma/client';
import { ClubFinancialAccountsService } from '../accounting/club-financial-accounts.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreditNotesService } from './credit-notes.service';
import { readPayerCredit } from './payer-credit-balance';
import { resolvePayerCreditHolder } from './payer-credit-holder';
import { lockInvoiceInTx, lockPayerCreditInTx } from './settlement-locks';
import { writeManualRefundInTx } from './shop-order-money.service';
import { refundActionFor, ShopOrderRefundKind } from './shop-order-refund-plan';

function eurosFr(cents: number): string {
  return `${(cents / 100).toFixed(2).replace('.', ',')} €`;
}

export type PayerCreditManualRefund = {
  refundPaymentId: string;
  creditNoteId: string;
  amountCents: number;
  kind: ShopOrderRefundKind;
  creditBalanceCents: number;
};

/**
 * Rembourser une avance versée en espèces, par virement ou par chèque
 * (ADR-0022, tâche 4.2). Une avance carte se rembourse sur la carte
 * (`StripeRefundsService`).
 *
 * L'argent sort par le moyen de l'avance, comme pour une commande boutique
 * (ADR-0019) : espèces rendues, virement depuis la banque de l'encaissement,
 * chèque rendu s'il est encore en portefeuille et rendu en entier, sinon
 * virement. Au plus le crédit encore disponible : la part utilisée a quitté
 * le crédit.
 */
@Injectable()
export class PayerCreditRefundsService {
  private readonly logger = new Logger(PayerCreditRefundsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly creditNotes: CreditNotesService,
    private readonly financialAccounts: ClubFinancialAccountsService,
  ) {}

  async refundDeposit(
    clubId: string,
    args: { paymentId: string; amountCents: number | null; reason: string },
  ): Promise<PayerCreditManualRefund> {
    const reason = args.reason.trim();
    if (!reason) {
      throw new BadRequestException('Motif obligatoire.');
    }
    const payment = await this.prisma.payment.findFirst({
      where: { id: args.paymentId, clubId },
      include: {
        invoice: {
          select: {
            id: true,
            purpose: true,
            payerCreditMemberId: true,
            payerCreditContactId: true,
          },
        },
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
    });
    if (!payment) {
      throw new NotFoundException('Encaissement introuvable');
    }
    if (payment.invoice.purpose !== InvoicePurpose.PAYER_CREDIT_DEPOSIT) {
      throw new BadRequestException(
        'Seul le versement d’une avance se rembourse au crédit : un encaissement de facture se rembourse depuis sa facture.',
      );
    }
    if (payment.amountCents <= 0) {
      throw new BadRequestException(
        'Ce paiement est déjà un remboursement : remboursez le versement qu’il désigne.',
      );
    }
    if (payment.method === ClubPaymentMethod.STRIPE_CARD) {
      throw new BadRequestException(
        'Une avance versée par carte se rembourse sur la carte.',
      );
    }
    const holder = await resolvePayerCreditHolder(this.prisma, clubId, {
      memberId: payment.invoice.payerCreditMemberId,
      contactId: payment.invoice.payerCreditContactId,
    });

    const written = await this.prisma.$transaction(
      async (tx) => {
        // Même ordre que l'imputation et que le remboursement carte : la
        // personne, puis le reçu. Une imputation simultanée attend et voit le
        // crédit diminué.
        await lockPayerCreditInTx(tx, holder.personKey);
        await lockInvoiceInTx(tx, payment.invoiceId);
        const refunded = await tx.payment.aggregate({
          where: { clubId, refundedPaymentId: payment.id },
          _sum: { amountCents: true },
        });
        const refundable = payment.amountCents + (refunded._sum.amountCents ?? 0);
        const credit = await readPayerCredit(tx, clubId, holder);
        const ceiling = Math.min(refundable, credit.balanceCents);
        if (ceiling <= 0) {
          throw new BadRequestException(
            `Rien à rembourser : le crédit disponible de ${holder.displayName} est de ${eurosFr(Math.max(0, credit.balanceCents))}.`,
          );
        }
        const amount = args.amountCents ?? ceiling;
        if (!Number.isInteger(amount) || amount <= 0) {
          throw new BadRequestException('Le montant doit être positif.');
        }
        if (amount > ceiling) {
          throw new BadRequestException(
            `Au plus ${eurosFr(ceiling)} : crédit disponible ${eurosFr(credit.balanceCents)}, remboursable sur cet encaissement ${eurosFr(refundable)}.`,
          );
        }

        const blockers: string[] = [];
        const action = refundActionFor(
          {
            id: payment.id,
            amountCents: payment.amountCents,
            method: payment.method,
            externalRef: payment.externalRef,
            refundedPaymentId: payment.refundedPaymentId,
            createdAt: payment.createdAt,
            cheque: payment.cheque
              ? {
                  id: payment.cheque.id,
                  number: payment.cheque.number,
                  status: payment.cheque.status,
                  depositId: payment.cheque.depositId,
                  depositAccountId: payment.cheque.deposit?.financialAccountId ?? null,
                }
              : null,
          },
          payment.invoiceId,
          amount,
          blockers,
        );
        if (!action) {
          throw new BadRequestException(
            blockers[0] ?? 'Cet encaissement ne se rembourse pas depuis ClubFlow.',
          );
        }
        const manual = await writeManualRefundInTx(
          { creditNotes: this.creditNotes, financialAccounts: this.financialAccounts },
          tx,
          clubId,
          payment,
          action,
          { refund: reason, chequeNote: `Rendu : ${reason}` },
        );
        return {
          manual,
          kind: action.kind,
          creditBalanceCents: credit.balanceCents - amount,
        };
      },
      { maxWait: 10_000, timeout: 30_000 },
    );

    // Contre-passation après le commit, comme pour tout avoir : TRANSFER
    // 419100 / compte d'où l'argent sort (caisse, banque, 511200 d'un chèque
    // rendu). Un échec se dit ; l'argent rendu reste enregistré.
    await this.creditNotes
      .recordAccounting(
        clubId,
        written.manual.creditNoteId,
        written.manual.sourcePaymentId,
        written.manual.refundFinancialAccountId,
      )
      .catch((err: Error) => {
        this.logger.warn(
          `[avance] contre-passation impossible pour l’avoir ${written.manual.creditNoteId} — ${err.message}`,
        );
      });
    this.logger.log(
      `[avance] ${written.manual.amountCents} cts rendus (${written.kind}) sur l'encaissement ${payment.id}, avoir ${written.manual.creditNoteId}.`,
    );
    return {
      refundPaymentId: written.manual.refundPaymentId,
      creditNoteId: written.manual.creditNoteId,
      amountCents: written.manual.amountCents,
      kind: written.kind,
      creditBalanceCents: written.creditBalanceCents,
    };
  }
}
