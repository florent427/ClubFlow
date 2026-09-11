import { BadRequestException } from '@nestjs/common';
import type { MediaAssetsService } from '../../media/media-assets.service';
import type { PrismaService } from '../../prisma/prisma.service';
import type { AccountingAuditService } from '../accounting-audit.service';
import type { AccountingFiscalYearService } from '../accounting-fiscal-year.service';
import { parseIsoDate } from '../accounting-fiscal-year.service';
import type { ClubFinancialAccountsService } from '../club-financial-accounts.service';
import type { BankReconciliationService } from './bank-reconciliation.service';
import { BankStatementService } from './bank-statement.service';

/**
 * Import d'un relevé (ADR-0014 §1 et §4). Le double Prisma tient les
 * relevés et leurs lignes en mémoire ; les tests lisent l'état persisté et
 * vérifient que READY n'est atteint que par le contrôle d'intégrité.
 */
const CLUB = 'club-1';
const FIN = 'fin-bank';

const OFX = (lines: Array<[string, string, string]>, closing: string) =>
  [
    'OFXHEADER:100',
    'DATA:OFXSGML',
    '',
    '<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS><CURDEF>EUR',
    '<BANKTRANLIST>',
    ...lines.map(
      ([d, amt, name], i) =>
        `<STMTTRN><TRNTYPE>OTHER<DTPOSTED>${d}<TRNAMT>${amt}<FITID>${i}<NAME>${name}</STMTTRN>`,
    ),
    '</BANKTRANLIST>',
    `<LEDGERBAL><BALAMT>${closing}<DTASOF>20260930</LEDGERBAL>`,
    '</STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>',
  ].join('\n');

const b64 = (s: string) => Buffer.from(s, 'latin1').toString('base64');

type Statement = {
  id: string;
  clubId: string;
  financialAccountId: string;
  status: string;
  periodStart: Date;
  periodEnd: Date;
  openingBalanceCents: number;
  closingBalanceCents: number;
  lineCount: number;
  integrityDeltaCents: number | null;
  chainOk: boolean | null;
  chainExpectedCents: number | null;
  previousStatementId: string | null;
  mediaAssetId: string | null;
  error: string | null;
};
type Line = { id: string; statementId: string; bookedOn: Date; amountCents: number; status: string; ignoreReason: string | null; label: string };

function makeWorld(opts: { accountingStartsOn?: string | null; openingBalanceCents?: number | null; existing?: Statement[] } = {}) {
  const state = {
    statements: [...(opts.existing ?? [])],
    lines: [] as Line[],
    account: {
      id: FIN,
      clubId: CLUB,
      kind: 'BANK',
      isActive: true,
      label: 'Banque principale',
      openingBalanceCents: opts.openingBalanceCents === undefined ? 123456 : opts.openingBalanceCents,
      csvMappingJson: null as unknown,
      accountingAccount: { code: '512000' },
    },
  };
  let seq = 0;
  const view = (s: Statement) => ({
    ...s,
    financialAccount: { id: FIN, label: 'Banque principale', accountingAccount: { code: '512000' }, openingBalanceCents: state.account.openingBalanceCents },
    mediaAsset: null,
    lines: state.lines
      .filter((l) => l.statementId === s.id)
      .map((l) => ({ ...l, matches: [] })),
    next: state.statements.filter((x) => x.previousStatementId === s.id).map((x) => ({ id: x.id })),
    _count: { lines: state.lines.filter((l) => l.statementId === s.id && l.status === 'MATCHED').length },
  });
  // Annoté explicitement : `$transaction` se rappelle lui-même.
  const prisma: Record<string, unknown> = {
    bankStatement: {
      findFirst: jest.fn(
        async ({
          where,
          orderBy,
        }: {
          where: { id?: string; financialAccountId?: string; periodStart?: { lte: Date }; periodEnd?: { gte?: Date; lt?: Date }; id_not?: unknown };
          orderBy?: { periodEnd: 'desc' };
        }) => {
          let rows = state.statements.filter(
            (s) =>
              s.clubId === CLUB &&
              (!where.id || s.id === where.id) &&
              (!where.financialAccountId || s.financialAccountId === where.financialAccountId) &&
              s.status !== 'FAILED' &&
              (!where.periodStart?.lte || s.periodStart <= where.periodStart.lte) &&
              (where.periodEnd?.gte === undefined || s.periodEnd >= where.periodEnd.gte) &&
              (where.periodEnd?.lt === undefined || s.periodEnd < where.periodEnd.lt),
          );
          if (orderBy?.periodEnd === 'desc') rows = [...rows].sort((a, b) => b.periodEnd.getTime() - a.periodEnd.getTime());
          return rows[0] ? view(rows[0]) : null;
        },
      ),
      create: jest.fn(async ({ data }: { data: Omit<Statement, 'id'> }) => {
        const s = { ...data, id: `st-${++seq}`, mediaAssetId: null };
        state.statements.push(s);
        return s;
      }),
      update: jest.fn(async ({ where, data }: { where: { id: string }; data: Partial<Statement> }) => {
        const s = state.statements.find((x) => x.id === where.id)!;
        Object.assign(s, data);
        return s;
      }),
      delete: jest.fn(async ({ where }: { where: { id: string } }) => {
        state.statements = state.statements.filter((s) => s.id !== where.id);
        state.lines = state.lines.filter((l) => l.statementId !== where.id);
        return {};
      }),
    },
    bankStatementLine: {
      createMany: jest.fn(async ({ data }: { data: Array<Omit<Line, 'id'>> }) => {
        for (const d of data) state.lines.push({ ...d, id: `l-${++seq}` });
        return { count: data.length };
      }),
    },
    clubFinancialAccount: {
      update: jest.fn(async ({ data }: { data: { csvMappingJson: unknown } }) => {
        state.account.csvMappingJson = data.csvMappingJson;
        return state.account;
      }),
    },
    $transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(prisma)),
  };
  const fiscal = {
    getSettings: jest.fn(async () => ({
      fiscalYearStartMonth: 9,
      fiscalYearStartDay: 1,
      accountingStartsOn:
        opts.accountingStartsOn === null ? null : parseIsoDate(opts.accountingStartsOn ?? '2026-09-01'),
    })),
  };
  const financialAccounts = { getById: jest.fn(async () => state.account) };
  const audit = { log: jest.fn(async () => undefined) };
  const media = { uploadDocument: jest.fn(async () => ({ id: 'asset-1' })), delete: jest.fn(async () => true) };
  const reconciliation = { autoMatch: jest.fn(async () => ({ matched: 0, suggested: 0, unmatched: 0 })) };
  const svc = new BankStatementService(
    prisma as unknown as PrismaService,
    financialAccounts as unknown as ClubFinancialAccountsService,
    fiscal as unknown as AccountingFiscalYearService,
    audit as unknown as AccountingAuditService,
    media as unknown as MediaAssetsService,
    reconciliation as unknown as BankReconciliationService,
  );
  return { svc, state, reconciliation, audit, media };
}

const GOOD = OFX(
  [
    ['20260901', '250.00', 'VIR SEPA DUPONT'],
    ['20260903', '-45.10', 'PRLV EDF'],
    ['20260910', '120.00', 'REMISE CHEQUES'],
  ],
  '1559.46',
); // début = 1559,46 − 324,90 = 1234,56

const importOfx = (svc: BankStatementService, content: string) =>
  svc.import(CLUB, 'user-1', { financialAccountId: FIN, format: 'OFX', fileName: 'releve.ofx', contentBase64: b64(content) });

describe('BankStatementService.import', () => {
  it('refuse tout import tant que la date de reprise n’est pas définie', async () => {
    const { svc, state } = makeWorld({ accountingStartsOn: null });
    await expect(importOfx(svc, GOOD)).rejects.toThrow(BadRequestException);
    expect(state.statements).toHaveLength(0);
  });

  it('OFX juste et chaîné sur le solde d’ouverture du compte : READY, lignes créées, rapprochement lancé, archive et audit', async () => {
    const { svc, state, reconciliation, media, audit } = makeWorld();
    const out = await importOfx(svc, GOOD);
    expect(out.status).toBe('READY');
    expect(state.statements[0]).toMatchObject({
      openingBalanceCents: 123456,
      closingBalanceCents: 155946,
      integrityDeltaCents: 0,
      chainOk: true,
      chainExpectedCents: 123456,
      lineCount: 3,
      mediaAssetId: 'asset-1',
    });
    expect(state.lines.map((l) => l.status)).toEqual(['UNMATCHED', 'UNMATCHED', 'UNMATCHED']);
    expect(reconciliation.autoMatch).toHaveBeenCalledWith(CLUB, state.statements[0].id);
    expect(media.uploadDocument).toHaveBeenCalledTimes(1);
    expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'STATEMENT_IMPORT' }));
  });

  it('solde d’ouverture du compte inconnu : chaînage indécidable, NEEDS_CHECK, pas de rapprochement', async () => {
    const { svc, state, reconciliation } = makeWorld({ openingBalanceCents: null });
    const out = await importOfx(svc, GOOD);
    expect(out.status).toBe('NEEDS_CHECK');
    expect(state.statements[0].chainOk).toBeNull();
    expect(reconciliation.autoMatch).not.toHaveBeenCalled();
  });

  it('une ligne manquante : delta non nul, NEEDS_CHECK', async () => {
    const { svc, state } = makeWorld();
    const out = await importOfx(
      svc,
      OFX([['20260901', '250.00', 'VIR'], ['20260910', '120.00', 'REMISE']], '1559.46'),
    );
    expect(out.status).toBe('NEEDS_CHECK');
    // début (fin − Σ) = 1189,46 ≠ solde d'ouverture 1234,56 : c'est le chaînage qui le dit.
    expect(state.statements[0].chainOk).toBe(false);
  });

  it('chaîné sur le relevé précédent : son solde de fin doit être le solde de début', async () => {
    const previous: Statement = {
      id: 'st-aout', clubId: CLUB, financialAccountId: FIN, status: 'RECONCILED',
      periodStart: parseIsoDate('2026-08-01'), periodEnd: parseIsoDate('2026-08-31'),
      openingBalanceCents: 100000, closingBalanceCents: 123456, lineCount: 1,
      integrityDeltaCents: 0, chainOk: true, chainExpectedCents: 100000, previousStatementId: null, mediaAssetId: null, error: null,
    };
    const { svc, state } = makeWorld({ existing: [previous], openingBalanceCents: 100000 });
    const out = await importOfx(svc, GOOD);
    expect(out.status).toBe('READY');
    expect(state.statements[1].previousStatementId).toBe('st-aout');

    const { svc: svc2, state: state2 } = makeWorld({ existing: [{ ...previous, closingBalanceCents: 999 }], openingBalanceCents: 100000 });
    const out2 = await importOfx(svc2, GOOD);
    expect(out2.status).toBe('NEEDS_CHECK');
    expect(state2.statements[1].chainOk).toBe(false);
  });

  it('refuse un relevé qui chevauche un relevé existant', async () => {
    const existing: Statement = {
      id: 'st-sept', clubId: CLUB, financialAccountId: FIN, status: 'READY',
      periodStart: parseIsoDate('2026-09-05'), periodEnd: parseIsoDate('2026-09-20'),
      openingBalanceCents: 0, closingBalanceCents: 0, lineCount: 0,
      integrityDeltaCents: 0, chainOk: true, chainExpectedCents: 0, previousStatementId: null, mediaAssetId: null, error: null,
    };
    const { svc, state } = makeWorld({ existing: [existing] });
    await expect(importOfx(svc, GOOD)).rejects.toThrow(/chevauche/);
    expect(state.statements).toHaveLength(1);
  });

  it('les lignes antérieures à la reprise sont ignorées « hors reprise », mais comptent dans l’arithmétique', async () => {
    const { svc, state } = makeWorld({ accountingStartsOn: '2026-09-02' });
    const out = await importOfx(svc, GOOD);
    expect(out.status).toBe('READY');
    expect(state.lines.map((l) => [l.status, l.ignoreReason])).toEqual([
      ['IGNORED', 'BEFORE_TAKEOVER'],
      ['UNMATCHED', null],
      ['UNMATCHED', null],
    ]);
    expect(state.statements[0].integrityDeltaCents).toBe(0);
  });

  it('CSV sans colonne solde : soldes requis, puis mapping mémorisé sur le compte', async () => {
    const csv = 'Date;Libellé;Montant\n01/09/2026;VIR SEPA DUPONT;250,00\n03/09/2026;PRLV EDF;-45,10\n10/09/2026;REMISE CHEQUES;120,00';
    const { svc, state } = makeWorld();
    const mapping = {
      delimiter: ';', hasHeader: true, dateCol: 0, labelCol: 1, amountCol: 2,
      debitCol: null, creditCol: null, balanceCol: null, valueDateCol: null, referenceCol: null,
      dateFormat: 'DMY' as const, decimalSeparator: ',' as const,
    };
    await expect(
      svc.import(CLUB, 'u', { financialAccountId: FIN, format: 'CSV', fileName: 'r.csv', contentBase64: b64(csv), csvMapping: mapping }),
    ).rejects.toThrow(/Soldes/);

    const out = await svc.import(CLUB, 'u', {
      financialAccountId: FIN, format: 'CSV', fileName: 'r.csv', contentBase64: b64(csv), csvMapping: mapping,
      openingBalanceCents: 123456, closingBalanceCents: 155946,
    });
    expect(out.status).toBe('READY');
    expect(state.account.csvMappingJson).toEqual(mapping);
  });
});

describe('BankStatementService.delete', () => {
  it('refuse de supprimer un relevé qui a des lignes rapprochées', async () => {
    const { svc, state } = makeWorld();
    await importOfx(svc, GOOD);
    state.lines[0].status = 'MATCHED';
    await expect(svc.delete(CLUB, 'u', state.statements[0].id)).rejects.toThrow(BadRequestException);
    expect(state.statements).toHaveLength(1);
  });

  it('supprime un relevé sans rapprochement et son fichier', async () => {
    const { svc, state, media } = makeWorld();
    await importOfx(svc, GOOD);
    await svc.delete(CLUB, 'u', state.statements[0].id);
    expect(state.statements).toHaveLength(0);
    expect(media.delete).toHaveBeenCalledWith(CLUB, 'asset-1');
  });
});
