import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { parseIsoDate } from '../accounting/accounting-fiscal-year.service';
import { AccountingFiscalYearService } from '../accounting/accounting-fiscal-year.service';
import type { AccountingAuditService } from '../accounting/accounting-audit.service';
import type { AccountingPeriodService } from '../accounting/accounting-period.service';
import type { AccountingSeedService } from '../accounting/accounting-seed.service';
import type { ClubFinancialAccountsService } from '../accounting/club-financial-accounts.service';
import type { MediaAssetsService } from '../media/media-assets.service';
import type { ChequeDepositPdfService } from '../pdf/cheque-deposit-pdf.service';
import type { PrismaService } from '../prisma/prisma.service';
import { ChequeDepositsService } from './cheque-deposits.service';

/**
 * Ce que ces tests prouvent, et comment.
 *
 * Le double de Prisma tient des tables en mémoire et une VRAIE sémantique de
 * transaction : `$transaction` prend un instantané, et le restaure si le
 * callback lève. Une écriture faite hors transaction (via `prisma.x` au lieu
 * de `tx.x`) survivrait donc à un échec — c'est exactement la mutation que le
 * test « remise entière ou rien » détecte.
 */

type Cheque = {
  id: string;
  clubId: string;
  status: string;
  receivedOn: Date;
  amountCents: number;
  depositId: string | null;
};
type Deposit = {
  id: string;
  clubId: string;
  number: string;
  status: string;
  entryId: string | null;
  notes: string | null;
  slipAssetId: string | null;
  totalCents: number;
  chequeCount: number;
  depositedOn: Date;
  financialAccountId: string;
};
type Entry = {
  id: string;
  clubId: string;
  kind: string;
  source: string;
  amountCents: number;
  status: string;
  contraEntryId: string | null;
  financialAccountId: string | null;
  lines: Array<{ accountCode: string; side: string; debitCents: number; creditCents: number; sortOrder: number; accountLabel: string }>;
};

const CLUB = 'club-1';
const BANK = { id: 'fin-bank', kind: 'BANK', isActive: true, label: 'Banque principale', iban: null, bic: null, accountingAccount: { code: '512000', label: 'Banque' } };
const TRANSIT = { id: 'fin-cheques', kind: 'CHEQUE_TRANSIT', isActive: true, accountingAccount: { code: '511200', label: 'Chèques à encaisser' } };

function p2002() {
  return new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
    code: 'P2002',
    clientVersion: 'test',
  });
}

function makeWorld(opts: { staleFindMany?: Cheque[]; failNumberOnce?: boolean } = {}) {
  const state = {
    cheques: [] as Cheque[],
    deposits: [] as Deposit[],
    entries: [] as Entry[],
  };
  let seq = 0;
  let numberFailures = opts.failNumberOnce ? 1 : 0;

  const chequeOps = (s: typeof state) => ({
    findMany: jest.fn(async ({ where }: { where: { id?: { in: string[] }; depositId?: string } }) => {
      if (opts.staleFindMany) return opts.staleFindMany;
      return s.cheques.filter(
        (c) =>
          (!where.id || where.id.in.includes(c.id)) &&
          (!where.depositId || c.depositId === where.depositId),
      );
    }),
    updateMany: jest.fn(
      async ({
        where,
        data,
      }: {
        where: { id?: { in: string[] }; status?: string; depositId?: string };
        data: Partial<Cheque>;
      }) => {
        const hit = s.cheques.filter(
          (c) =>
            (!where.id || where.id.in.includes(c.id)) &&
            (!where.status || c.status === where.status) &&
            (!where.depositId || c.depositId === where.depositId),
        );
        hit.forEach((c) => Object.assign(c, data));
        return { count: hit.length };
      },
    ),
  });
  const depositOps = (s: typeof state) => ({
    findFirst: jest.fn(
      async ({
        where,
        orderBy,
      }: {
        where: { id?: string; number?: { startsWith: string } };
        orderBy?: { number: 'desc' };
      }) => {
        let rows = s.deposits.filter(
          (d) =>
            (!where.id || d.id === where.id) &&
            (!where.number || d.number.startsWith(where.number.startsWith)),
        );
        if (orderBy?.number === 'desc') rows = [...rows].sort((a, b) => (a.number < b.number ? 1 : -1));
        const d = rows[0];
        if (!d) return null;
        return {
          ...d,
          financialAccount: { ...BANK },
          slip: null,
          cheques: s.cheques.filter((c) => c.depositId === d.id).map((c) => ({ ...c, payment: null, deposit: { id: d.id, number: d.number }, image: null, number: null, drawerName: 'X', bankName: null, notes: null, createdAt: new Date() })),
        };
      },
    ),
    findMany: jest.fn(async () => s.deposits),
    create: jest.fn(async ({ data }: { data: Omit<Deposit, 'id'> }) => {
      if (numberFailures > 0) {
        numberFailures -= 1;
        throw p2002();
      }
      if (s.deposits.some((d) => d.number === data.number)) throw p2002();
      const row = { ...data, id: `dep-${++seq}` };
      s.deposits.push(row);
      return row;
    }),
    update: jest.fn(async ({ where, data }: { where: { id: string }; data: Partial<Deposit> }) => {
      const d = s.deposits.find((x) => x.id === where.id)!;
      Object.assign(d, data);
      return d;
    }),
  });
  const entryOps = (s: typeof state) => ({
    create: jest.fn(async ({ data }: { data: Omit<Entry, 'id' | 'lines'> }) => {
      const row = { ...data, id: `entry-${++seq}`, lines: [] as Entry['lines'] };
      s.entries.push(row);
      return row;
    }),
    findFirst: jest.fn(async ({ where }: { where: { id: string } }) =>
      s.entries.find((e) => e.id === where.id) ?? null,
    ),
    update: jest.fn(async ({ where, data }: { where: { id: string }; data: Partial<Entry> }) => {
      const e = s.entries.find((x) => x.id === where.id)!;
      Object.assign(e, data);
      return e;
    }),
  });
  const lineOps = (s: typeof state) => ({
    create: jest.fn(async ({ data }: { data: Entry['lines'][number] & { entryId: string } }) => {
      const e = s.entries.find((x) => x.id === data.entryId)!;
      e.lines.push(data);
      return data;
    }),
  });

  const bind = (s: typeof state) => ({
    cheque: chequeOps(s),
    chequeDeposit: depositOps(s),
    accountingEntry: entryOps(s),
    accountingEntryLine: lineOps(s),
  });

  // Sémantique de transaction FIDÈLE : le client `tx` travaille sur une COPIE
  // de la base, recopiée dans la base réelle seulement au commit. Une
  // écriture faite via `prisma.*` (hors transaction) touche la base réelle
  // tout de suite et survit à un échec — c'est ce que le test « remise
  // entière ou rien » doit voir. Un double qui restaurerait tout à l'échec
  // laisserait passer cette mutation.
  const clone = (s: typeof state): typeof state => ({
    cheques: s.cheques.map((c) => ({ ...c, receivedOn: new Date(c.receivedOn) })),
    deposits: s.deposits.map((d) => ({ ...d, depositedOn: new Date(d.depositedOn) })),
    entries: s.entries.map((e) => ({ ...e, lines: e.lines.map((l) => ({ ...l })) })),
  });
  const prisma = {
    ...bind(state),
    club: { findUnique: jest.fn(async () => ({ name: 'Club', siret: null })) },
    $transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) => {
      const work = clone(state);
      const result = await fn(bind(work));
      // COMMIT
      state.cheques.splice(0, state.cheques.length, ...work.cheques);
      state.deposits.splice(0, state.deposits.length, ...work.deposits);
      state.entries.splice(0, state.entries.length, ...work.entries);
      return result;
    }),
  } as unknown as PrismaService;

  const financialAccounts = {
    getById: jest.fn(async (_c: string, id: string) => {
      if (id === BANK.id) return BANK;
      if (id === 'fin-cash') return { ...BANK, id: 'fin-cash', kind: 'CASH' };
      throw new NotFoundException();
    }),
    getDefault: jest.fn(async (_c: string, kind: string) => (kind === 'CHEQUE_TRANSIT' ? TRANSIT : null)),
  } as unknown as ClubFinancialAccountsService;
  const seed = { seedIfEmpty: jest.fn(async () => ({})) } as unknown as AccountingSeedService;
  const period = { assertDateIsOpen: jest.fn(async () => undefined) } as unknown as AccountingPeriodService;
  const settings = { fiscalYearStartMonth: 9, fiscalYearStartDay: 1, accountingStartsOn: null };
  const fiscal = { getSettings: jest.fn(async () => settings) } as unknown as AccountingFiscalYearService;
  const audit = { log: jest.fn(async () => undefined) } as unknown as AccountingAuditService;
  const media = {
    uploadDocument: jest.fn(async () => ({ id: 'asset-slip' })),
    delete: jest.fn(async () => true),
  } as unknown as MediaAssetsService;
  const pdf = { build: jest.fn(async () => Buffer.from('%PDF')) } as unknown as ChequeDepositPdfService;

  const svc = new ChequeDepositsService(prisma, financialAccounts, seed, period, fiscal, audit, media, pdf);
  return { svc, state, prisma, media, pdf, audit };
}

function cheque(id: string, receivedOn: string, amountCents: number, status = 'PENDING'): Cheque {
  return { id, clubId: CLUB, status, receivedOn: parseIsoDate(receivedOn), amountCents, depositId: null };
}

describe('ChequeDepositsService.create', () => {
  it('une remise : écriture 512 / 511200 du total, chèques DEPOSITED, numéro R-<exercice>-0001', async () => {
    const { svc, state, media } = makeWorld();
    state.cheques.push(cheque('c1', '2026-09-02', 5000), cheque('c2', '2026-09-05', 2550));

    const out = await svc.create(CLUB, 'user-1', {
      financialAccountId: BANK.id,
      depositedOn: parseIsoDate('2026-09-10'),
      chequeIds: ['c1', 'c2'],
    });

    expect(out.number).toBe('R-2026-0001');
    expect(state.deposits).toHaveLength(1);
    expect(state.deposits[0].totalCents).toBe(7550);
    expect(state.cheques.every((c) => c.status === 'DEPOSITED' && c.depositId === state.deposits[0].id)).toBe(true);
    const entry = state.entries[0];
    expect(entry.kind).toBe('TRANSFER');
    expect(entry.source).toBe('CHEQUE_DEPOSIT');
    expect(entry.financialAccountId).toBe(BANK.id);
    expect(entry.lines).toEqual([
      expect.objectContaining({ accountCode: '512000', side: 'DEBIT', debitCents: 7550 }),
      expect.objectContaining({ accountCode: '511200', side: 'CREDIT', creditCents: 7550 }),
    ]);
    expect(media.uploadDocument).toHaveBeenCalledTimes(1);
    expect(state.deposits[0].slipAssetId).toBe('asset-slip');
  });

  it('numérote par exercice : une remise d’août 2026 tombe dans l’exercice 2025', async () => {
    const { svc, state } = makeWorld();
    state.cheques.push(cheque('c1', '2026-08-01', 100), cheque('c2', '2026-09-01', 100), cheque('c3', '2026-09-02', 100));
    const a = await svc.create(CLUB, 'u', { financialAccountId: BANK.id, depositedOn: parseIsoDate('2026-08-15'), chequeIds: ['c1'] });
    const b = await svc.create(CLUB, 'u', { financialAccountId: BANK.id, depositedOn: parseIsoDate('2026-09-03'), chequeIds: ['c2'] });
    const c = await svc.create(CLUB, 'u', { financialAccountId: BANK.id, depositedOn: parseIsoDate('2026-09-04'), chequeIds: ['c3'] });
    expect(a.number).toBe('R-2025-0001');
    expect(b.number).toBe('R-2026-0001');
    expect(c.number).toBe('R-2026-0002');
  });

  it('remise ENTIÈRE ou rien : un chèque remis entre-temps annule l’écriture et la remise', async () => {
    // La vérification lit une liste périmée (c2 encore PENDING) ; en base c2
    // est déjà remis. Le updateMany de la transaction ne touche que c1.
    const stale = [cheque('c1', '2026-09-02', 100), cheque('c2', '2026-09-02', 100)];
    const { svc, state } = makeWorld({ staleFindMany: stale });
    state.cheques.push(cheque('c1', '2026-09-02', 100), cheque('c2', '2026-09-02', 100, 'DEPOSITED'));

    await expect(
      svc.create(CLUB, 'u', { financialAccountId: BANK.id, depositedOn: parseIsoDate('2026-09-10'), chequeIds: ['c1', 'c2'] }),
    ).rejects.toThrow(BadRequestException);

    expect(state.deposits).toHaveLength(0);
    expect(state.entries).toHaveLength(0);
    expect(state.cheques.find((c) => c.id === 'c1')?.status).toBe('PENDING');
  });

  it('collision de numéro (P2002) : recalcule et réessaie', async () => {
    const { svc, state, prisma } = makeWorld({ failNumberOnce: true });
    state.cheques.push(cheque('c1', '2026-09-02', 100));
    const out = await svc.create(CLUB, 'u', { financialAccountId: BANK.id, depositedOn: parseIsoDate('2026-09-10'), chequeIds: ['c1'] });
    expect(out.number).toBe('R-2026-0001');
    expect((prisma as unknown as { $transaction: jest.Mock }).$transaction).toHaveBeenCalledTimes(2);
    expect(state.entries).toHaveLength(1);
  });

  it('refuse une caisse, un chèque inconnu, un chèque déjà remis, et une date antérieure à la réception', async () => {
    const { svc, state } = makeWorld();
    state.cheques.push(cheque('c1', '2026-09-08', 100), cheque('c2', '2026-09-02', 100, 'DEPOSITED'));
    await expect(svc.create(CLUB, 'u', { financialAccountId: 'fin-cash', depositedOn: parseIsoDate('2026-09-10'), chequeIds: ['c1'] })).rejects.toThrow(BadRequestException);
    await expect(svc.create(CLUB, 'u', { financialAccountId: BANK.id, depositedOn: parseIsoDate('2026-09-10'), chequeIds: ['nope'] })).rejects.toThrow(NotFoundException);
    await expect(svc.create(CLUB, 'u', { financialAccountId: BANK.id, depositedOn: parseIsoDate('2026-09-10'), chequeIds: ['c2'] })).rejects.toThrow(BadRequestException);
    await expect(svc.create(CLUB, 'u', { financialAccountId: BANK.id, depositedOn: parseIsoDate('2026-09-05'), chequeIds: ['c1'] })).rejects.toThrow(BadRequestException);
    expect(state.deposits).toHaveLength(0);
  });
});

describe('ChequeDepositsService.cancel', () => {
  it('contre-passe l’écriture, remet les chèques en portefeuille, passe la remise CANCELLED', async () => {
    const { svc, state } = makeWorld();
    state.cheques.push(cheque('c1', '2026-09-02', 100), cheque('c2', '2026-09-02', 200));
    const dep = await svc.create(CLUB, 'u', { financialAccountId: BANK.id, depositedOn: parseIsoDate('2026-09-10'), chequeIds: ['c1', 'c2'] });

    await svc.cancel(CLUB, 'u', dep.id, 'erreur de compte', parseIsoDate('2026-09-11'));

    expect(state.deposits[0].status).toBe('CANCELLED');
    expect(state.cheques.every((c) => c.status === 'PENDING' && c.depositId === null)).toBe(true);
    const [original, contra] = state.entries;
    expect(original.status).toBe('CANCELLED');
    expect(original.contraEntryId).toBe(contra.id);
    expect(contra.lines).toEqual([
      expect.objectContaining({ accountCode: '512000', side: 'CREDIT', creditCents: 300 }),
      expect.objectContaining({ accountCode: '511200', side: 'DEBIT', debitCents: 300 }),
    ]);
  });

  it('refuse d’annuler une remise rapprochée ou déjà annulée', async () => {
    const { svc, state } = makeWorld();
    state.cheques.push(cheque('c1', '2026-09-02', 100));
    const dep = await svc.create(CLUB, 'u', { financialAccountId: BANK.id, depositedOn: parseIsoDate('2026-09-10'), chequeIds: ['c1'] });
    state.deposits[0].status = 'RECONCILED';
    await expect(svc.cancel(CLUB, 'u', dep.id, 'x')).rejects.toThrow(BadRequestException);
    state.deposits[0].status = 'CANCELLED';
    await expect(svc.cancel(CLUB, 'u', dep.id, 'x')).rejects.toThrow(BadRequestException);
  });
});
