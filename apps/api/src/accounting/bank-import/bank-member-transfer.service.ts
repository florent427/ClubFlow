import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  AccountingAuditAction,
  BankStatementLineStatus,
  BankStatementStatus,
  ClubPaymentMethod,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { PaymentsService } from '../../payments/payments.service';
import { AccountingAuditService } from '../accounting-audit.service';
import { BankReconciliationService } from './bank-reconciliation.service';

export interface TransferAllocationInput {
  invoiceId: string;
  amountCents: number;
  paidByMemberId?: string | null;
  paidByContactId?: string | null;
}

export interface AcceptTransferResult {
  /** Paiements réellement enregistrés, dans l'ordre. */
  recordedPaymentIds: string[];
  invoicesPaid: number;
  /** Ligne rapprochée des écritures créées. */
  lineMatched: boolean;
  /** Ce qui a arrêté le traitement, s'il a été interrompu. */
  stoppedBecause: string | null;
}

/**
 * Virements d'adhérents (ADR-0014 §7).
 *
 * Un virement reçu porte le nom du payeur et solde le plus souvent une
 * facture ouverte de son foyer. Plutôt que d'écrire une recette générique,
 * on propose d'encaisser LA facture : le paiement naît, la facture se solde,
 * l'adhérent reçoit sa confirmation, et l'écriture qui en découle est
 * rapprochée de la ligne. Rien n'est jamais encaissé sans un clic.
 */
@Injectable()
export class BankMemberTransferService {
  private readonly logger = new Logger(BankMemberTransferService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly payments: PaymentsService,
    private readonly reconciliation: BankReconciliationService,
    private readonly audit: AccountingAuditService,
  ) {}

  /**
   * Encaisse le virement sur les factures choisies, puis rapproche la ligne
   * des écritures nées de ces paiements.
   *
   * Séquentiel et sans transaction commune : chaque `recordManualPayment`
   * porte ses propres gardes (documents à signer, prélèvement en cours,
   * solde) et son propre e-mail. On s'arrête au premier refus et on dit
   * exactement ce qui a été enregistré — un succès partiel silencieux serait
   * pire que l'échec.
   */
  async acceptMemberPayment(
    clubId: string,
    userId: string,
    lineId: string,
    allocations: TransferAllocationInput[],
  ): Promise<AcceptTransferResult> {
    const line = await this.prisma.bankStatementLine.findFirst({
      where: { id: lineId, clubId },
      include: { statement: { select: { id: true, status: true, financialAccountId: true } } },
    });
    if (!line) throw new NotFoundException('Ligne introuvable');
    if (line.status !== BankStatementLineStatus.UNMATCHED) {
      throw new BadRequestException('Seule une ligne à traiter peut être encaissée.');
    }
    if (line.amountCents <= 0) {
      throw new BadRequestException('Un encaissement d’adhérent est une ligne au crédit.');
    }
    if (
      line.statement.status === BankStatementStatus.NEEDS_CHECK ||
      line.statement.status === BankStatementStatus.FAILED ||
      line.statement.status === BankStatementStatus.PARSING
    ) {
      throw new BadRequestException(
        'Le relevé doit passer le contrôle d’intégrité avant tout encaissement.',
      );
    }
    if (allocations.length === 0) throw new BadRequestException('Aucune facture choisie.');
    const ids = new Set(allocations.map((a) => a.invoiceId));
    if (ids.size !== allocations.length) {
      throw new BadRequestException('Une même facture figure deux fois.');
    }
    if (allocations.some((a) => !Number.isInteger(a.amountCents) || a.amountCents <= 0)) {
      throw new BadRequestException('Chaque part doit être un montant positif en centimes.');
    }
    const total = allocations.reduce((s, a) => s + a.amountCents, 0);
    if (total !== line.amountCents) {
      throw new BadRequestException(
        `Les parts affectées doivent couvrir exactement le virement (${line.amountCents} cts).`,
      );
    }

    // La proposition d'écriture faite par la catégorisation n'a plus lieu
    // d'être : c'est le paiement qui va porter la recette.
    await this.reconciliation.dropPendingProposal(clubId, line.id, line.proposedEntryId);

    const externalRef = (line.reference?.trim() || line.label).slice(0, 190);
    const result: AcceptTransferResult = {
      recordedPaymentIds: [],
      invoicesPaid: 0,
      lineMatched: false,
      stoppedBecause: null,
    };
    for (const a of allocations) {
      try {
        const payment = await this.payments.recordManualPayment(
          clubId,
          {
            invoiceId: a.invoiceId,
            amountCents: a.amountCents,
            method: ClubPaymentMethod.MANUAL_TRANSFER,
            externalRef,
            paidByMemberId: a.paidByMemberId ?? null,
            paidByContactId: a.paidByContactId ?? null,
            financialAccountId: line.statement.financialAccountId,
          },
          userId,
        );
        result.recordedPaymentIds.push(payment.id);
        result.invoicesPaid += 1;
      } catch (err) {
        result.stoppedBecause = err instanceof Error ? err.message : String(err);
        this.logger.warn(
          `[virement ${line.id}] arrêt sur la facture ${a.invoiceId} : ${result.stoppedBecause}`,
        );
        break;
      }
    }

    if (result.recordedPaymentIds.length > 0) {
      result.lineMatched = await this.matchPaymentsToLine(
        clubId,
        userId,
        line.id,
        result.recordedPaymentIds,
      );
    }
    await this.audit.log({
      clubId,
      userId,
      action: AccountingAuditAction.RECONCILE,
      metadata: {
        source: 'BANK_LINE_MEMBER_TRANSFER',
        lineId: line.id,
        allocations: allocations.map((a) => ({ invoiceId: a.invoiceId, amountCents: a.amountCents })),
        recordedPaymentIds: result.recordedPaymentIds,
        lineMatched: result.lineMatched,
        stoppedBecause: result.stoppedBecause,
      },
    });
    if (result.stoppedBecause && result.recordedPaymentIds.length > 0) {
      throw new BadRequestException(
        `${result.invoicesPaid} encaissement(s) enregistré(s), puis arrêt : ${result.stoppedBecause}`,
      );
    }
    if (result.stoppedBecause) {
      throw new BadRequestException(result.stoppedBecause);
    }
    return result;
  }

  // ── Interne ───────────────────────────────────────────────────────────

  /**
   * Les écritures de recette nées des paiements portent `paymentId` : on les
   * retrouve par là et on rapproche la ligne. Si l'une manque (hook compta en
   * échec, club sans plan comptable), on ne rapproche rien plutôt que de
   * poser une liaison incomplète.
   */
  private async matchPaymentsToLine(
    clubId: string,
    userId: string,
    lineId: string,
    paymentIds: string[],
  ): Promise<boolean> {
    const entries = await this.prisma.accountingEntry.findMany({
      where: { clubId, paymentId: { in: paymentIds }, cancelledAt: null },
      select: { id: true, amountCents: true, paymentId: true },
    });
    if (entries.length !== paymentIds.length) {
      this.logger.warn(
        `[virement ${lineId}] ${entries.length} écriture(s) pour ${paymentIds.length} paiement(s) : rapprochement laissé à la main.`,
      );
      return false;
    }
    try {
      await this.reconciliation.match(
        clubId,
        userId,
        lineId,
        entries.map((e) => ({ entryId: e.id, amountCents: e.amountCents })),
        'PROPOSAL',
      );
      return true;
    } catch (err) {
      this.logger.warn(
        `[virement ${lineId}] rapprochement impossible : ${err instanceof Error ? err.message : String(err)}`,
      );
      return false;
    }
  }

}
