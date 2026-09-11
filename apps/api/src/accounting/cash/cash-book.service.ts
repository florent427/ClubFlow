import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  AccountingAuditAction,
  AccountingEntryKind,
  AccountingEntrySource,
  AccountingEntryStatus,
  AccountingLineSide,
  ClubFinancialAccountKind,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AccountingAuditService } from '../accounting-audit.service';
import { AccountingPeriodService } from '../accounting-period.service';
import { todayInClubTimezone } from '../accounting-fiscal-year.service';
import { ClubFinancialAccountsService } from '../club-financial-accounts.service';
import { BankReconciliationService } from '../bank-import/bank-reconciliation.service';

/** L'argent qui manque dans le tiroir est une charge. */
export const CASH_SHORTAGE_ACCOUNT_CODE = '658000';
/** Celui qui s'y trouve en trop est un produit. */
export const CASH_SURPLUS_ACCOUNT_CODE = '758000';

/** Seules les écritures comptabilisées font le solde d'une caisse. */
const COUNTED_STATUSES = [AccountingEntryStatus.POSTED, AccountingEntryStatus.LOCKED];

export interface CashBookLine {
  entryId: string;
  occurredAt: Date;
  label: string;
  source: AccountingEntrySource;
  /** Ce que l'écriture fait entrer (positif) ou sortir (négatif) de la caisse. */
  amountCents: number;
  /** Solde de la caisse juste après elle. */
  balanceCents: number;
  /** Comptes de contrepartie, pour lire le livre sans ouvrir chaque écriture. */
  counterpartCodes: string[];
  /** Déjà rapprochée d'une ligne de relevé (un dépôt en banque, par ex.). */
  reconciledAt: Date | null;
}

export interface CashBook {
  financialAccountId: string;
  label: string;
  accountCode: string;
  from: Date;
  to: Date;
  /** Solde la veille de `from`. */
  openingCents: number;
  closingCents: number;
  /**
   * Faux quand le compte n'a jamais reçu de solde d'ouverture : les soldes
   * sont alors comptés depuis zéro et ne valent que relativement.
   */
  hasOpeningBalance: boolean;
  lines: CashBookLine[];
}

interface MovementRow {
  entryId: string;
  occurredAt: Date;
  createdAt: Date;
  label: string;
  source: AccountingEntrySource;
  amountCents: number;
  counterpartCodes: string[];
  reconciledAt: Date | null;
}

/**
 * Livre de caisse (ADR-0014 §8).
 *
 * Une caisse n'envoie pas de relevé : personne ne la tient à part le club.
 * Son équivalent, c'est le COMPTAGE — quelqu'un ouvre le tiroir et dit ce
 * qu'il y a. L'écart entre ce compte-là et la comptabilité est une
 * information, pas encore une écriture : il ne devient charge ou produit
 * qu'une fois validé, parce qu'un écart s'explique souvent le lendemain.
 *
 * Le reste des mouvements d'espèces passe par la banque : un dépôt fait
 * sortir le 53x et entrer le 51x, et c'est la ligne « VERSEMENT ESPECES »
 * du relevé qui le confirme.
 */
@Injectable()
export class CashBookService {
  private readonly logger = new Logger(CashBookService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AccountingAuditService,
    private readonly period: AccountingPeriodService,
    private readonly financialAccounts: ClubFinancialAccountsService,
    private readonly reconciliation: BankReconciliationService,
  ) {}

  /** Le livre d'un compte sur une période, solde courant compris. */
  async book(
    clubId: string,
    financialAccountId: string,
    from: Date,
    to: Date,
  ): Promise<CashBook> {
    if (from.getTime() > to.getTime()) {
      throw new BadRequestException('La date de début est après celle de fin.');
    }
    const account = await this.financialAccounts.getById(clubId, financialAccountId);
    const code = account.accountingAccount.code;

    const openingCents = await this.balanceAt(clubId, account, dayBefore(from));
    const movements = await this.movements(clubId, code, from, to);

    let running = openingCents;
    const lines: CashBookLine[] = movements.map((m) => {
      running += m.amountCents;
      return {
        entryId: m.entryId,
        occurredAt: m.occurredAt,
        label: m.label,
        source: m.source,
        amountCents: m.amountCents,
        balanceCents: running,
        counterpartCodes: m.counterpartCodes,
        reconciledAt: m.reconciledAt,
      };
    });

    return {
      financialAccountId,
      label: account.label,
      accountCode: code,
      from,
      to,
      openingCents,
      closingCents: running,
      hasOpeningBalance: account.openingBalanceCents !== null,
      lines,
    };
  }

  /**
   * Comptage : on constate, on ne comptabilise pas. L'écart attend sa
   * validation, faute de quoi un billet retrouvé le lendemain aurait déjà
   * creusé les comptes.
   */
  async recordCount(
    clubId: string,
    userId: string,
    input: {
      financialAccountId: string;
      countedOn: Date;
      countedCents: number;
      note?: string | null;
    },
  ) {
    if (!Number.isInteger(input.countedCents) || input.countedCents < 0) {
      throw new BadRequestException('Un tiroir contient un montant entier, jamais négatif.');
    }
    const account = await this.assertCashAccount(clubId, input.financialAccountId);
    if (input.countedOn.getTime() > todayInClubTimezone().getTime()) {
      throw new BadRequestException('On ne compte pas une caisse dans le futur.');
    }
    await this.period.assertDateIsOpen(clubId, input.countedOn);

    const expectedCents = await this.balanceAt(clubId, account, input.countedOn);
    const deltaCents = input.countedCents - expectedCents;

    const existing = await this.prisma.cashCount.findFirst({
      where: { financialAccountId: account.id, countedOn: input.countedOn },
      select: { id: true },
    });
    if (existing) {
      throw new BadRequestException(
        'Cette caisse a déjà été comptée ce jour-là : supprime ou garde le comptage existant.',
      );
    }

    const count = await this.prisma.cashCount.create({
      data: {
        clubId,
        financialAccountId: account.id,
        countedOn: input.countedOn,
        countedCents: input.countedCents,
        expectedCents,
        deltaCents,
        note: input.note?.trim() || null,
        countedByUserId: userId,
      },
    });
    await this.audit.log({
      clubId,
      userId,
      action: AccountingAuditAction.CASH_COUNT,
      metadata: {
        cashCountId: count.id,
        financialAccountId: account.id,
        countedOn: isoDay(input.countedOn),
        countedCents: input.countedCents,
        expectedCents,
        deltaCents,
      },
    });
    this.logger.log(
      `[caisse ${account.id}] comptage du ${isoDay(input.countedOn)} : ${input.countedCents} c pour ${expectedCents} c attendus (écart ${deltaCents} c).`,
    );
    return this.getCount(clubId, count.id);
  }

  /**
   * Le trésorier assume l'écart : il devient une charge (658000) ou un
   * produit (758000), daté du comptage. Un écart nul se valide aussi — il
   * dit « j'ai vérifié » — mais n'écrit rien.
   */
  async validateCashCount(clubId: string, userId: string, countId: string) {
    const count = await this.prisma.cashCount.findFirst({
      where: { id: countId, clubId },
      include: { financialAccount: { include: { accountingAccount: true } } },
    });
    if (!count) throw new NotFoundException('Comptage introuvable');
    if (count.validatedAt) {
      throw new BadRequestException('Ce comptage est déjà validé.');
    }
    await this.period.assertDateIsOpen(clubId, count.countedOn);

    if (count.deltaCents === 0) {
      await this.prisma.cashCount.update({
        where: { id: count.id },
        data: { validatedAt: new Date(), validatedByUserId: userId },
      });
    } else {
      const cashCode = count.financialAccount.accountingAccount.code;
      const missing = count.deltaCents < 0;
      const magnitude = Math.abs(count.deltaCents);
      const other = await this.lookupAccount(
        clubId,
        missing ? CASH_SHORTAGE_ACCOUNT_CODE : CASH_SURPLUS_ACCOUNT_CODE,
      );
      const label = `Écart de caisse ${count.financialAccount.label} du ${isoDay(count.countedOn)}`;

      await this.prisma.$transaction(async (tx) => {
        const entry = await tx.accountingEntry.create({
          data: {
            clubId,
            kind: missing ? AccountingEntryKind.EXPENSE : AccountingEntryKind.INCOME,
            status: AccountingEntryStatus.POSTED,
            source: AccountingEntrySource.CASH_ADJUSTMENT,
            label,
            amountCents: magnitude,
            occurredAt: count.countedOn,
            createdByUserId: userId,
            financialAccountId: count.financialAccountId,
          },
        });
        // Il manque de l'argent : la caisse se vide (crédit) contre une
        // charge. Il y en a trop : elle se remplit (débit) contre un produit.
        await tx.accountingEntryLine.createMany({
          data: [
            {
              entryId: entry.id,
              clubId,
              accountCode: missing ? other.code : cashCode,
              accountLabel: missing ? other.label : count.financialAccount.accountingAccount.label,
              side: AccountingLineSide.DEBIT,
              debitCents: magnitude,
              creditCents: 0,
              sortOrder: 0,
              validatedAt: new Date(),
              validatedByUserId: userId,
            },
            {
              entryId: entry.id,
              clubId,
              accountCode: missing ? cashCode : other.code,
              accountLabel: missing ? count.financialAccount.accountingAccount.label : other.label,
              side: AccountingLineSide.CREDIT,
              debitCents: 0,
              creditCents: magnitude,
              sortOrder: 1,
              validatedAt: new Date(),
              validatedByUserId: userId,
            },
          ],
        });
        await tx.cashCount.update({
          where: { id: count.id },
          data: {
            adjustmentEntryId: entry.id,
            validatedAt: new Date(),
            validatedByUserId: userId,
          },
        });
      });
    }

    await this.audit.log({
      clubId,
      userId,
      action: AccountingAuditAction.CASH_COUNT_VALIDATE,
      metadata: {
        cashCountId: count.id,
        financialAccountId: count.financialAccountId,
        deltaCents: count.deltaCents,
      },
    });
    return this.getCount(clubId, count.id);
  }

  /** Un comptage non validé peut être jeté : il n'a rien comptabilisé. */
  async deleteCount(clubId: string, userId: string, countId: string): Promise<boolean> {
    const count = await this.prisma.cashCount.findFirst({
      where: { id: countId, clubId },
      select: { id: true, validatedAt: true },
    });
    if (!count) throw new NotFoundException('Comptage introuvable');
    if (count.validatedAt) {
      throw new BadRequestException(
        'Ce comptage est validé : son écart est comptabilisé, passe par une contre-passation.',
      );
    }
    await this.prisma.cashCount.delete({ where: { id: count.id } });
    this.logger.log(`[caisse] comptage ${countId} supprimé par ${userId}.`);
    return true;
  }

  /**
   * Dépôt d'espèces en banque (53x → 51x) ou retrait (51x → 53x). L'écriture
   * porte le compte BANCAIRE : c'est le relevé de la banque qui la
   * confirmera, la caisse n'en envoie pas.
   */
  async recordCashTransfer(
    clubId: string,
    userId: string,
    input: {
      fromAccountId: string;
      toAccountId: string;
      amountCents: number;
      on: Date;
      note?: string | null;
    },
  ) {
    if (!Number.isInteger(input.amountCents) || input.amountCents <= 0) {
      throw new BadRequestException('Montant attendu en centimes, strictement positif.');
    }
    if (input.fromAccountId === input.toAccountId) {
      throw new BadRequestException('Un mouvement va d’un compte à un autre.');
    }
    const source = await this.financialAccounts.getById(clubId, input.fromAccountId);
    const destination = await this.financialAccounts.getById(clubId, input.toAccountId);
    for (const a of [source, destination]) {
      if (!a.isActive) {
        throw new BadRequestException(`Le compte « ${a.label} » est archivé.`);
      }
    }
    const kinds = [source.kind, destination.kind];
    const isDeposit =
      source.kind === ClubFinancialAccountKind.CASH &&
      destination.kind === ClubFinancialAccountKind.BANK;
    const isWithdrawal =
      source.kind === ClubFinancialAccountKind.BANK &&
      destination.kind === ClubFinancialAccountKind.CASH;
    if (!isDeposit && !isWithdrawal) {
      throw new BadRequestException(
        `Un mouvement d’espèces va d’une caisse à une banque ou l’inverse (reçu : ${kinds.join(' → ')}).`,
      );
    }
    await this.period.assertDateIsOpen(clubId, input.on);

    const bank = isDeposit ? destination : source;
    const cash = isDeposit ? source : destination;
    const label = isDeposit
      ? `Dépôt d’espèces ${cash.label} → ${bank.label}`
      : `Retrait d’espèces ${bank.label} → ${cash.label}`;

    // `AccountingEntry` n'a pas de champ note : elle vit sur les lignes.
    const note = input.note?.trim() || null;
    const entry = await this.prisma.$transaction(async (tx) => {
      const created = await tx.accountingEntry.create({
        data: {
          clubId,
          kind: AccountingEntryKind.TRANSFER,
          status: AccountingEntryStatus.POSTED,
          source: AccountingEntrySource.CASH_TRANSFER,
          label,
          amountCents: input.amountCents,
          occurredAt: input.on,
          createdByUserId: userId,
          // Le relevé qui portera ce mouvement est celui de la BANQUE.
          financialAccountId: bank.id,
        },
      });
      await tx.accountingEntryLine.createMany({
        data: [
          {
            entryId: created.id,
            clubId,
            accountCode: destination.accountingAccount.code,
            accountLabel: destination.accountingAccount.label,
            label: note,
            side: AccountingLineSide.DEBIT,
            debitCents: input.amountCents,
            creditCents: 0,
            sortOrder: 0,
            validatedAt: new Date(),
            validatedByUserId: userId,
          },
          {
            entryId: created.id,
            clubId,
            accountCode: source.accountingAccount.code,
            accountLabel: source.accountingAccount.label,
            label: note,
            side: AccountingLineSide.CREDIT,
            debitCents: 0,
            creditCents: input.amountCents,
            sortOrder: 1,
            validatedAt: new Date(),
            validatedByUserId: userId,
          },
        ],
      });
      return created;
    });

    // Le relevé portant ce dépôt est peut-être déjà déposé.
    await this.reconciliation.matchExistingLineForEntry(clubId, entry.id);

    await this.audit.log({
      clubId,
      userId,
      entryId: entry.id,
      action: AccountingAuditAction.CASH_TRANSFER,
      metadata: {
        fromAccountId: source.id,
        toAccountId: destination.id,
        amountCents: input.amountCents,
        on: isoDay(input.on),
        direction: isDeposit ? 'DEPOSIT' : 'WITHDRAWAL',
      },
    });
    this.logger.log(
      `[caisse] ${isDeposit ? 'dépôt' : 'retrait'} de ${input.amountCents} c : ${source.label} → ${destination.label}.`,
    );
    return entry;
  }

  async listCounts(clubId: string, financialAccountId?: string | null) {
    return this.prisma.cashCount.findMany({
      where: { clubId, ...(financialAccountId ? { financialAccountId } : {}) },
      include: { financialAccount: { select: { label: true } } },
      orderBy: [{ countedOn: 'desc' }, { createdAt: 'desc' }],
      take: 200,
    });
  }

  async getCount(clubId: string, id: string) {
    const row = await this.prisma.cashCount.findFirst({
      where: { id, clubId },
      include: { financialAccount: { select: { label: true } } },
    });
    if (!row) throw new NotFoundException('Comptage introuvable');
    return row;
  }

  // ── Interne ────────────────────────────────────────────────────────────

  /**
   * Solde d'un compte à la fin du jour `on` : son solde d'ouverture, plus
   * tout ce qui a bougé depuis. Les écritures ANTÉRIEURES à la date de
   * reprise sont déjà dans ce solde d'ouverture — les recompter le
   * doublerait.
   *
   * On somme par CODE PCG, jamais par `financialAccountId` de l'écriture :
   * un dépôt d'espèces est porté par le compte bancaire (c'est son relevé
   * qui le confirme) tout en vidant la caisse. Filtrer par le compte porteur
   * le ferait disparaître du livre de la caisse.
   */
  private async balanceAt(
    clubId: string,
    account: {
      openingBalanceCents: number | null;
      openingBalanceOn: Date | null;
      accountingAccount: { code: string };
    },
    on: Date,
  ): Promise<number> {
    const opening = account.openingBalanceCents ?? 0;
    const since =
      account.openingBalanceCents !== null && account.openingBalanceOn
        ? account.openingBalanceOn
        : null;
    const sums = await this.prisma.accountingEntryLine.aggregate({
      where: this.lineWhere(clubId, account.accountingAccount.code, since, on),
      _sum: { debitCents: true, creditCents: true },
    });
    return opening + (sums._sum.debitCents ?? 0) - (sums._sum.creditCents ?? 0);
  }

  private lineWhere(
    clubId: string,
    code: string,
    since: Date | null,
    until: Date,
  ): Prisma.AccountingEntryLineWhereInput {
    return {
      clubId,
      accountCode: code,
      entry: {
        clubId,
        status: { in: COUNTED_STATUSES },
        cancelledAt: null,
        occurredAt: { ...(since ? { gte: since } : {}), lte: until },
      },
    };
  }

  private async movements(
    clubId: string,
    code: string,
    from: Date,
    to: Date,
  ): Promise<MovementRow[]> {
    const entries = await this.prisma.accountingEntry.findMany({
      where: {
        clubId,
        status: { in: COUNTED_STATUSES },
        cancelledAt: null,
        occurredAt: { gte: from, lte: to },
        lines: { some: { accountCode: code } },
      },
      select: {
        id: true,
        occurredAt: true,
        createdAt: true,
        label: true,
        source: true,
        lines: {
          select: {
            accountCode: true,
            debitCents: true,
            creditCents: true,
            bankReconciledAt: true,
          },
        },
      },
      orderBy: [{ occurredAt: 'asc' }, { createdAt: 'asc' }],
      take: 1000,
    });
    const out: MovementRow[] = [];
    for (const e of entries) {
      const cashLines = e.lines.filter((l) => l.accountCode === code);
      if (cashLines.length === 0) continue;
      const amountCents = cashLines.reduce((s, l) => s + l.debitCents - l.creditCents, 0);
      out.push({
        entryId: e.id,
        occurredAt: e.occurredAt,
        createdAt: e.createdAt,
        label: e.label,
        source: e.source,
        amountCents,
        counterpartCodes: [
          ...new Set(e.lines.filter((l) => l.accountCode !== code).map((l) => l.accountCode)),
        ],
        reconciledAt: cashLines.find((l) => l.bankReconciledAt)?.bankReconciledAt ?? null,
      });
    }
    return out;
  }

  private async assertCashAccount(clubId: string, financialAccountId: string) {
    const account = await this.financialAccounts.getById(clubId, financialAccountId);
    if (account.kind !== ClubFinancialAccountKind.CASH) {
      throw new BadRequestException('Seule une caisse se compte.');
    }
    if (!account.isActive) {
      throw new BadRequestException('Cette caisse est archivée.');
    }
    return account;
  }

  private async lookupAccount(clubId: string, code: string) {
    const account = await this.prisma.accountingAccount.findFirst({
      where: { clubId, code },
      select: { id: true, code: true, label: true },
    });
    if (!account) {
      throw new BadRequestException(
        `Le compte ${code} manque au plan comptable du club : ouvre Paramètres → Comptabilité pour le créer.`,
      );
    }
    return account;
  }
}

/** Minuit UTC de la veille : la borne basse d'un livre est exclusive. */
function dayBefore(d: Date): Date {
  return new Date(d.getTime() - 86_400_000);
}

function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}
