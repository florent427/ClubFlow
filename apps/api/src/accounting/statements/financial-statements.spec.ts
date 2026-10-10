import {
  buildFinancialStatements,
  type BuildStatementsInput,
  type StatementSourceLine,
} from './financial-statements';

/**
 * Bilan et compte de résultat provisoires. Ce qui est vérifié : le résultat
 * de l'exercice se lit sur les classes 6 et 7 de l'exercice seulement, le
 * bilan s'équilibre de lui-même quand les données sont complètes, un solde
 * d'ouverture sans contrepartie se voit comme un écart, les comptes de tiers
 * et de trésorerie changent de côté avec leur solde, et les contributions
 * en nature restent hors résultat et hors bilan.
 */

const at = (iso: string) => new Date(iso.length === 10 ? `${iso}T00:00:00.000Z` : iso);

/** Une écriture équilibrée à deux lignes : `debit` au débit, `credit` au crédit. */
function entry(
  on: string,
  debit: string,
  credit: string,
  cents: number,
): StatementSourceLine[] {
  return [
    { accountCode: debit, accountLabel: `snap ${debit}`, debitCents: cents, creditCents: 0, occurredAt: at(on) },
    { accountCode: credit, accountLabel: `snap ${credit}`, debitCents: 0, creditCents: cents, occurredAt: at(on) },
  ];
}

function build(over: Partial<BuildStatementsInput> & { lines: StatementSourceLine[] }) {
  return buildFinancialStatements({
    fiscalYearStartsOn: at('2026-09-01'),
    asOf: at('2026-10-10'),
    openings: [],
    accountLabels: new Map(),
    ...over,
  });
}

function section<T extends { key: string }>(list: T[], key: string): T | undefined {
  return list.find((s) => s.key === key);
}

describe('buildFinancialStatements', () => {
  it('range cotisations et achats au résultat, et le bilan tombe juste', () => {
    const r = build({
      lines: [
        ...entry('2026-09-05', '512000', '756000', 100_000),
        ...entry('2026-09-20', '606400', '512000', 30_000),
      ],
    });

    expect(r.incomeStatement.totalRevenuesCents).toBe(100_000);
    expect(r.incomeStatement.totalExpensesCents).toBe(30_000);
    expect(r.incomeStatement.resultCents).toBe(70_000);
    expect(section(r.incomeStatement.revenues, '75')?.label).toMatch(/Cotisations/);
    expect(section(r.incomeStatement.expenses, '60')?.lines).toEqual([
      { accountCode: '606400', label: 'snap 606400', amountCents: 30_000 },
    ]);

    expect(section(r.balanceSheet.assets, 'disponibilites')?.totalCents).toBe(70_000);
    expect(section(r.balanceSheet.liabilities, 'resultat')?.totalCents).toBe(70_000);
    expect(r.balanceSheet.totalAssetsCents).toBe(70_000);
    expect(r.balanceSheet.imbalanceCents).toBe(0);
  });

  it('un déficit apparaît en négatif au passif, sans déséquilibrer', () => {
    const r = build({
      lines: [
        ...entry('2026-09-05', '512000', '102000', 50_000),
        ...entry('2026-09-06', '613200', '512000', 80_000),
      ],
    });
    expect(r.incomeStatement.resultCents).toBe(-80_000);
    expect(section(r.balanceSheet.liabilities, 'resultat')?.totalCents).toBe(-80_000);
    // 512 à −30 000 : découvert, donc une dette et non un actif négatif.
    expect(section(r.balanceSheet.assets, 'disponibilites')).toBeUndefined();
    expect(section(r.balanceSheet.liabilities, 'dettes')?.lines).toEqual([
      { accountCode: '512000', label: 'snap 512000', amountCents: 30_000 },
    ]);
    expect(r.balanceSheet.imbalanceCents).toBe(0);
  });

  it('le résultat d’un exercice passé reste au passif, hors du résultat de l’exercice', () => {
    const r = build({
      lines: [
        ...entry('2026-03-01', '512000', '756000', 40_000),
        ...entry('2026-09-10', '512000', '740000', 10_000),
      ],
    });
    expect(r.incomeStatement.totalRevenuesCents).toBe(10_000);
    const report = section(r.balanceSheet.liabilities, 'report');
    expect(report?.totalCents).toBe(40_000);
    expect(report?.lines[0].accountCode).toBe('');
    expect(r.balanceSheet.totalAssetsCents).toBe(50_000);
    expect(r.balanceSheet.imbalanceCents).toBe(0);
  });

  it('compte la journée d’arrêté entière et ignore le lendemain', () => {
    const r = build({
      lines: [
        ...entry('2026-10-10T18:30:00.000Z', '512000', '706000', 5_000),
        ...entry('2026-10-11T00:00:00.000Z', '512000', '706000', 7_000),
      ],
    });
    expect(r.incomeStatement.totalRevenuesCents).toBe(5_000);
    expect(r.balanceSheet.totalAssetsCents).toBe(5_000);
  });

  it('un solde d’ouverture sans contrepartie se voit comme un écart', () => {
    const r = build({
      openings: [{ accountCode: '512000', cents: 250_000, on: at('2026-09-01') }],
      lines: [
        // Antérieure à l'ouverture : déjà dans les 250 000 côté banque.
        ...entry('2026-08-15', '512000', '756000', 20_000),
        ...entry('2026-09-03', '512000', '756000', 10_000),
      ],
    });
    expect(section(r.balanceSheet.assets, 'disponibilites')?.totalCents).toBe(260_000);
    // Passif : 20 000 de résultat antérieur + 10 000 de l'exercice.
    expect(r.balanceSheet.totalLiabilitiesCents).toBe(30_000);
    expect(r.balanceSheet.imbalanceCents).toBe(230_000);
  });

  it('les à-nouveaux passés en fonds associatifs rétablissent l’équilibre', () => {
    const r = build({
      openings: [{ accountCode: '512000', cents: 250_000, on: at('2026-09-01') }],
      lines: [
        // Contrepartie de l'ouverture : la banque est déjà comptée par le
        // solde d'ouverture, seule la ligne en 102 compte.
        ...entry('2026-09-01', '512000', '102000', 250_000).slice(1),
        ...entry('2026-09-03', '512000', '756000', 10_000),
      ],
    });
    expect(section(r.balanceSheet.liabilities, 'fonds_propres')?.totalCents).toBe(250_000);
    expect(r.balanceSheet.imbalanceCents).toBe(0);
  });

  it('une ouverture datée après l’arrêté ne s’applique pas encore', () => {
    const r = build({
      openings: [{ accountCode: '512000', cents: 999_999, on: at('2026-10-11') }],
      lines: entry('2026-09-03', '512000', '756000', 10_000),
    });
    expect(r.balanceSheet.totalAssetsCents).toBe(10_000);
    expect(r.balanceSheet.imbalanceCents).toBe(0);
  });

  it('range les tiers selon le sens de leur solde', () => {
    const r = build({
      lines: [
        ...entry('2026-09-02', '411000', '756000', 12_000), // adhérent débiteur
        ...entry('2026-09-03', '512000', '419000', 3_000), // avance reçue
        ...entry('2026-09-04', '606000', '401000', 4_000), // fournisseur à payer
      ],
    });
    expect(section(r.balanceSheet.assets, 'creances')?.totalCents).toBe(12_000);
    const dettes = section(r.balanceSheet.liabilities, 'dettes');
    expect(dettes?.lines.map((l) => [l.accountCode, l.amountCents])).toEqual([
      ['401000', 4_000],
      ['419000', 3_000],
    ]);
    expect(r.balanceSheet.imbalanceCents).toBe(0);
  });

  it('les contributions en nature restent hors résultat et hors bilan', () => {
    const r = build({
      lines: [
        ...entry('2026-09-05', '864000', '870000', 60_000),
        ...entry('2026-09-05', '512000', '756000', 1_000),
      ],
    });
    expect(r.incomeStatement.resultCents).toBe(1_000);
    expect(r.incomeStatement.totalInKindUsesCents).toBe(60_000);
    expect(r.incomeStatement.totalInKindContributionsCents).toBe(60_000);
    expect(r.incomeStatement.inKindContributions[0].accountCode).toBe('870000');
    expect(r.balanceSheet.totalAssetsCents).toBe(1_000);
    expect(r.unclassified).toEqual([]);
  });

  it('signale un compte qui ne se range nulle part', () => {
    const r = build({ lines: entry('2026-09-05', '512000', '900000', 1_000) });
    expect(r.unclassified).toEqual([
      { accountCode: '900000', label: 'snap 900000', amountCents: -1_000 },
    ]);
    expect(r.balanceSheet.imbalanceCents).toBe(1_000);
  });

  it('préfère le libellé du plan du club à celui figé sur la ligne', () => {
    const r = build({
      accountLabels: new Map([['756000', 'Cotisations des adhérents']]),
      lines: entry('2026-09-05', '512000', '756000', 1_000),
    });
    expect(section(r.incomeStatement.revenues, '75')?.lines[0].label).toBe(
      'Cotisations des adhérents',
    );
  });

  it('n’affiche pas un compte soldé', () => {
    const r = build({
      lines: [
        ...entry('2026-09-05', '411000', '756000', 1_000),
        ...entry('2026-09-06', '512000', '411000', 1_000),
      ],
    });
    expect(section(r.balanceSheet.assets, 'creances')).toBeUndefined();
  });
});
