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
import { CategorizationLearningService } from './categorization-learning.service';
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
    private readonly learning: CategorizationLearningService,
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
      // La ligne est résolue pour de bon : une proposition de l'IA encore en
      // revue n'a plus lieu d'être, et la laisser permettrait de
      // comptabiliser la même somme une seconde fois en la validant.
      const current = await tx.bankStatementLine.findUnique({
        where: { id: line.id },
        select: { proposedEntryId: true },
      });
      await this.dropPendingProposal(clubId, line.id, current?.proposedEntryId ?? null, tx);
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

  /**
   * Appelé au moment exact où une écriture passe en POSTED (ADR-0014 §5).
   * Si elle est née d'une proposition sur une ligne de relevé, la ligne est
   * rapprochée dans la MÊME transaction : une écriture comptabilisée dont
   * la ligne resterait « à traiter » n'existe pas.
   *
   * Renvoie l'identifiant du relevé touché, pour que l'appelant rafraîchisse
   * son statut après la validation de la transaction.
   */
  async onEntryPosted(
    clubId: string,
    entryId: string,
    tx: Prisma.TransactionClient,
    userId: string | null,
  ): Promise<string | null> {
    const line = await tx.bankStatementLine.findFirst({
      where: {
        clubId,
        proposedEntryId: entryId,
        status: BankStatementLineStatus.UNMATCHED,
      },
      include: {
        statement: {
          select: {
            id: true,
            financialAccount: { select: { accountingAccount: { select: { code: true } } } },
          },
        },
      },
    });
    if (!line) return null;
    const entry = await tx.accountingEntry.findFirst({
      where: { id: entryId, clubId, cancelledAt: null },
      select: {
        amountCents: true,
        projectId: true,
        lines: { select: { accountCode: true }, orderBy: { sortOrder: 'asc' } },
      },
    });
    if (!entry) return null;
    if (entry.amountCents !== Math.abs(line.amountCents)) {
      // Le montant a été corrigé à la validation : la ligne ne serait plus
      // couverte exactement. On laisse le trésorier rapprocher à la main
      // plutôt que de poser une liaison fausse.
      this.logger.warn(
        `[ligne ${line.id}] écriture ${entryId} postée à ${entry.amountCents} c pour une ligne de ${line.amountCents} c : rapprochement laissé à la main.`,
      );
      return null;
    }
    await tx.bankStatementLineMatch.create({
      data: {
        clubId,
        lineId: line.id,
        entryId,
        amountCents: entry.amountCents,
        origin: BankMatchOrigin.PROPOSAL,
        matchedByUserId: userId,
      },
    });
    await tx.accountingEntryLine.updateMany({
      where: { entryId, accountCode: line.statement.financialAccount.accountingAccount.code },
      data: { bankReconciledAt: new Date() },
    });
    await tx.bankStatementLine.update({
      where: { id: line.id },
      data: {
        status: BankStatementLineStatus.MATCHED,
        candidateEntryIds: [],
        aiQuestion: null,
        resolvedAt: new Date(),
        resolvedByUserId: userId,
      },
    });
    // La validation enseigne, quel que soit l'écran d'où elle vient : ici la
    // file de revue comptable, ailleurs l'écran de rapprochement.
    const cashCode = line.statement.financialAccount.accountingAccount.code;
    const main = entry.lines.find((l) => l.accountCode !== cashCode);
    if (main) {
      await this.learning.learnFrom(clubId, userId, line, main.accountCode, entry.projectId);
    }
    return line.statement.id;
  }

  /**
   * L'inverse de `onEntryPosted` : une écriture naît DÉJÀ comptabilisée, hors
   * de tout relevé — remboursement d'un bénévole (ADR-0016), dépôt d'espèces
   * en banque. Quand le relevé qui la porte est déjà importé, sa ligne
   * attend sans rien pour la rattacher, et la catégorisation finirait par en
   * faire une dépense de plus.
   *
   * On la rapproche quand elle est le SEUL candidat : même compte, montant
   * signé identique, dans la fenêtre, pas déjà porteuse d'une proposition.
   * Deux candidats, c'est au trésorier de trancher.
   */
  async matchExistingLineForEntry(clubId: string, entryId: string): Promise<string | null> {
    const entry = await this.prisma.accountingEntry.findFirst({
      where: {
        id: entryId,
        clubId,
        cancelledAt: null,
        status: { in: [AccountingEntryStatus.POSTED, AccountingEntryStatus.LOCKED] },
      },
      select: {
        amountCents: true,
        occurredAt: true,
        financialAccountId: true,
        lines: { select: { accountCode: true, debitCents: true } },
        bankMatches: { select: { id: true } },
      },
    });
    if (!entry?.financialAccountId) return null;
    // Déjà rapprochée, même partiellement : on ne recouvre pas.
    if (entry.bankMatches.length > 0) return null;

    const account = await this.prisma.clubFinancialAccount.findFirst({
      where: { id: entry.financialAccountId, clubId },
      select: { accountingAccount: { select: { code: true } } },
    });
    if (!account) return null;
    const cashCode = account.accountingAccount.code;
    const cash = entry.lines.find((l) => l.accountCode === cashCode);
    if (!cash) return null;
    // Trésorerie au DÉBIT = argent entré = ligne créditrice du relevé.
    const signedCents = cash.debitCents > 0 ? entry.amountCents : -entry.amountCents;

    const from = new Date(entry.occurredAt.getTime() - MATCH_WINDOW_DAYS * DAY_MS);
    const to = new Date(entry.occurredAt.getTime() + (MATCH_WINDOW_DAYS + 1) * DAY_MS);
    const lines = await this.prisma.bankStatementLine.findMany({
      where: {
        clubId,
        financialAccountId: entry.financialAccountId,
        status: BankStatementLineStatus.UNMATCHED,
        amountCents: signedCents,
        bookedOn: { gte: from, lt: to },
        statement: {
          status: {
            notIn: [
              BankStatementStatus.NEEDS_CHECK,
              BankStatementStatus.FAILED,
              BankStatementStatus.PARSING,
            ],
          },
        },
      },
      select: {
        id: true,
        statementId: true,
        financialAccountId: true,
        bookedOn: true,
        amountCents: true,
        label: true,
        reference: true,
        proposedEntryId: true,
      },
      take: 3,
    });
    // `proposedEntryId` n'est pas une relation Prisma : on relit les statuts.
    const proposedIds = lines.map((l) => l.proposedEntryId).filter((v): v is string => v !== null);
    const proposedStatus = new Map<string, AccountingEntryStatus>();
    if (proposedIds.length > 0) {
      const rows = await this.prisma.accountingEntry.findMany({
        where: { clubId, id: { in: proposedIds } },
        select: { id: true, status: true },
      });
      for (const r of rows) proposedStatus.set(r.id, r.status);
    }
    // Une proposition de l'IA encore en revue cède devant une écriture
    // réelle du bon montant : c'est une supposition, pas une décision. Une
    // proposition DÉJÀ comptabilisée, en revanche, est une décision humaine
    // — on ne passe pas par-dessus.
    const open = lines.filter(
      (l) =>
        l.proposedEntryId === null ||
        proposedStatus.get(l.proposedEntryId) === AccountingEntryStatus.NEEDS_REVIEW,
    );
    if (open.length !== 1) return null;

    const line = open[0];
    await this.applyMatch(
      clubId,
      null,
      line,
      [{ entryId, amountCents: entry.amountCents }],
      BankMatchOrigin.AUTO,
      cashCode,
    );
    await this.refreshStatementStatus(clubId, line.statementId);
    this.logger.log(
      `[écriture ${entryId}] rapprochée à la ligne ${line.id} d'un relevé déjà déposé.`,
    );
    return line.statementId;
  }

  /**
   * Jette la proposition d'écriture en attente sur une ligne : l'écriture
   * `NEEDS_REVIEW` qu'elle avait matérialisée est supprimée et la ligne
   * l'oublie.
   *
   * Appelée quand une résolution mieux fondée arrive — un paiement
   * d'adhérent (lot 4), un dépôt d'espèces, un remboursement de bénévole.
   * Laisser la proposition permettrait de comptabiliser deux fois la même
   * somme : une fois par l'écriture réelle, une fois en validant la
   * supposition de l'IA.
   */
  async dropPendingProposal(
    clubId: string,
    lineId: string,
    proposedEntryId: string | null,
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    if (!proposedEntryId) return;
    const run = async (db: Prisma.TransactionClient) => {
      const entry = await db.accountingEntry.findFirst({
        where: { id: proposedEntryId, clubId, status: AccountingEntryStatus.NEEDS_REVIEW },
        select: { id: true },
      });
      await db.bankStatementLine.update({
        where: { id: lineId },
        data: { proposedEntryId: null, aiProposalJson: Prisma.DbNull, ruleId: null },
      });
      if (entry) await db.accountingEntry.delete({ where: { id: entry.id } });
    };
    if (tx) return run(tx);
    await this.prisma.$transaction(run);
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
          // La proposition a été consommée : son écriture est comptabilisée
          // et ne reviendra pas en revue. La laisser accrochée bloquerait
          // toute nouvelle catégorisation de la ligne.
          proposedEntryId: null,
          aiProposalJson: Prisma.DbNull,
          ruleId: null,
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
    if (line.proposedEntryId) {
      // Sinon l'écriture proposée resterait en revue sans rien pour la
      // rattacher : on demande de trancher la proposition d'abord.
      throw new BadRequestException('Rejette d’abord la proposition de cette ligne.');
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
