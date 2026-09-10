import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  AccountingAuditAction,
  AccountingEntryKind,
  AccountingEntrySource,
  AccountingEntryStatus,
  AccountingLineSide,
  ChequeDepositStatus,
  ChequeStatus,
  ClubFinancialAccountKind,
  Prisma,
} from '@prisma/client';
import { AccountingAuditService } from '../accounting/accounting-audit.service';
import {
  AccountingFiscalYearService,
  formatIsoDate,
  todayInClubTimezone,
} from '../accounting/accounting-fiscal-year.service';
import { AccountingPeriodService } from '../accounting/accounting-period.service';
import { AccountingSeedService } from '../accounting/accounting-seed.service';
import { ClubFinancialAccountsService } from '../accounting/club-financial-accounts.service';
import { MediaAssetsService } from '../media/media-assets.service';
import { ChequeDepositPdfService } from '../pdf/cheque-deposit-pdf.service';
import { PrismaService } from '../prisma/prisma.service';
import { chequeInclude } from './cheques.service';

export const depositInclude = {
  financialAccount: {
    select: {
      id: true,
      label: true,
      iban: true,
      bic: true,
      accountingAccount: { select: { code: true } },
    },
  },
  slip: { select: { id: true, publicUrl: true } },
  cheques: { include: chequeInclude, orderBy: { receivedOn: 'asc' as const } },
} satisfies Prisma.ChequeDepositInclude;

export type ChequeDepositRow = Prisma.ChequeDepositGetPayload<{
  include: typeof depositInclude;
}>;

/** Largeur du compteur : « R-2026-0007 ». */
const SEQ_WIDTH = 4;
/** Collision de numéro sous concurrence : on recalcule et on réessaie. */
const MAX_NUMBERING_ATTEMPTS = 3;

function isUniqueViolation(err: unknown): boolean {
  return (
    err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002'
  );
}

function frDate(d: Date): string {
  return `${String(d.getUTCDate()).padStart(2, '0')}/${String(
    d.getUTCMonth() + 1,
  ).padStart(2, '0')}/${d.getUTCFullYear()}`;
}

/**
 * Remises de chèques (ADR-0015).
 *
 * Une remise = N chèques en portefeuille + UNE écriture DÉBIT 512x / CRÉDIT
 * 511200 du total, datée du dépôt + un bordereau PDF. Tout ce qui fait la
 * remise (numéro, écriture, passage des chèques en DEPOSITED) vit dans une
 * seule transaction : une remise à moitié faite n'existe pas.
 */
@Injectable()
export class ChequeDepositsService {
  private readonly logger = new Logger(ChequeDepositsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly financialAccounts: ClubFinancialAccountsService,
    private readonly seed: AccountingSeedService,
    private readonly period: AccountingPeriodService,
    private readonly fiscal: AccountingFiscalYearService,
    private readonly audit: AccountingAuditService,
    private readonly media: MediaAssetsService,
    private readonly pdf: ChequeDepositPdfService,
  ) {}

  async list(clubId: string): Promise<ChequeDepositRow[]> {
    return this.prisma.chequeDeposit.findMany({
      where: { clubId },
      orderBy: [{ depositedOn: 'desc' }, { number: 'desc' }],
      include: depositInclude,
    });
  }

  async getById(clubId: string, id: string): Promise<ChequeDepositRow> {
    const row = await this.prisma.chequeDeposit.findFirst({
      where: { id, clubId },
      include: depositInclude,
    });
    if (!row) throw new NotFoundException('Remise introuvable');
    return row;
  }

  async create(
    clubId: string,
    userId: string,
    input: {
      financialAccountId: string;
      depositedOn: Date;
      chequeIds: string[];
      notes?: string | null;
    },
  ): Promise<ChequeDepositRow> {
    const ids = [...new Set(input.chequeIds)];
    if (ids.length === 0) throw new BadRequestException('Aucun chèque sélectionné.');

    await this.seed.seedIfEmpty(clubId);
    const bank = await this.financialAccounts.getById(clubId, input.financialAccountId);
    if (bank.kind !== ClubFinancialAccountKind.BANK || !bank.isActive) {
      throw new BadRequestException(
        'Une remise se dépose sur un compte bancaire actif.',
      );
    }
    const transit = await this.financialAccounts.getDefault(
      clubId,
      ClubFinancialAccountKind.CHEQUE_TRANSIT,
    );
    if (!transit) {
      throw new BadRequestException(
        'Aucun compte « Chèques à encaisser » (511200) : crée-le dans Paramètres → Comptabilité.',
      );
    }

    const cheques = await this.prisma.cheque.findMany({
      where: { id: { in: ids }, clubId },
      select: { id: true, status: true, receivedOn: true, amountCents: true },
    });
    if (cheques.length !== ids.length) {
      throw new NotFoundException('Un ou plusieurs chèques sont introuvables.');
    }
    const notPending = cheques.filter((c) => c.status !== ChequeStatus.PENDING);
    if (notPending.length > 0) {
      throw new BadRequestException(
        `${notPending.length} chèque(s) ne sont plus en portefeuille.`,
      );
    }
    const latestReceived = cheques.reduce(
      (max, c) => (c.receivedOn > max ? c.receivedOn : max),
      cheques[0].receivedOn,
    );
    if (input.depositedOn.getTime() < latestReceived.getTime()) {
      throw new BadRequestException(
        `La remise ne peut pas précéder la réception du chèque le plus récent (${frDate(latestReceived)}).`,
      );
    }
    await this.period.assertDateIsOpen(clubId, input.depositedOn);

    const totalCents = cheques.reduce((s, c) => s + c.amountCents, 0);
    const settings = await this.fiscal.getSettings(clubId);
    const prefix = `R-${AccountingFiscalYearService.yearFor(settings, input.depositedOn)}-`;
    const notes = input.notes?.trim() || null;

    let deposit: { id: string; number: string; entryId: string | null } | null = null;
    for (let attempt = 1; attempt <= MAX_NUMBERING_ATTEMPTS; attempt++) {
      try {
        deposit = await this.prisma.$transaction(async (tx) => {
          const number = await this.nextNumber(tx, clubId, prefix);
          const label = `Remise de chèques ${number} (${ids.length} chèque${ids.length > 1 ? 's' : ''})`;
          const entry = await tx.accountingEntry.create({
            data: {
              clubId,
              // Ni produit ni charge : l'argent change de compte d'actif.
              kind: AccountingEntryKind.TRANSFER,
              status: AccountingEntryStatus.POSTED,
              source: AccountingEntrySource.CHEQUE_DEPOSIT,
              label,
              amountCents: totalCents,
              occurredAt: input.depositedOn,
              financialAccountId: bank.id,
              paymentMethod: 'CHECK',
              paymentReference: number,
              createdByUserId: userId,
            },
          });
          await tx.accountingEntryLine.create({
            data: {
              entryId: entry.id,
              clubId,
              accountCode: bank.accountingAccount.code,
              accountLabel: bank.accountingAccount.label,
              side: AccountingLineSide.DEBIT,
              debitCents: totalCents,
              creditCents: 0,
              sortOrder: 0,
            },
          });
          await tx.accountingEntryLine.create({
            data: {
              entryId: entry.id,
              clubId,
              accountCode: transit.accountingAccount.code,
              accountLabel: transit.accountingAccount.label,
              side: AccountingLineSide.CREDIT,
              debitCents: 0,
              creditCents: totalCents,
              sortOrder: 1,
            },
          });
          const created = await tx.chequeDeposit.create({
            data: {
              clubId,
              number,
              financialAccountId: bank.id,
              depositedOn: input.depositedOn,
              totalCents,
              chequeCount: ids.length,
              status: ChequeDepositStatus.DEPOSITED,
              entryId: entry.id,
              notes,
              createdByUserId: userId,
            },
            select: { id: true, number: true, entryId: true },
          });
          // Garde de concurrence : un chèque remis entre la vérification et
          // ici ferait échouer la remise ENTIÈRE, écriture comprise.
          const { count } = await tx.cheque.updateMany({
            where: { id: { in: ids }, clubId, status: ChequeStatus.PENDING },
            data: { status: ChequeStatus.DEPOSITED, depositId: created.id },
          });
          if (count !== ids.length) {
            throw new BadRequestException(
              'Un chèque a été remis entre-temps. Recharge la liste et recommence.',
            );
          }
          return created;
        });
        break;
      } catch (err) {
        if (isUniqueViolation(err) && attempt < MAX_NUMBERING_ATTEMPTS) {
          this.logger.warn(
            `[remise] collision de numéro ${prefix}… pour ${clubId}, nouvel essai (${attempt}).`,
          );
          continue;
        }
        throw err;
      }
    }
    if (!deposit) {
      throw new BadRequestException(
        'Impossible d’attribuer un numéro de remise, réessaie.',
      );
    }

    await this.audit.log({
      clubId,
      userId,
      entryId: deposit.entryId,
      action: AccountingAuditAction.CHEQUE_DEPOSIT,
      metadata: {
        depositId: deposit.id,
        number: deposit.number,
        chequeIds: ids,
        totalCents,
        depositedOn: formatIsoDate(input.depositedOn),
      },
    });

    // Le bordereau est une pièce, pas la garantie : s'il échoue, la remise
    // existe et `generateSlip` le régénère.
    try {
      await this.generateSlip(clubId, userId, deposit.id);
    } catch (err) {
      this.logger.warn(
        `[remise] bordereau ${deposit.number} non généré : ${err instanceof Error ? err.message : String(err)}`,
      );
    }
    return this.getById(clubId, deposit.id);
  }

  /** « R-<exercice>-NNNN », suffixe = dernier + 1. Zéro-paddé : le tri lexicographique est le tri numérique. */
  private async nextNumber(
    tx: Prisma.TransactionClient,
    clubId: string,
    prefix: string,
  ): Promise<string> {
    const last = await tx.chequeDeposit.findFirst({
      where: { clubId, number: { startsWith: prefix } },
      orderBy: { number: 'desc' },
      select: { number: true },
    });
    const lastSeq = last ? Number(last.number.slice(prefix.length)) : 0;
    const next = (Number.isFinite(lastSeq) ? lastSeq : 0) + 1;
    return `${prefix}${String(next).padStart(SEQ_WIDTH, '0')}`;
  }

  /**
   * Annule une remise : contre-passation de son écriture (datée du jour),
   * chèques de retour en portefeuille, remise CANCELLED. Une remise déjà
   * rapprochée avec la banque ne s'annule pas : la banque l'a vue.
   */
  async cancel(
    clubId: string,
    userId: string,
    depositId: string,
    reason: string,
    now: Date = todayInClubTimezone(),
  ): Promise<ChequeDepositRow> {
    const deposit = await this.getById(clubId, depositId);
    if (deposit.status === ChequeDepositStatus.CANCELLED) {
      throw new BadRequestException('Cette remise est déjà annulée.');
    }
    if (deposit.status === ChequeDepositStatus.RECONCILED) {
      throw new BadRequestException(
        'Cette remise est rapprochée avec le relevé bancaire : elle ne s’annule plus.',
      );
    }
    const motif = reason.trim();
    if (!motif) throw new BadRequestException('Motif requis.');
    await this.period.assertDateIsOpen(clubId, now);

    const source = deposit.entryId
      ? await this.prisma.accountingEntry.findFirst({
          where: { id: deposit.entryId, clubId },
          include: { lines: true },
        })
      : null;

    await this.prisma.$transaction(async (tx) => {
      if (source && !source.contraEntryId) {
        const contra = await tx.accountingEntry.create({
          data: {
            clubId,
            kind: AccountingEntryKind.TRANSFER,
            status: AccountingEntryStatus.POSTED,
            source: AccountingEntrySource.CHEQUE_DEPOSIT,
            label: `Annulation remise ${deposit.number} — ${motif}`,
            amountCents: source.amountCents,
            contraEntryId: source.id,
            occurredAt: now,
            financialAccountId: source.financialAccountId,
            paymentMethod: 'CHECK',
            paymentReference: deposit.number,
            createdByUserId: userId,
          },
        });
        for (const line of source.lines) {
          await tx.accountingEntryLine.create({
            data: {
              entryId: contra.id,
              clubId,
              accountCode: line.accountCode,
              accountLabel: line.accountLabel,
              side:
                line.side === AccountingLineSide.DEBIT
                  ? AccountingLineSide.CREDIT
                  : AccountingLineSide.DEBIT,
              debitCents: line.creditCents,
              creditCents: line.debitCents,
              sortOrder: line.sortOrder,
            },
          });
        }
        await tx.accountingEntry.update({
          where: { id: source.id },
          data: {
            contraEntryId: contra.id,
            status: AccountingEntryStatus.CANCELLED,
            cancelledAt: new Date(),
            cancelledByUserId: userId,
          },
        });
      }
      await tx.cheque.updateMany({
        where: { depositId: deposit.id, clubId },
        data: { status: ChequeStatus.PENDING, depositId: null },
      });
      await tx.chequeDeposit.update({
        where: { id: deposit.id },
        data: {
          status: ChequeDepositStatus.CANCELLED,
          notes: deposit.notes ? `${deposit.notes}\nAnnulée : ${motif}` : `Annulée : ${motif}`,
        },
      });
    });

    await this.audit.log({
      clubId,
      userId,
      entryId: deposit.entryId,
      action: AccountingAuditAction.CHEQUE_DEPOSIT_CANCEL,
      metadata: { depositId: deposit.id, number: deposit.number, reason: motif },
    });
    return this.getById(clubId, deposit.id);
  }

  /** (Re)génère le bordereau PDF et l'archive comme média privé de la remise. */
  async generateSlip(
    clubId: string,
    userId: string | null,
    depositId: string,
  ): Promise<ChequeDepositRow> {
    const deposit = await this.getById(clubId, depositId);
    const club = await this.prisma.club.findUnique({
      where: { id: clubId },
      select: { name: true, siret: true },
    });
    if (!club) throw new NotFoundException('Club introuvable');

    const buffer = await this.pdf.build({
      club: { name: club.name, siret: club.siret ?? null },
      deposit: {
        number: deposit.number,
        depositedOn: deposit.depositedOn,
        totalCents: deposit.totalCents,
        chequeCount: deposit.chequeCount,
        notes: deposit.notes,
        cancelled: deposit.status === ChequeDepositStatus.CANCELLED,
      },
      bank: {
        label: deposit.financialAccount.label,
        iban: deposit.financialAccount.iban,
        bic: deposit.financialAccount.bic,
        accountingAccountCode: deposit.financialAccount.accountingAccount.code,
      },
      cheques: deposit.cheques.map((c) => ({
        number: c.number,
        drawerName: c.drawerName,
        bankName: c.bankName,
        amountCents: c.amountCents,
        receivedOn: c.receivedOn,
      })),
    });

    const asset = await this.media.uploadDocument(
      clubId,
      userId,
      {
        originalname: `Remise_${deposit.number}.pdf`,
        mimetype: 'application/pdf',
        size: buffer.byteLength,
        buffer,
      },
      { kind: 'CHEQUE_DEPOSIT', id: deposit.id },
    );
    const previous = deposit.slipAssetId;
    await this.prisma.chequeDeposit.update({
      where: { id: deposit.id },
      data: { slipAssetId: asset.id },
    });
    if (previous && previous !== asset.id) {
      try {
        await this.media.delete(clubId, previous);
      } catch (err) {
        this.logger.warn(
          `[remise] ancien bordereau ${previous} non supprimé : ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
    return this.getById(clubId, deposit.id);
  }
}
