import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  AccountingAuditAction,
  AccountingEntryKind,
  AccountingEntrySource,
  AccountingEntryStatus,
  AccountingLineSide,
  ClubFinancialAccountKind,
  MemberStatus,
  Prisma,
  VolunteerReimbursementStatus,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AccountingAuditService } from '../accounting-audit.service';
import { AccountingPeriodService } from '../accounting-period.service';
import { ClubFinancialAccountsService } from '../club-financial-accounts.service';
import { BankReconciliationService } from '../bank-import/bank-reconciliation.service';

/** Compte de tiers unique : la ventilation par personne est sur l'écriture. */
export const VOLUNTEER_ACCOUNT_CODE = '467100';

export interface VolunteerBalance {
  memberId: string;
  firstName: string;
  lastName: string;
  /** Ce que le club lui doit encore, en centimes. */
  openCents: number;
  openCount: number;
  /** Reçu ouvert le plus ancien, pour trier par urgence. */
  oldestOccurredAt: Date | null;
}

export interface VolunteerOpenItem {
  entryId: string;
  label: string;
  occurredAt: Date;
  amountCents: number;
  accountCode: string;
  accountLabel: string;
}

type EntryWithLines = Prisma.AccountingEntryGetPayload<{ include: { lines: true } }>;

/**
 * Frais avancés par un bénévole (ADR-0016).
 *
 * Un bénévole paie de sa poche, le club lui doit. La dépense est
 * comptabilisée à sa date avec pour contrepartie le compte de tiers 467100,
 * et non un compte de trésorerie : l'argent n'est pas sorti du club ce
 * jour-là. Le remboursement, souvent groupé, solde ce compte en une seule
 * écriture — celle que le relevé bancaire portera.
 */
@Injectable()
export class VolunteerAdvancesService {
  private readonly logger = new Logger(VolunteerAdvancesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AccountingAuditService,
    private readonly period: AccountingPeriodService,
    private readonly financialAccounts: ClubFinancialAccountsService,
    private readonly reconciliation: BankReconciliationService,
  ) {}

  /**
   * Désigne (ou retire) le bénévole qui a avancé cette dépense. La
   * contrepartie bascule entre le compte de trésorerie et 467100 : c'est
   * tout l'objet de l'opération, et elle n'a de sens que tant que l'écriture
   * n'est pas comptabilisée — après, il faut une contre-passation.
   */
  async setAdvancedBy(
    clubId: string,
    userId: string,
    entryId: string,
    memberId: string | null,
  ): Promise<EntryWithLines> {
    const entry = await this.prisma.accountingEntry.findFirst({
      where: { id: entryId, clubId },
      include: { lines: { orderBy: { sortOrder: 'asc' } } },
    });
    if (!entry) throw new NotFoundException('Écriture introuvable');
    if (
      entry.status !== AccountingEntryStatus.NEEDS_REVIEW &&
      entry.status !== AccountingEntryStatus.DRAFT
    ) {
      throw new BadRequestException(
        'Écriture déjà comptabilisée : passe par une contre-passation pour changer sa contrepartie.',
      );
    }
    if (entry.kind !== AccountingEntryKind.EXPENSE) {
      throw new BadRequestException('Seule une dépense peut être avancée par un bénévole.');
    }
    await this.period.assertDateIsOpen(clubId, entry.occurredAt);

    if (memberId) {
      const member = await this.prisma.member.findFirst({
        where: { id: memberId, clubId, status: MemberStatus.ACTIVE },
        select: { id: true },
      });
      if (!member) throw new BadRequestException('Bénévole introuvable dans ce club.');
    }

    const volunteerAccount = await this.lookupAccount(clubId, VOLUNTEER_ACCOUNT_CODE);
    // La contrepartie d'une dépense est au CRÉDIT : c'est elle qu'on bascule.
    const counterpart = entry.lines.find((l) => l.side === AccountingLineSide.CREDIT);
    if (!counterpart) {
      throw new BadRequestException('Écriture sans contrepartie : impossible de la basculer.');
    }

    if (memberId) {
      if (entry.advancedByMemberId === memberId) return entry;
      await this.prisma.$transaction(async (tx) => {
        await tx.accountingEntryLine.update({
          where: { id: counterpart.id },
          data: { accountCode: volunteerAccount.code, accountLabel: volunteerAccount.label },
        });
        await tx.accountingEntry.update({
          where: { id: entry.id },
          data: {
            advancedByMemberId: memberId,
            // L'argent n'est pas sorti d'un compte du club : aucune
            // trésorerie ne porte cette écriture.
            financialAccountId: null,
          },
        });
      });
    } else {
      if (!entry.advancedByMemberId) return entry;
      // Retour à une dépense payée par le club : la contrepartie redevient
      // sa banque par défaut, faute de savoir laquelle était visée avant.
      const bank = await this.financialAccounts.getDefault(
        clubId,
        ClubFinancialAccountKind.BANK,
      );
      if (!bank) {
        throw new BadRequestException(
          'Aucun compte bancaire par défaut : impossible de rendre cette dépense au club.',
        );
      }
      const bankAccount = await this.lookupAccount(clubId, bank.accountingAccount.code);
      await this.prisma.$transaction(async (tx) => {
        await tx.accountingEntryLine.update({
          where: { id: counterpart.id },
          data: { accountCode: bankAccount.code, accountLabel: bankAccount.label },
        });
        await tx.accountingEntry.update({
          where: { id: entry.id },
          data: { advancedByMemberId: null, financialAccountId: bank.id },
        });
      });
    }

    await this.audit.log({
      clubId,
      userId,
      entryId: entry.id,
      action: AccountingAuditAction.UPDATE,
      metadata: {
        source: 'VOLUNTEER_ADVANCE',
        advancedByMemberId: memberId,
        counterpartBefore: counterpart.accountCode,
      },
    });
    return this.prisma.accountingEntry.findFirstOrThrow({
      where: { id: entry.id },
      include: { lines: { orderBy: { sortOrder: 'asc' } } },
    });
  }

  /**
   * Ce que le club doit à chaque bénévole : la somme de ses reçus avancés
   * qu'aucun remboursement en vigueur ne couvre. Compté sur les reçus
   * eux-mêmes, et non par différence entre deux totaux : un remboursement
   * annulé rend ses reçus dus, sans calcul à rejouer.
   */
  async balances(clubId: string): Promise<VolunteerBalance[]> {
    const open = await this.openEntries(clubId, null);
    const byMember = new Map<string, VolunteerBalance>();
    for (const e of open) {
      const m = e.advancedByMember;
      if (!m) continue;
      const row = byMember.get(m.id) ?? {
        memberId: m.id,
        firstName: m.firstName,
        lastName: m.lastName,
        openCents: 0,
        openCount: 0,
        oldestOccurredAt: null,
      };
      row.openCents += e.amountCents;
      row.openCount += 1;
      if (!row.oldestOccurredAt || e.occurredAt < row.oldestOccurredAt) {
        row.oldestOccurredAt = e.occurredAt;
      }
      byMember.set(m.id, row);
    }
    return [...byMember.values()].sort((a, b) => b.openCents - a.openCents);
  }

  /** Les reçus d'un bénévole qui attendent encore leur remboursement. */
  async openItems(clubId: string, memberId: string): Promise<VolunteerOpenItem[]> {
    const rows = await this.openEntries(clubId, memberId);
    return rows.map((e) => {
      const charge = e.lines.find((l) => l.side === AccountingLineSide.DEBIT) ?? e.lines[0];
      return {
        entryId: e.id,
        label: e.label,
        occurredAt: e.occurredAt,
        amountCents: e.amountCents,
        accountCode: charge?.accountCode ?? '',
        accountLabel: charge?.accountLabel ?? '',
      };
    });
  }

  /**
   * Rembourse en une écriture : DÉBIT 467100 / CRÉDIT compte du club, du
   * total des reçus couverts. Tout tient dans une transaction — un
   * remboursement dont l'écriture manquerait, ou dont la liste des reçus
   * serait incomplète, laisserait une dette fantôme.
   */
  async recordReimbursement(
    clubId: string,
    userId: string,
    input: {
      memberId: string;
      financialAccountId: string;
      paidOn: Date;
      entryIds: string[];
    },
  ) {
    if (input.entryIds.length === 0) {
      throw new BadRequestException('Aucun reçu à rembourser.');
    }
    const ids = new Set(input.entryIds);
    if (ids.size !== input.entryIds.length) {
      throw new BadRequestException('Un même reçu figure deux fois.');
    }
    await this.period.assertDateIsOpen(clubId, input.paidOn);
    const member = await this.prisma.member.findFirst({
      where: { id: input.memberId, clubId },
      select: { id: true, firstName: true, lastName: true },
    });
    if (!member) throw new NotFoundException('Bénévole introuvable');
    const fin = await this.financialAccounts.getById(clubId, input.financialAccountId);
    if (
      !fin.isActive ||
      (fin.kind !== ClubFinancialAccountKind.BANK && fin.kind !== ClubFinancialAccountKind.CASH)
    ) {
      throw new BadRequestException('Rembourse depuis une banque ou une caisse active du club.');
    }

    // Seuls des reçus ouverts de CE bénévole : la garde est ici, et le
    // `@@unique([reimbursementId, entryId])` ne protège que du doublon
    // dans un même remboursement.
    const open = await this.openEntries(clubId, input.memberId);
    const openById = new Map(open.map((e) => [e.id, e]));
    const selected = input.entryIds.map((id) => {
      const e = openById.get(id);
      if (!e) {
        throw new BadRequestException(
          'Un des reçus n’est plus à rembourser : déjà remboursé, annulé, ou d’un autre bénévole.',
        );
      }
      return e;
    });
    const totalCents = selected.reduce((s, e) => s + e.amountCents, 0);
    if (totalCents <= 0) throw new BadRequestException('Total à rembourser nul.');

    const volunteerAccount = await this.lookupAccount(clubId, VOLUNTEER_ACCOUNT_CODE);
    const bankAccount = await this.lookupAccount(clubId, fin.accountingAccount.code);
    const label = `Remboursement ${member.firstName} ${member.lastName} (${selected.length} reçu${selected.length > 1 ? 's' : ''})`;

    const created = await this.prisma.$transaction(async (tx) => {
      const entry = await tx.accountingEntry.create({
        data: {
          clubId,
          kind: AccountingEntryKind.TRANSFER,
          status: AccountingEntryStatus.POSTED,
          source: AccountingEntrySource.VOLUNTEER_REIMBURSEMENT,
          label,
          amountCents: totalCents,
          occurredAt: input.paidOn,
          createdByUserId: userId,
          financialAccountId: fin.id,
        },
      });
      // La dette envers le bénévole s'éteint (débit), la trésorerie sort
      // (crédit).
      await tx.accountingEntryLine.create({
        data: {
          entryId: entry.id,
          clubId,
          accountCode: volunteerAccount.code,
          accountLabel: volunteerAccount.label,
          side: AccountingLineSide.DEBIT,
          debitCents: totalCents,
          creditCents: 0,
          sortOrder: 0,
          validatedAt: new Date(),
          validatedByUserId: userId,
        },
      });
      await tx.accountingEntryLine.create({
        data: {
          entryId: entry.id,
          clubId,
          accountCode: bankAccount.code,
          accountLabel: bankAccount.label,
          side: AccountingLineSide.CREDIT,
          debitCents: 0,
          creditCents: totalCents,
          sortOrder: 1,
          validatedAt: new Date(),
          validatedByUserId: userId,
        },
      });
      const reimbursement = await tx.volunteerReimbursement.create({
        data: {
          clubId,
          memberId: member.id,
          financialAccountId: fin.id,
          paidOn: input.paidOn,
          totalCents,
          entryId: entry.id,
          createdByUserId: userId,
        },
      });
      await tx.volunteerReimbursementItem.createMany({
        data: selected.map((e) => ({
          reimbursementId: reimbursement.id,
          entryId: e.id,
          amountCents: e.amountCents,
        })),
      });
      return reimbursement;
    });

    // Le relevé qui porte ce virement est peut-être déjà déposé : sa ligne
    // attend alors sans rien pour la rattacher. Hors transaction, car le
    // rapprochement doit voir l'écriture commitée.
    if (created.entryId) {
      await this.reconciliation.matchExistingLineForEntry(clubId, created.entryId);
    }

    await this.audit.log({
      clubId,
      userId,
      entryId: created.entryId,
      action: AccountingAuditAction.VOLUNTEER_REIMBURSEMENT,
      metadata: {
        reimbursementId: created.id,
        memberId: member.id,
        totalCents,
        entryIds: input.entryIds,
        paidOn: input.paidOn.toISOString().slice(0, 10),
      },
    });
    this.logger.log(
      `[bénévole ${member.id}] remboursement de ${totalCents} c sur ${selected.length} reçu(s)`,
    );
    return this.getReimbursement(clubId, created.id);
  }

  async listReimbursements(clubId: string, memberId?: string | null) {
    return this.prisma.volunteerReimbursement.findMany({
      where: { clubId, ...(memberId ? { memberId } : {}) },
      orderBy: [{ paidOn: 'desc' }, { createdAt: 'desc' }],
      include: {
        member: { select: { id: true, firstName: true, lastName: true } },
        financialAccount: { select: { id: true, label: true } },
        items: { include: { entry: { select: { id: true, label: true, occurredAt: true } } } },
      },
      take: 200,
    });
  }

  async getReimbursement(clubId: string, id: string) {
    const row = await this.prisma.volunteerReimbursement.findFirst({
      where: { id, clubId },
      include: {
        member: { select: { id: true, firstName: true, lastName: true } },
        financialAccount: { select: { id: true, label: true } },
        items: { include: { entry: { select: { id: true, label: true, occurredAt: true } } } },
      },
    });
    if (!row) throw new NotFoundException('Remboursement introuvable');
    return row;
  }

  // ── Interne ───────────────────────────────────────────────────────────

  /**
   * Reçus avancés encore dus : comptabilisés, non annulés, et couverts par
   * aucun remboursement en vigueur.
   */
  private async openEntries(clubId: string, memberId: string | null) {
    return this.prisma.accountingEntry.findMany({
      where: {
        clubId,
        advancedByMemberId: memberId ?? { not: null },
        status: { in: [AccountingEntryStatus.POSTED, AccountingEntryStatus.LOCKED] },
        cancelledAt: null,
        reimbursementItems: {
          none: { reimbursement: { status: VolunteerReimbursementStatus.POSTED } },
        },
      },
      orderBy: { occurredAt: 'asc' },
      include: {
        lines: { orderBy: { sortOrder: 'asc' } },
        advancedByMember: { select: { id: true, firstName: true, lastName: true } },
      },
      take: 500,
    });
  }

  private async lookupAccount(clubId: string, code: string) {
    const account = await this.prisma.accountingAccount.findUnique({
      where: { clubId_code: { clubId, code } },
      select: { code: true, label: true, isActive: true },
    });
    if (!account || !account.isActive) {
      throw new BadRequestException(
        `Compte ${code} absent du plan comptable du club : ouvre Comptabilité pour le laisser se créer.`,
      );
    }
    return account;
  }
}
