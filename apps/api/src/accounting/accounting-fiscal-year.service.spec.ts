import { BadRequestException, NotFoundException } from '@nestjs/common';
import {
  AccountingFiscalYearService,
  formatIsoDate,
  parseIsoDate,
  todayInClubTimezone,
} from './accounting-fiscal-year.service';
import type { PrismaService } from '../prisma/prisma.service';

const SEPT = { fiscalYearStartMonth: 9, fiscalYearStartDay: 1 };
const JAN = { fiscalYearStartMonth: 1, fiscalYearStartDay: 1 };

describe('AccountingFiscalYearService — helpers purs', () => {
  it('boundsFor : l’exercice 2026 au 1er septembre va du 2026-09-01 au 2027-08-31', () => {
    const b = AccountingFiscalYearService.boundsFor(SEPT, 2026);
    expect(formatIsoDate(b.startsOn)).toBe('2026-09-01');
    expect(formatIsoDate(b.endsOn)).toBe('2027-08-31');
    expect(formatIsoDate(b.endsBefore)).toBe('2027-09-01');
    expect(b.label).toBe('2026-2027');
  });

  it('boundsFor : au 1er janvier, rien ne change pour les clubs existants', () => {
    const b = AccountingFiscalYearService.boundsFor(JAN, 2026);
    expect(formatIsoDate(b.startsOn)).toBe('2026-01-01');
    expect(formatIsoDate(b.endsOn)).toBe('2026-12-31');
    expect(b.label).toBe('2026');
  });

  it('yearFor : la veille du début appartient à l’exercice précédent', () => {
    const y = (s: typeof SEPT, iso: string) =>
      AccountingFiscalYearService.yearFor(s, parseIsoDate(iso));
    expect(y(SEPT, '2026-08-31')).toBe(2025);
    expect(y(SEPT, '2026-09-01')).toBe(2026);
    expect(y(SEPT, '2027-03-15')).toBe(2026);
    expect(y(SEPT, '2027-08-31')).toBe(2026);
    expect(y(SEPT, '2027-09-01')).toBe(2027);
    expect(y(JAN, '2026-12-31')).toBe(2026);
    expect(y(JAN, '2026-01-01')).toBe(2026);
  });

  it('monthsOf : les 12 mois de septembre à août, dans l’ordre', () => {
    const months = AccountingFiscalYearService.monthsOf(
      AccountingFiscalYearService.boundsFor(SEPT, 2026),
    );
    expect(months).toEqual([
      '2026-09',
      '2026-10',
      '2026-11',
      '2026-12',
      '2027-01',
      '2027-02',
      '2027-03',
      '2027-04',
      '2027-05',
      '2027-06',
      '2027-07',
      '2027-08',
    ]);
  });

  it('assertValidStart refuse les dates qui n’existent pas chaque année', () => {
    expect(() => AccountingFiscalYearService.assertValidStart(2, 29)).toThrow(
      BadRequestException,
    );
    expect(() => AccountingFiscalYearService.assertValidStart(2, 30)).toThrow(
      BadRequestException,
    );
    expect(() => AccountingFiscalYearService.assertValidStart(4, 31)).toThrow(
      BadRequestException,
    );
    expect(() => AccountingFiscalYearService.assertValidStart(13, 1)).toThrow(
      BadRequestException,
    );
    expect(() => AccountingFiscalYearService.assertValidStart(1, 0)).toThrow(
      BadRequestException,
    );
    expect(() =>
      AccountingFiscalYearService.assertValidStart(9, 1),
    ).not.toThrow();
    expect(() =>
      AccountingFiscalYearService.assertValidStart(12, 31),
    ).not.toThrow();
  });

  it('parseIsoDate refuse un format libre et une date impossible', () => {
    expect(() => parseIsoDate('01/09/2026')).toThrow(BadRequestException);
    expect(() => parseIsoDate('2026-02-30')).toThrow(BadRequestException);
    expect(formatIsoDate(parseIsoDate('2026-09-01'))).toBe('2026-09-01');
  });

  it('todayInClubTimezone : à 22 h UTC, La Réunion est déjà au lendemain', () => {
    const today = todayInClubTimezone(new Date('2026-09-10T22:30:00Z'));
    expect(formatIsoDate(today)).toBe('2026-09-11');
  });
});

describe('AccountingFiscalYearService — réglages du club', () => {
  const clubId = 'club-1';
  let club: {
    fiscalYearStartMonth: number;
    fiscalYearStartDay: number;
    accountingStartsOn: Date | null;
  };
  let accounts: Array<{
    id: string;
    clubId: string;
    openingBalanceCents: number | null;
    openingBalanceOn: Date | null;
  }>;
  let svc: AccountingFiscalYearService;
  let statementCount: number;

  beforeEach(() => {
    club = { fiscalYearStartMonth: 1, fiscalYearStartDay: 31, accountingStartsOn: null };
    statementCount = 0;
    accounts = [
      { id: 'fa-1', clubId, openingBalanceCents: null, openingBalanceOn: null },
      { id: 'fa-other', clubId: 'club-2', openingBalanceCents: null, openingBalanceOn: null },
    ];
    const prisma = {
      club: {
        findUnique: jest.fn(async ({ where }: { where: { id: string } }) =>
          where.id === clubId ? { ...club } : null,
        ),
        update: jest.fn(
          async ({ data }: { data: Partial<typeof club> }) => {
            club = { ...club, ...data };
            return club;
          },
        ),
      },
      bankStatement: { count: jest.fn(async () => statementCount) },
      clubFinancialAccount: {
        findFirst: jest.fn(
          async ({ where }: { where: { id: string; clubId: string } }) =>
            accounts.find(
              (a) => a.id === where.id && a.clubId === where.clubId,
            ) ?? null,
        ),
        update: jest.fn(
          async ({
            where,
            data,
          }: {
            where: { id: string };
            data: Partial<typeof accounts[number]>;
          }) => {
            const row = accounts.find((a) => a.id === where.id)!;
            Object.assign(row, data);
            return { ...row, accountingAccount: { code: '512000' } };
          },
        ),
      },
    } as unknown as PrismaService;
    svc = new AccountingFiscalYearService(prisma);
  });

  it('updateSettings valide le couple FINAL mois/jour : changer le mois seul peut rendre le jour invalide', async () => {
    // Jour 31 conservé, mois passé à avril → 31/04 n'existe pas.
    await expect(
      svc.updateSettings(clubId, { fiscalYearStartMonth: 4 }),
    ).rejects.toThrow(BadRequestException);
    expect(club.fiscalYearStartMonth).toBe(1);
  });

  it('updateSettings enregistre un début au 1er septembre et une reprise passée', async () => {
    const now = parseIsoDate('2026-09-10');
    const out = await svc.updateSettings(
      clubId,
      {
        fiscalYearStartMonth: 9,
        fiscalYearStartDay: 1,
        accountingStartsOn: parseIsoDate('2026-09-01'),
      },
      now,
    );
    expect(out.fiscalYearStartMonth).toBe(9);
    expect(out.fiscalYearStartDay).toBe(1);
    expect(formatIsoDate(out.accountingStartsOn!)).toBe('2026-09-01');
  });

  it('updateSettings refuse une reprise dans le futur', async () => {
    const now = parseIsoDate('2026-09-10');
    await expect(
      svc.updateSettings(
        clubId,
        { accountingStartsOn: parseIsoDate('2026-09-11') },
        now,
      ),
    ).rejects.toThrow(BadRequestException);
    expect(club.accountingStartsOn).toBeNull();
  });

  it('updateSettings : accountingStartsOn omis reste inchangé, null l’efface', async () => {
    const now = parseIsoDate('2026-09-10');
    await svc.updateSettings(
      clubId,
      { fiscalYearStartDay: 1, accountingStartsOn: parseIsoDate('2026-01-01') },
      now,
    );
    await svc.updateSettings(clubId, { fiscalYearStartMonth: 9 }, now);
    expect(club.accountingStartsOn).not.toBeNull();
    await svc.updateSettings(clubId, { accountingStartsOn: null }, now);
    expect(club.accountingStartsOn).toBeNull();
  });

  it('updateSettings : la date de reprise ne change plus une fois un relevé déposé', async () => {
    const now = parseIsoDate('2026-09-10');
    club.accountingStartsOn = parseIsoDate('2026-09-01');
    statementCount = 1;
    await expect(
      svc.updateSettings(clubId, { accountingStartsOn: parseIsoDate('2026-08-01') }, now),
    ).rejects.toThrow(/relevé/);
    await expect(
      svc.updateSettings(clubId, { accountingStartsOn: null }, now),
    ).rejects.toThrow(/relevé/);
    expect(formatIsoDate(club.accountingStartsOn!)).toBe('2026-09-01');
    // Resoumettre la même date (formulaire) ou changer le début d'exercice reste permis.
    await svc.updateSettings(
      clubId,
      { fiscalYearStartMonth: 9, fiscalYearStartDay: 1, accountingStartsOn: parseIsoDate('2026-09-01') },
      now,
    );
    expect(club.fiscalYearStartMonth).toBe(9);
    // Sans relevé, la date reste libre.
    statementCount = 0;
    await svc.updateSettings(clubId, { accountingStartsOn: parseIsoDate('2026-08-01') }, now);
    expect(formatIsoDate(club.accountingStartsOn!)).toBe('2026-08-01');
  });

  it('setOpeningBalance refuse un compte d’un autre club', async () => {
    await expect(
      svc.setOpeningBalance(clubId, 'fa-other', 1000, parseIsoDate('2026-09-01')),
    ).rejects.toThrow(NotFoundException);
    expect(accounts[1].openingBalanceCents).toBeNull();
  });

  it('setOpeningBalance enregistre le solde (même négatif) et sa date', async () => {
    await svc.setOpeningBalance(clubId, 'fa-1', -2550, parseIsoDate('2026-09-01'));
    expect(accounts[0].openingBalanceCents).toBe(-2550);
    expect(formatIsoDate(accounts[0].openingBalanceOn!)).toBe('2026-09-01');
  });

  it('setOpeningBalance refuse un montant non entier', async () => {
    await expect(
      svc.setOpeningBalance(clubId, 'fa-1', 10.5, parseIsoDate('2026-09-01')),
    ).rejects.toThrow(BadRequestException);
  });
});
