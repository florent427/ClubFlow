import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  AccountingAuditAction,
  AccountingEntryStatus,
  BankMatchOrigin,
  BankStatementLineIgnoreReason,
  BankStatementLineStatus,
  BankStatementStatus,
  Prisma,
} from '@prisma/client';
import { AccountingAuditService } from '../accounting-audit.service';
import { PrismaService } from '../../prisma/prisma.service';
import { deriveStatementStatus } from './statement-integrity';

/** Fenêtre du rapprochement automatique : la banque comptabilise à J+2 ou J+3, une remise peut attendre une semaine. */
export const MATCH_WINDOW_DAYS = 10;
/** Fenêtre proposée au trésorier pour un rapprochement manuel. */
export const CANDIDATE_WINDOW_DAYS = 45;
const MAX_SUGGESTED = 10;
const DAY_MS = 86_400_000;

const entryInclude = {
  lines: true,
  payment: { select: { externalRef: true } },
  bankMatches: { select: { lineId: true, amountCents: true } },
} satisfies Prisma.AccountingEntryInclude;

type EntryRow = Prisma.AccountingEntryGetPayload<{ include: typeof entryInclude }>;

export interface Candidate {
  entry: EntryRow;
  /** Part de l'écriture pas encore couverte par une ligne de relevé. */
  remainingCents: number;
  /** Clé forte : virement Stripe, remise de chèques, référence commune. */
  strong: boolean;
}

export interface LineForMatching {
  id: string;
  financialAccountId: string;
  bookedOn: Date;
  amountCents: number;
  label: string;
  reference: string | null;
}

export interface Allocation {
  entryId: string;
  amountCents: number;
}

const euro = (cents: number): string =>
  new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(
    cents / 100,
  );

/**
 * Rapprochement ligne de relevé ↔ écriture (ADR-0014 §2 et §6).
 *
 * Automatique quand c'est SÛR : clé forte, ou candidat unique sur montant et
 * date. Suggéré quand plusieurs écritures conviennent. Manuel sinon, N↔N,
 * chaque liaison portant la part de l'écriture qu'elle couvre. Une écriture
 * entièrement couverte porte `bankReconciledAt` sur sa ligne de trésorerie.
 * Aucune écriture n'est créée ici : ce service ne fait que relier.
 */
@Injectable()
export class BankReconciliationService {
  private readonly logger = new Logger(BankReconciliationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AccountingAuditService,
  ) {}

  /** Passe sur toutes les lignes non résolues d'un relevé exploitable. */
  async autoMatch(
    clubId: string,
    statementId: string,
  ): Promise<{ matched: number; suggested: number; unmatched: number }> {
    const st = await this.prisma.bankStatement.findFirst({
      where: { id: statementId, clubId },
      include: {
        financialAccount: { include: { accountingAccount: true } },
        lines: {
          where: {
            status: {
              in: [BankStatementLineStatus.UNMATCHED, BankStatementLineStatus.SUGGESTED],
            },
          },
        },
      },
    });
    if (!st) throw new NotFoundException('Relevé introuvable');
    if (
      st.status === BankStatementStatus.NEEDS_CHECK ||
      st.status === BankStatementStatus.FAILED ||
      st.status === BankStatementStatus.PARSING
    ) {
      throw new BadRequestException(
        'Le relevé doit passer le contrôle d’intégrité avant tout rapprochement.',
      );
    }
    const cashCode = st.financialAccount.accountingAccount.code;
    const counts = { matched: 0, suggested: 0, unmatched: 0 };
    for (const line of st.lines) {
      const candidates = await this.candidates(clubId, cashCode, line, MATCH_WINDOW_DAYS, true);
      const strong = candidates.filter((c) => c.strong);
      const pick =
        strong.length === 1 ? strong[0] : candidates.length === 1 ? candidates[0] : null;
      if (pick) {
        await this.applyMatch(
          clubId,
          null,
          line,
          [{ entryId: pick.entry.id, amountCents: Math.abs(line.amountCents) }],
          BankMatchOrigin.AUTO,
          cashCode,
        );
        counts.matched += 1;
      } else if (candidates.length > 1) {
        await this.prisma.bankStatementLine.update({
          where: { id: line.id },
          data: {
            status: BankStatementLineStatus.SUGGESTED,
            candidateEntryIds: candidates.slice(0, MAX_SUGGESTED).map((c) => c.entry.id),
          },
        });
        counts.suggested += 1;
      } else {
        await this.prisma.bankStatementLine.update({
          where: { id: line.id },
          data: { status: BankStatementLineStatus.UNMATCHED, candidateEntryIds: [] },
        });
        counts.unmatched += 1;
      }
    }
    await this.refreshStatementStatus(clubId, statementId);
    this.logger.log(
      `[rapprochement] relevé ${statementId} : ${counts.matched} rapprochées, ${counts.suggested} suggérées, ${counts.unmatched} orphelines.`,
    );
    return counts;
  }

  /**
   * Écritures plausibles pour une ligne : même compte financier,
   * comptabilisées, non annulées, dans la fenêtre, pas encore entièrement
   * rapprochées, et dans le BON SENS — un crédit du relevé (argent qui entre)
   * est un DÉBIT sur le compte 51x de l'écriture.
   */
  async candidates(
    clubId: string,
    cashCode: string,
    line: LineForMatching,
    windowDays: number,
    exactAmount: boolean,
  ): Promise<Candidate[]> {
    const from = new Date(line.bookedOn.getTime() - windowDays * DAY_MS);
    const to = new Date(line.bookedOn.getTime() + (windowDays + 1) * DAY_MS);
    const entries = await this.prisma.accountingEntry.findMany({
      where: {
        clubId,
        financialAccountId: line.financialAccountId,
        status: { in: [AccountingEntryStatus.POSTED, AccountingEntryStatus.LOCKED] },
        cancelledAt: null,
        occurredAt: { gte: from, lt: to },
        ...(exactAmount ? { amountCents: Math.abs(line.amountCents) } : {}),
        lines: { some: { accountCode: cashCode, bankReconciledAt: null } },
      },
      include: entryInclude,
      orderBy: { occurredAt: 'asc' },
    });
    const wantDebit = line.amountCents > 0;
    const haystack = `${line.label} ${line.reference ?? ''}`.toUpperCase();
    const out: Candidate[] = [];
    for (const e of entries) {
      const cash = e.lines.find((l) => l.accountCode === cashCode);
      if (!cash) continue;
      const isDebit = cash.debitCents > 0;
      if (isDebit !== wantDebit) continue;
      const covered = e.bankMatches
        .filter((m) => m.lineId !== line.id)
        .reduce((s, m) => s + m.amountCents, 0);
      const remaining = e.amountCents - covered;
      if (remaining <= 0) continue;
      if (exactAmount && remaining !== Math.abs(line.amountCents)) continue;
      out.push({ entry: e, remainingCents: remaining, strong: this.isStrong(e, haystack) });
    }
    return out;
  }

  private isStrong(e: EntryRow, haystack: string): boolean {
    if (e.stripePayoutId && /STRIPE/.test(haystack)) return true;
    if (e.source === 'CHEQUE_DEPOSIT' && /REMISE|CHQ|CHEQ/.test(haystack)) return true;
    const refs = [e.paymentReference, e.payment?.externalRef]
      .map((r) => r?.trim().toUpperCase() ?? '')
      .filter((r) => r.length >= 4);
    return refs.some((r) => haystack.includes(r));
  }

  /** Candidats larges pour le rapprochement manuel : fenêtre étendue, tout montant. */
  async candidatesForLine(clubId: string, lineId: string): Promise<Candidate[]> {
    const line = await this.loadLine(clubId, lineId);
    const cashCode = line.statement.financialAccount.accountingAccount.code;
    const all = await this.candidates(clubId, cashCode, line, CANDIDATE_WINDOW_DAYS, false);
    const target = Math.abs(line.amountCents);
    return all
      .sort(
        (a, b) =>
          Number(b.strong) - Number(a.strong) ||
          Math.abs(a.remainingCents - target) - Math.abs(b.remainingCents - target) ||
          Math.abs(a.entry.occurredAt.getTime() - line.bookedOn.getTime()) -
            Math.abs(b.entry.occurredAt.getTime() - line.bookedOn.getTime()),
      )
      .slice(0, 30);
  }

  /** Rapprochement manuel : la somme des parts couvre EXACTEMENT la ligne. */
  async match(
    clubId: string,
    userId: string,
    lineId: string,
    allocations: Allocation[],
    origin: BankMatchOrigin = BankMatchOrigin.MANUAL,
  ) {
    const line = await this.loadLine(clubId, lineId);
    if (line.status === BankStatementLineStatus.IGNORED) {
      throw new BadRequestException('Ligne ignorée : rétablis-la avant de la rapprocher.');
    }
    if (line.status === BankStatementLineStatus.MATCHED) {
      throw new BadRequestException('Ligne déjà rapprochée : détache-la d’abord.');
    }
    if (
      line.statement.status === BankStatementStatus.NEEDS_CHECK ||
      line.statement.status === BankStatementStatus.FAILED
    ) {
      throw new BadRequestException(
        'Le relevé doit passer le contrôle d’intégrité avant tout rapprochement.',
      );
    }
    if (allocations.length === 0) throw new BadRequestException('Aucune écriture choisie.');
    const ids = new Set(allocations.map((a) => a.entryId));
    if (ids.size !== allocations.length) {
      throw new BadRequestException('Une même écriture figure deux fois.');
    }
    if (allocations.some((a) => !Number.isInteger(a.amountCents) || a.amountCents <= 0)) {
      throw new BadRequestException('Chaque part doit être un montant positif en centimes.');
    }
    const total = allocations.reduce((s, a) => s + a.amountCents, 0);
    if (total !== Math.abs(line.amountCents)) {
      throw new BadRequestException(
        `Les parts affectées (${euro(total)}) doivent couvrir exactement la ligne (${euro(Math.abs(line.amountCents))}).`,
      );
    }
    const cashCode = line.statement.financialAccount.accountingAccount.code;
    await this.applyMatch(clubId, userId, line, allocations, origin, cashCode);
    await this.refreshStatementStatus(clubId, line.statementId);
    await this.audit.log({
      clubId,
      userId,
      entryId: allocations.length === 1 ? allocations[0].entryId : null,
      action: AccountingAuditAction.RECONCILE,
      metadata: { lineId, origin, allocations },
    });
    return this.loadLine(clubId, lineId);
  }

  /**
   * Pose les liaisons et, pour chaque écriture entièrement couverte, le
   * marqueur `bankReconciledAt` sur sa ligne de trésorerie — le tout dans
   * une transaction : une ligne à moitié rapprochée n'existe pas.
   */
  private async applyMatch(
    clubId: string,
    userId: string | null,
    line: LineForMatching,
    allocations: Allocation[],
    origin: BankMatchOrigin,
    cashCode: string,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      for (const a of allocations) {
        const entry = await tx.accountingEntry.findFirst({
          where: {
            id: a.entryId,
            clubId,
            financialAccountId: line.financialAccountId,
            status: { in: [AccountingEntryStatus.POSTED, AccountingEntryStatus.LOCKED] },
            cancelledAt: null,
          },
          include: { bankMatches: { select: { lineId: true, amountCents: true } } },
        });
        if (!entry) {
          throw new BadRequestException(
            'Écriture introuvable, annulée, ou portée par un autre compte financier.',
          );
        }
        const covered = entry.bankMatches
          .filter((m) => m.lineId !== line.id)
          .reduce((s, m) => s + m.amountCents, 0);
        if (covered + a.amountCents > entry.amountCents) {
          throw new BadRequestException(
            `L’écriture « ${entry.label} » n’a plus que ${euro(entry.amountCents - covered)} à rapprocher.`,
          );
        }
        await tx.bankStatementLineMatch.create({
          data: {
            clubId,
            lineId: line.id,
            entryId: entry.id,
            amountCents: a.amountCents,
            origin,
            matchedByUserId: userId,
          },
        });
        if (covered + a.amountCents === entry.amountCents) {
          await tx.accountingEntryLine.updateMany({
            where: { entryId: entry.id, accountCode: cashCode },
            data: { bankReconciledAt: new Date() },
          });
        }
      }
      await tx.bankStatementLine.update({
        where: { id: line.id },
        data: {
          status: BankStatementLineStatus.MATCHED,
          candidateEntryIds: [],
          resolvedAt: new Date(),
          resolvedByUserId: userId,
        },
      });
    });
  }

  /** Détache : liaisons supprimées, marqueur effacé, ligne de nouveau à traiter. */
  async unmatch(clubId: string, userId: string, lineId: string) {
    const line = await this.loadLine(clubId, lineId);
    if (line.status !== BankStatementLineStatus.MATCHED) {
      throw new BadRequestException('Cette ligne n’est pas rapprochée.');
    }
    const cashCode = line.statement.financialAccount.accountingAccount.code;
    const entryIds = line.matches.map((m) => m.entryId);
    await this.prisma.$transaction(async (tx) => {
      await tx.bankStatementLineMatch.deleteMany({ where: { lineId: line.id } });
      // Une écriture n'est rapprochée que si TOUTES ses parts le sont :
      // en retirer une la rend de nouveau à rapprocher.
      if (entryIds.length > 0) {
        await tx.accountingEntryLine.updateMany({
          where: { entryId: { in: entryIds }, accountCode: cashCode },
          data: { bankReconciledAt: null },
        });
      }
      await tx.bankStatementLine.update({
        where: { id: line.id },
        data: {
          status: BankStatementLineStatus.UNMATCHED,
          resolvedAt: null,
          resolvedByUserId: null,
        },
      });
    });
    await this.refreshStatementStatus(clubId, line.statementId);
    await this.audit.log({
      clubId,
      userId,
      entryId: entryIds.length === 1 ? entryIds[0] : null,
      action: AccountingAuditAction.UNRECONCILE,
      metadata: { lineId, entryIds },
    });
    return this.loadLine(clubId, lineId);
  }

  async ignore(
    clubId: string,
    userId: string,
    lineId: string,
    reason: BankStatementLineIgnoreReason,
    note?: string | null,
  ) {
    const line = await this.loadLine(clubId, lineId);
    if (line.status === BankStatementLineStatus.MATCHED) {
      throw new BadRequestException('Détache la ligne avant de l’ignorer.');
    }
    await this.prisma.bankStatementLine.update({
      where: { id: line.id },
      data: {
        status: BankStatementLineStatus.IGNORED,
        ignoreReason: reason,
        ignoreNote: note?.trim() || null,
        candidateEntryIds: [],
        resolvedAt: new Date(),
        resolvedByUserId: userId,
      },
    });
    await this.refreshStatementStatus(clubId, line.statementId);
    return this.loadLine(clubId, lineId);
  }

  async unignore(clubId: string, lineId: string) {
    const line = await this.loadLine(clubId, lineId);
    if (line.status !== BankStatementLineStatus.IGNORED) {
      throw new BadRequestException('Cette ligne n’est pas ignorée.');
    }
    await this.prisma.bankStatementLine.update({
      where: { id: line.id },
      data: {
        status: BankStatementLineStatus.UNMATCHED,
        ignoreReason: null,
        ignoreNote: null,
        resolvedAt: null,
        resolvedByUserId: null,
      },
    });
    await this.refreshStatementStatus(clubId, line.statementId);
    return this.loadLine(clubId, lineId);
  }

  /**
   * Statut du relevé après un rapprochement : RECONCILED quand chaque ligne
   * est rapprochée ou ignorée, READY sinon. Jamais au-delà de ce que le
   * contrôle d'intégrité stocké autorise.
   */
  async refreshStatementStatus(clubId: string, statementId: string): Promise<void> {
    const st = await this.prisma.bankStatement.findFirst({
      where: { id: statementId, clubId },
      select: {
        status: true,
        integrityDeltaCents: true,
        chainOk: true,
        lines: { select: { status: true } },
      },
    });
    if (!st || st.status === BankStatementStatus.FAILED || st.status === BankStatementStatus.PARSING) {
      return;
    }
    const ok = st.integrityDeltaCents === 0 && st.chainOk === true;
    const next = deriveStatementStatus({ ok }, st.lines.map((l) => l.status));
    if (next !== st.status) {
      await this.prisma.bankStatement.update({
        where: { id: statementId },
        data: { status: next },
      });
    }
  }

  async loadLine(clubId: string, lineId: string) {
    const line = await this.prisma.bankStatementLine.findFirst({
      where: { id: lineId, clubId },
      include: {
        matches: {
          include: {
            entry: {
              select: {
                id: true,
                label: true,
                occurredAt: true,
                kind: true,
                source: true,
                amountCents: true,
              },
            },
          },
        },
        statement: {
          include: { financialAccount: { include: { accountingAccount: true } } },
        },
      },
    });
    if (!line) throw new NotFoundException('Ligne de relevé introuvable');
    return line;
  }
}
