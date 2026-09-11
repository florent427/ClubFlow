import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  AccountingAuditAction,
  AccountingEntryStatus,
  BankStatementFormat,
  BankStatementLineIgnoreReason,
  BankStatementLineStatus,
  BankStatementStatus,
  ClubFinancialAccountKind,
  Prisma,
} from '@prisma/client';
import { MediaAssetsService } from '../../media/media-assets.service';
import { PrismaService } from '../../prisma/prisma.service';
import { AccountingAuditService } from '../accounting-audit.service';
import {
  AccountingFiscalYearService,
  formatIsoDate,
} from '../accounting-fiscal-year.service';
import { ClubFinancialAccountsService } from '../club-financial-accounts.service';
import { BankReconciliationService } from './bank-reconciliation.service';
import { detectCsv, parseCsv } from './csv-parser';
import type { CsvDetection, CsvMapping } from './csv-parser';
import { parseOfx } from './ofx-parser';
import {
  checkStatementIntegrity,
  deriveStatementStatus,
} from './statement-integrity';
import type { ParsedStatement } from './statement-types';

const MAX_FILE_BYTES = 5 * 1024 * 1024;

export const statementListInclude = {
  financialAccount: {
    select: { id: true, label: true, accountingAccount: { select: { code: true } } },
  },
  mediaAsset: { select: { id: true, publicUrl: true, fileName: true } },
} satisfies Prisma.BankStatementInclude;

export const lineInclude = {
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
} satisfies Prisma.BankStatementLineInclude;

export const statementDetailInclude = {
  ...statementListInclude,
  lines: {
    orderBy: [{ bookedOn: 'asc' as const }, { lineIndex: 'asc' as const }],
    include: lineInclude,
  },
} satisfies Prisma.BankStatementInclude;

export type StatementListRow = Prisma.BankStatementGetPayload<{
  include: typeof statementListInclude;
}>;
export type StatementDetailRow = Prisma.BankStatementGetPayload<{
  include: typeof statementDetailInclude;
}>;
export type LineRow = Prisma.BankStatementLineGetPayload<{ include: typeof lineInclude }>;

export interface ImportStatementParams {
  financialAccountId: string;
  format: 'OFX' | 'CSV';
  fileName: string;
  contentBase64: string;
  csvMapping?: CsvMapping | null;
  openingBalanceCents?: number | null;
  closingBalanceCents?: number | null;
  periodStart?: Date | null;
  periodEnd?: Date | null;
}

export interface CsvPreviewResult {
  detection: CsvDetection;
  mapping: CsvMapping;
  parsed: ParsedStatement | null;
  error: string | null;
}

export interface AccountSummary {
  financialAccountId: string;
  label: string;
  accountingAccountCode: string;
  openingBalanceSet: boolean;
  statementCount: number;
  lastPeriodEnd: Date | null;
  lastStatus: BankStatementStatus | null;
  linesToHandle: number;
  unreconciledEntries: number;
}

const frDate = (d: Date): string =>
  `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${d.getUTCFullYear()}`;

function decodeBase64(content: string): Buffer {
  const buffer = Buffer.from(content, 'base64');
  if (buffer.byteLength === 0) throw new BadRequestException('Fichier vide.');
  if (buffer.byteLength > MAX_FILE_BYTES) {
    throw new BadRequestException('Fichier trop volumineux (5 Mo maximum).');
  }
  return buffer;
}

/**
 * Relevés bancaires (ADR-0014). Le relevé est la source de vérité du compte
 * 51x ; il n'est exploitable (`READY`) que si le contrôle d'intégrité passe,
 * et ce statut n'est calculé qu'à un seul endroit : `deriveStatementStatus`.
 */
@Injectable()
export class BankStatementService {
  private readonly logger = new Logger(BankStatementService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly financialAccounts: ClubFinancialAccountsService,
    private readonly fiscal: AccountingFiscalYearService,
    private readonly audit: AccountingAuditService,
    private readonly media: MediaAssetsService,
    private readonly reconciliation: BankReconciliationService,
  ) {}

  async list(clubId: string, financialAccountId?: string | null): Promise<StatementListRow[]> {
    return this.prisma.bankStatement.findMany({
      where: { clubId, ...(financialAccountId ? { financialAccountId } : {}) },
      orderBy: [{ periodStart: 'desc' }, { createdAt: 'desc' }],
      include: statementListInclude,
    });
  }

  async getById(clubId: string, id: string): Promise<StatementDetailRow> {
    const row = await this.prisma.bankStatement.findFirst({
      where: { id, clubId },
      include: statementDetailInclude,
    });
    if (!row) throw new NotFoundException('Relevé introuvable');
    return row;
  }

  /** Comptage des lignes par statut, pour les listes. */
  async lineCounts(
    clubId: string,
    statementIds: string[],
  ): Promise<Map<string, Partial<Record<BankStatementLineStatus, number>>>> {
    const out = new Map<string, Partial<Record<BankStatementLineStatus, number>>>();
    if (statementIds.length === 0) return out;
    const rows = await this.prisma.bankStatementLine.groupBy({
      by: ['statementId', 'status'],
      where: { clubId, statementId: { in: statementIds } },
      _count: { _all: true },
    });
    for (const r of rows) {
      const m = out.get(r.statementId) ?? {};
      m[r.status] = r._count._all;
      out.set(r.statementId, m);
    }
    return out;
  }

  /** Détection du mapping CSV et aperçu, avant import. */
  previewCsv(contentBase64: string, mapping?: CsvMapping | null): CsvPreviewResult {
    const buffer = decodeBase64(contentBase64);
    const detection = detectCsv(buffer);
    const effective = mapping ?? detection.mapping;
    try {
      return { detection, mapping: effective, parsed: parseCsv(buffer, effective), error: null };
    } catch (err) {
      return {
        detection,
        mapping: effective,
        parsed: null,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  async import(clubId: string, userId: string, params: ImportStatementParams) {
    const settings = await this.fiscal.getSettings(clubId);
    if (!settings.accountingStartsOn) {
      throw new BadRequestException(
        'Définis d’abord la date de reprise de la comptabilité (Paramètres → Comptabilité → Exercice).',
      );
    }
    const account = await this.financialAccounts.getById(clubId, params.financialAccountId);
    if (account.kind !== ClubFinancialAccountKind.BANK || !account.isActive) {
      throw new BadRequestException('Un relevé se dépose sur un compte bancaire actif.');
    }
    if (params.format !== 'OFX' && params.format !== 'CSV') {
      throw new BadRequestException('Format non pris en charge pour un import de fichier.');
    }
    const buffer = decodeBase64(params.contentBase64);
    const parsed =
      params.format === 'OFX'
        ? parseOfx(buffer)
        : parseCsv(buffer, params.csvMapping ?? detectCsv(buffer).mapping);
    if (parsed.lines.length === 0) {
      throw new BadRequestException('Aucune ligne dans ce relevé.');
    }
    const periodStart = params.periodStart ?? parsed.periodStart;
    const periodEnd = params.periodEnd ?? parsed.periodEnd;
    if (!periodStart || !periodEnd || periodEnd.getTime() < periodStart.getTime()) {
      throw new BadRequestException('Période du relevé invalide.');
    }
    const opening = params.openingBalanceCents ?? parsed.openingBalanceCents;
    const closing = params.closingBalanceCents ?? parsed.closingBalanceCents;
    if (opening === null || opening === undefined || closing === null || closing === undefined) {
      throw new BadRequestException(
        'Soldes de début et de fin requis : ce fichier ne les porte pas.',
      );
    }

    // Pas de chevauchement (ADR-0014 §4) : deux relevés sur la même période
    // sont soit un doublon, soit une erreur ; dans les deux cas on refuse.
    const overlap = await this.prisma.bankStatement.findFirst({
      where: {
        clubId,
        financialAccountId: account.id,
        status: { not: BankStatementStatus.FAILED },
        periodStart: { lte: periodEnd },
        periodEnd: { gte: periodStart },
      },
      select: { periodStart: true, periodEnd: true },
    });
    if (overlap) {
      throw new BadRequestException(
        `Ce relevé chevauche celui du ${frDate(overlap.periodStart)} au ${frDate(overlap.periodEnd)}.`,
      );
    }
    const previous = await this.previousStatement(clubId, account.id, periodStart, null);
    const previousClosing = previous
      ? previous.closingBalanceCents
      : (account.openingBalanceCents ?? null);
    const integrity = checkStatementIntegrity({
      openingBalanceCents: opening,
      closingBalanceCents: closing,
      lineAmounts: parsed.lines.map((l) => l.amountCents),
      previousClosingCents: previousClosing,
    });
    const takeover = settings.accountingStartsOn;
    const lineStatuses = parsed.lines.map((l) =>
      l.bookedOn.getTime() < takeover.getTime()
        ? BankStatementLineStatus.IGNORED
        : BankStatementLineStatus.UNMATCHED,
    );
    const status = deriveStatementStatus(integrity, lineStatuses);

    const created = await this.prisma.$transaction(async (tx) => {
      const st = await tx.bankStatement.create({
        data: {
          clubId,
          financialAccountId: account.id,
          format: params.format === 'OFX' ? BankStatementFormat.OFX : BankStatementFormat.CSV,
          status,
          periodStart,
          periodEnd,
          openingBalanceCents: opening,
          closingBalanceCents: closing,
          lineCount: parsed.lines.length,
          integrityDeltaCents: integrity.deltaCents,
          chainOk: integrity.chainOk,
          chainExpectedCents: integrity.chainExpectedCents,
          previousStatementId: previous?.id ?? null,
          importedByUserId: userId,
          error: parsed.warnings.length > 0 ? parsed.warnings.join('\n') : null,
        },
      });
      await tx.bankStatementLine.createMany({
        data: parsed.lines.map((l, i) => ({
          clubId,
          statementId: st.id,
          financialAccountId: account.id,
          lineIndex: i,
          bookedOn: l.bookedOn,
          valueOn: l.valueOn,
          label: l.label.slice(0, 500),
          rawLabel: l.rawLabel.slice(0, 2000),
          reference: l.reference,
          amountCents: l.amountCents,
          balanceAfterCents: l.balanceAfterCents,
          fitId: l.fitId,
          status: lineStatuses[i],
          ignoreReason:
            lineStatuses[i] === BankStatementLineStatus.IGNORED
              ? BankStatementLineIgnoreReason.BEFORE_TAKEOVER
              : null,
        })),
      });
      return st;
    });

    // Archive du fichier d'origine : une pièce, pas la garantie.
    try {
      const asset = await this.media.uploadDocument(
        clubId,
        userId,
        {
          originalname: params.fileName.slice(0, 200) || `releve.${params.format.toLowerCase()}`,
          mimetype: params.format === 'OFX' ? 'application/x-ofx' : 'text/csv',
          size: buffer.byteLength,
          buffer,
        },
        { kind: 'BANK_STATEMENT', id: created.id },
      );
      await this.prisma.bankStatement.update({
        where: { id: created.id },
        data: { mediaAssetId: asset.id },
      });
    } catch (err) {
      this.logger.warn(
        `[relevé] fichier ${params.fileName} non archivé : ${err instanceof Error ? err.message : String(err)}`,
      );
    }
    if (params.format === 'CSV' && params.csvMapping) {
      await this.prisma.clubFinancialAccount.update({
        where: { id: account.id },
        data: { csvMappingJson: params.csvMapping as unknown as Prisma.InputJsonValue },
      });
    }
    await this.audit.log({
      clubId,
      userId,
      action: AccountingAuditAction.STATEMENT_IMPORT,
      metadata: {
        statementId: created.id,
        format: params.format,
        periodStart: formatIsoDate(periodStart),
        periodEnd: formatIsoDate(periodEnd),
        lineCount: parsed.lines.length,
        deltaCents: integrity.deltaCents,
        chainOk: integrity.chainOk,
      },
    });
    if (created.status === BankStatementStatus.READY) {
      await this.reconciliation.autoMatch(clubId, created.id);
    }
    return this.getById(clubId, created.id);
  }

  /** Le relevé qui précède une période sur un compte (hors relevés en échec). */
  private async previousStatement(
    clubId: string,
    financialAccountId: string,
    periodStart: Date,
    excludeId: string | null,
  ) {
    return this.prisma.bankStatement.findFirst({
      where: {
        clubId,
        financialAccountId,
        status: { not: BankStatementStatus.FAILED },
        periodEnd: { lt: periodStart },
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
      orderBy: { periodEnd: 'desc' },
      select: { id: true, closingBalanceCents: true },
    });
  }

  /** Recalcule intégrité, chaînage et statut, après toute édition de lignes. */
  async recomputeIntegrity(clubId: string, statementId: string): Promise<void> {
    const st = await this.prisma.bankStatement.findFirst({
      where: { id: statementId, clubId },
      include: {
        financialAccount: { select: { openingBalanceCents: true } },
        lines: { select: { amountCents: true, status: true } },
      },
    });
    if (!st) throw new NotFoundException('Relevé introuvable');
    const previous = await this.previousStatement(clubId, st.financialAccountId, st.periodStart, st.id);
    const previousClosing = previous
      ? previous.closingBalanceCents
      : (st.financialAccount.openingBalanceCents ?? null);
    const integrity = checkStatementIntegrity({
      openingBalanceCents: st.openingBalanceCents,
      closingBalanceCents: st.closingBalanceCents,
      lineAmounts: st.lines.map((l) => l.amountCents),
      previousClosingCents: previousClosing,
    });
    await this.prisma.bankStatement.update({
      where: { id: st.id },
      data: {
        integrityDeltaCents: integrity.deltaCents,
        chainOk: integrity.chainOk,
        chainExpectedCents: integrity.chainExpectedCents,
        previousStatementId: previous?.id ?? null,
        lineCount: st.lines.length,
        status: deriveStatementStatus(integrity, st.lines.map((l) => l.status)),
      },
    });
  }

  async updateLine(
    clubId: string,
    userId: string,
    patch: { lineId: string; bookedOn?: Date | null; label?: string | null; amountCents?: number | null },
  ) {
    const line = await this.prisma.bankStatementLine.findFirst({
      where: { id: patch.lineId, clubId },
      select: { id: true, statementId: true, status: true, label: true, amountCents: true, bookedOn: true },
    });
    if (!line) throw new NotFoundException('Ligne introuvable');
    if (line.status === BankStatementLineStatus.MATCHED) {
      throw new BadRequestException('Détache la ligne avant de la corriger.');
    }
    const data: Prisma.BankStatementLineUpdateInput = {};
    if (patch.bookedOn) data.bookedOn = patch.bookedOn;
    if (patch.label !== undefined && patch.label !== null) {
      const v = patch.label.trim();
      if (!v) throw new BadRequestException('Libellé requis.');
      data.label = v.slice(0, 500);
    }
    if (patch.amountCents !== undefined && patch.amountCents !== null) {
      if (!Number.isInteger(patch.amountCents) || patch.amountCents === 0) {
        throw new BadRequestException('Montant invalide.');
      }
      data.amountCents = patch.amountCents;
    }
    await this.prisma.bankStatementLine.update({ where: { id: line.id }, data });
    await this.recomputeIntegrity(clubId, line.statementId);
    await this.audit.log({
      clubId,
      userId,
      action: AccountingAuditAction.UPDATE,
      metadata: {
        bankStatementLineId: line.id,
        before: { label: line.label, amountCents: line.amountCents, bookedOn: formatIsoDate(line.bookedOn) },
        after: patch,
      },
    });
    return this.getById(clubId, line.statementId);
  }

  async addLine(
    clubId: string,
    userId: string,
    input: { statementId: string; bookedOn: Date; label: string; amountCents: number },
  ) {
    const st = await this.prisma.bankStatement.findFirst({
      where: { id: input.statementId, clubId },
      select: { id: true, financialAccountId: true, status: true, _count: { select: { lines: true } } },
    });
    if (!st) throw new NotFoundException('Relevé introuvable');
    if (st.status === BankStatementStatus.RECONCILED) {
      throw new BadRequestException('Ce relevé est entièrement rapproché.');
    }
    const label = input.label.trim();
    if (!label) throw new BadRequestException('Libellé requis.');
    if (!Number.isInteger(input.amountCents) || input.amountCents === 0) {
      throw new BadRequestException('Montant invalide.');
    }
    const settings = await this.fiscal.getSettings(clubId);
    const before =
      !!settings.accountingStartsOn &&
      input.bookedOn.getTime() < settings.accountingStartsOn.getTime();
    await this.prisma.bankStatementLine.create({
      data: {
        clubId,
        statementId: st.id,
        financialAccountId: st.financialAccountId,
        lineIndex: st._count.lines,
        bookedOn: input.bookedOn,
        label: label.slice(0, 500),
        rawLabel: `(ajoutée à la main) ${label}`.slice(0, 2000),
        amountCents: input.amountCents,
        status: before ? BankStatementLineStatus.IGNORED : BankStatementLineStatus.UNMATCHED,
        ignoreReason: before ? BankStatementLineIgnoreReason.BEFORE_TAKEOVER : null,
      },
    });
    await this.recomputeIntegrity(clubId, st.id);
    await this.audit.log({
      clubId,
      userId,
      action: AccountingAuditAction.UPDATE,
      metadata: { bankStatementId: st.id, addedLine: { ...input, bookedOn: formatIsoDate(input.bookedOn) } },
    });
    return this.getById(clubId, st.id);
  }

  async removeLine(clubId: string, userId: string, lineId: string) {
    const line = await this.prisma.bankStatementLine.findFirst({
      where: { id: lineId, clubId },
      select: { id: true, statementId: true, status: true, label: true, amountCents: true },
    });
    if (!line) throw new NotFoundException('Ligne introuvable');
    if (line.status === BankStatementLineStatus.MATCHED) {
      throw new BadRequestException('Détache la ligne avant de la supprimer.');
    }
    await this.prisma.bankStatementLine.delete({ where: { id: line.id } });
    await this.recomputeIntegrity(clubId, line.statementId);
    await this.audit.log({
      clubId,
      userId,
      action: AccountingAuditAction.UPDATE,
      metadata: { bankStatementId: line.statementId, removedLine: { label: line.label, amountCents: line.amountCents } },
    });
    return this.getById(clubId, line.statementId);
  }

  /** Supprime un relevé sans ligne rapprochée ; les relevés suivants sont rechaînés. */
  async delete(clubId: string, userId: string, statementId: string): Promise<boolean> {
    const st = await this.prisma.bankStatement.findFirst({
      where: { id: statementId, clubId },
      select: {
        id: true,
        mediaAssetId: true,
        periodStart: true,
        periodEnd: true,
        _count: { select: { lines: { where: { status: BankStatementLineStatus.MATCHED } } } },
        next: { select: { id: true } },
      },
    });
    if (!st) throw new NotFoundException('Relevé introuvable');
    if (st._count.lines > 0) {
      throw new BadRequestException(
        'Ce relevé a des lignes rapprochées : détache-les avant de le supprimer.',
      );
    }
    await this.prisma.bankStatement.delete({ where: { id: st.id } });
    for (const n of st.next) {
      await this.recomputeIntegrity(clubId, n.id);
    }
    if (st.mediaAssetId) {
      try {
        await this.media.delete(clubId, st.mediaAssetId);
      } catch (err) {
        this.logger.warn(
          `[relevé] fichier ${st.mediaAssetId} non supprimé : ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
    await this.audit.log({
      clubId,
      userId,
      action: AccountingAuditAction.STATEMENT_DELETE,
      metadata: {
        statementId: st.id,
        periodStart: formatIsoDate(st.periodStart),
        periodEnd: formatIsoDate(st.periodEnd),
      },
    });
    return true;
  }

  /** Vue d'ensemble par compte bancaire : dernier relevé, lignes à traiter, écritures non rapprochées. */
  async summary(clubId: string): Promise<AccountSummary[]> {
    const [settings, accounts] = await Promise.all([
      this.fiscal.getSettings(clubId),
      this.prisma.clubFinancialAccount.findMany({
        where: { clubId, kind: ClubFinancialAccountKind.BANK, isActive: true },
        orderBy: [{ isDefault: 'desc' }, { sortOrder: 'asc' }],
        include: { accountingAccount: { select: { code: true } } },
      }),
    ]);
    const out: AccountSummary[] = [];
    for (const a of accounts) {
      const [statementCount, last, linesToHandle, unreconciledEntries] = await Promise.all([
        this.prisma.bankStatement.count({ where: { clubId, financialAccountId: a.id } }),
        this.prisma.bankStatement.findFirst({
          where: { clubId, financialAccountId: a.id },
          orderBy: { periodEnd: 'desc' },
          select: { periodEnd: true, status: true },
        }),
        this.prisma.bankStatementLine.count({
          where: {
            clubId,
            financialAccountId: a.id,
            status: { in: [BankStatementLineStatus.UNMATCHED, BankStatementLineStatus.SUGGESTED] },
          },
        }),
        settings.accountingStartsOn
          ? this.prisma.accountingEntryLine.count({
              where: {
                clubId,
                accountCode: a.accountingAccount.code,
                bankReconciledAt: null,
                entry: {
                  financialAccountId: a.id,
                  status: { in: [AccountingEntryStatus.POSTED, AccountingEntryStatus.LOCKED] },
                  cancelledAt: null,
                  occurredAt: { gte: settings.accountingStartsOn },
                },
              },
            })
          : Promise.resolve(0),
      ]);
      out.push({
        financialAccountId: a.id,
        label: a.label,
        accountingAccountCode: a.accountingAccount.code,
        openingBalanceSet: a.openingBalanceCents !== null,
        statementCount,
        lastPeriodEnd: last?.periodEnd ?? null,
        lastStatus: last?.status ?? null,
        linesToHandle,
        unreconciledEntries,
      });
    }
    return out;
  }
}
