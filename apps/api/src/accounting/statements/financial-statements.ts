/**
 * Bilan et compte de résultat provisoires, calculés à partir des lignes
 * d'écriture en partie double (plan comptable associatif, ANC 2018-06).
 *
 * Ce module est pur : il ne lit pas la base. Le service lui passe les lignes
 * comptées (POSTED ou LOCKED, non annulées) jusqu'à la date demandée, les
 * soldes d'ouverture des comptes financiers et les libellés du plan du club.
 *
 * Pourquoi le bilan tombe juste quand les données sont complètes : chaque
 * écriture est équilibrée, donc la somme des soldes des classes 1 à 7 est
 * nulle. En rangeant les classes 6 et 7 dans le résultat (de l'exercice ou
 * des exercices antérieurs), l'actif égale le passif par construction. Un
 * écart ne vient que de ce qui n'est pas une écriture : un solde d'ouverture
 * saisi sur un compte bancaire sans contrepartie en fonds associatifs.
 */

export interface StatementSourceLine {
  accountCode: string;
  accountLabel: string;
  debitCents: number;
  creditCents: number;
  occurredAt: Date;
}

export interface StatementOpeningBalance {
  accountCode: string;
  cents: number;
  /** Solde au matin de ce jour : les lignes antérieures sont ignorées. */
  on: Date;
}

export interface StatementLine {
  accountCode: string;
  label: string;
  amountCents: number;
}

export interface StatementSection {
  key: string;
  label: string;
  totalCents: number;
  lines: StatementLine[];
}

export interface IncomeStatement {
  expenses: StatementSection[];
  revenues: StatementSection[];
  totalExpensesCents: number;
  totalRevenuesCents: number;
  /** Produits − charges : positif = excédent, négatif = déficit. */
  resultCents: number;
  /** Comptes 86 : emplois des contributions volontaires en nature. */
  inKindUses: StatementLine[];
  /** Comptes 87 : contributions volontaires en nature reçues. */
  inKindContributions: StatementLine[];
  totalInKindUsesCents: number;
  totalInKindContributionsCents: number;
}

export interface BalanceSheet {
  assets: StatementSection[];
  liabilities: StatementSection[];
  totalAssetsCents: number;
  totalLiabilitiesCents: number;
  /** Actif − passif. Zéro quand les à-nouveaux sont complets. */
  imbalanceCents: number;
}

export interface FinancialStatements {
  incomeStatement: IncomeStatement;
  balanceSheet: BalanceSheet;
  /** Comptes dont le code ne se range ni au bilan ni au résultat. */
  unclassified: StatementLine[];
}

export interface BuildStatementsInput {
  /** Premier jour de l'exercice, minuit UTC. */
  fiscalYearStartsOn: Date;
  /** Date d'arrêté, minuit UTC (incluse). */
  asOf: Date;
  lines: StatementSourceLine[];
  openings: StatementOpeningBalance[];
  /** Libellés du plan du club, par code. */
  accountLabels: Map<string, string>;
}

const ONE_DAY_MS = 86_400_000;

const EXPENSE_GROUPS: Record<string, string> = {
  '60': 'Achats',
  '61': 'Services extérieurs',
  '62': 'Autres services extérieurs',
  '63': 'Impôts et taxes',
  '64': 'Charges de personnel',
  '65': 'Autres charges de gestion courante',
  '66': 'Charges financières',
  '67': 'Charges exceptionnelles',
  '68': 'Dotations aux amortissements, dépréciations et provisions',
  '69': 'Impôts sur les bénéfices',
};

const REVENUE_GROUPS: Record<string, string> = {
  '70': 'Ventes de biens et prestations de services',
  '71': 'Production stockée',
  '72': 'Production immobilisée',
  '73': 'Dotations et produits de tarification',
  '74': 'Subventions d’exploitation',
  '75': 'Cotisations, dons et autres produits de gestion courante',
  '76': 'Produits financiers',
  '77': 'Produits exceptionnels',
  '78': 'Reprises sur amortissements, dépréciations et provisions',
  '79': 'Transferts de charges',
};

type AssetKey = 'immobilisations' | 'stocks' | 'creances' | 'disponibilites';
type LiabilityKey =
  | 'fonds_propres'
  | 'report'
  | 'resultat'
  | 'provisions'
  | 'fonds_dedies'
  | 'emprunts'
  | 'dettes';

const ASSET_SECTIONS: Array<[AssetKey, string]> = [
  ['immobilisations', 'Actif immobilisé'],
  ['stocks', 'Stocks'],
  ['creances', 'Créances'],
  ['disponibilites', 'Disponibilités'],
];

const LIABILITY_SECTIONS: Array<[LiabilityKey, string]> = [
  ['fonds_propres', 'Fonds associatifs'],
  ['report', 'Report à nouveau et résultats antérieurs'],
  ['resultat', 'Résultat de l’exercice (provisoire)'],
  ['provisions', 'Provisions'],
  ['fonds_dedies', 'Fonds dédiés'],
  ['emprunts', 'Emprunts et dettes financières'],
  ['dettes', 'Dettes'],
];

/** Code ramené à ses seuls chiffres ; null s'il n'en commence pas par un. */
function normalizeCode(code: string): string | null {
  const c = code.trim();
  return /^\d/.test(c) ? c : null;
}

/**
 * Où un compte se range au bilan, selon son code et le sens de son solde
 * (`debitBalance` = débit − crédit). Les comptes de tiers et de trésorerie
 * changent de côté avec leur solde : un 512 créditeur est un découvert, un
 * 411 créditeur une avance reçue.
 */
function balanceSheetPlace(
  code: string,
  debitBalance: number,
): { side: 'asset'; key: AssetKey } | { side: 'liability'; key: LiabilityKey } | null {
  const cls = code[0];
  const two = code.slice(0, 2);
  switch (cls) {
    case '1':
      if (two === '11' || two === '12') return { side: 'liability', key: 'report' };
      if (two === '15') return { side: 'liability', key: 'provisions' };
      if (two === '19') return { side: 'liability', key: 'fonds_dedies' };
      if (two === '16' || two === '17' || two === '18') {
        return { side: 'liability', key: 'emprunts' };
      }
      return { side: 'liability', key: 'fonds_propres' };
    case '2':
      return { side: 'asset', key: 'immobilisations' };
    case '3':
      return { side: 'asset', key: 'stocks' };
    case '4':
      return debitBalance >= 0
        ? { side: 'asset', key: 'creances' }
        : { side: 'liability', key: 'dettes' };
    case '5':
      return debitBalance >= 0
        ? { side: 'asset', key: 'disponibilites' }
        : { side: 'liability', key: 'dettes' };
    default:
      return null;
  }
}

function sortLines(lines: StatementLine[]): StatementLine[] {
  return lines.sort((a, b) => a.accountCode.localeCompare(b.accountCode));
}

function sum(lines: StatementLine[]): number {
  return lines.reduce((acc, l) => acc + l.amountCents, 0);
}

export function buildFinancialStatements(input: BuildStatementsInput): FinancialStatements {
  const asOfEnd = input.asOf.getTime() + ONE_DAY_MS;
  const yearStart = input.fiscalYearStartsOn.getTime();

  // Un compte financier peut porter un solde d'ouverture : les lignes
  // antérieures à sa date sont alors déjà contenues dans ce solde. Une
  // ouverture postérieure à la date d'arrêté ne s'applique pas encore.
  const openingByCode = new Map<string, { cents: number; on: number }>();
  for (const o of input.openings) {
    const code = normalizeCode(o.accountCode);
    if (!code || o.on.getTime() >= asOfEnd) continue;
    const prev = openingByCode.get(code);
    openingByCode.set(code, {
      cents: (prev?.cents ?? 0) + o.cents,
      on: Math.min(prev?.on ?? Infinity, o.on.getTime()),
    });
  }

  // Soldes débiteurs (débit − crédit) : cumulés pour le bilan, de
  // l'exercice pour le résultat, antérieurs pour le report.
  const cumulative = new Map<string, number>();
  const currentYear = new Map<string, number>();
  let priorResult = 0;
  const lineLabels = new Map<string, string>();

  for (const [code, o] of openingByCode) cumulative.set(code, o.cents);

  for (const l of input.lines) {
    const code = normalizeCode(l.accountCode);
    const t = l.occurredAt.getTime();
    if (t >= asOfEnd) continue;
    const key = code ?? l.accountCode.trim();
    lineLabels.set(key, l.accountLabel);
    const opening = code ? openingByCode.get(code) : undefined;
    if (opening && t < opening.on) continue;
    const delta = l.debitCents - l.creditCents;
    const cls = code?.[0];
    if (cls === '6' || cls === '7' || code?.startsWith('86') || code?.startsWith('87')) {
      if (t >= yearStart) {
        currentYear.set(key, (currentYear.get(key) ?? 0) + delta);
      } else if (cls === '6' || cls === '7') {
        // Le résultat d'un exercice passé non soldé en classe 1 reste au
        // passif : sans lui le bilan ne s'équilibrerait jamais.
        priorResult -= delta;
      }
      continue;
    }
    cumulative.set(key, (cumulative.get(key) ?? 0) + delta);
  }

  const labelOf = (code: string) =>
    input.accountLabels.get(code) ?? lineLabels.get(code) ?? code;

  // --- Compte de résultat ------------------------------------------------
  const expenseGroups = new Map<string, StatementLine[]>();
  const revenueGroups = new Map<string, StatementLine[]>();
  const inKindUses: StatementLine[] = [];
  const inKindContributions: StatementLine[] = [];

  for (const [code, debitBalance] of currentYear) {
    if (debitBalance === 0) continue;
    const label = labelOf(code);
    if (code.startsWith('86')) {
      inKindUses.push({ accountCode: code, label, amountCents: debitBalance });
    } else if (code.startsWith('87')) {
      inKindContributions.push({ accountCode: code, label, amountCents: -debitBalance });
    } else if (code[0] === '6') {
      const g = code.slice(0, 2);
      const list = expenseGroups.get(g) ?? [];
      list.push({ accountCode: code, label, amountCents: debitBalance });
      expenseGroups.set(g, list);
    } else {
      const g = code.slice(0, 2);
      const list = revenueGroups.get(g) ?? [];
      list.push({ accountCode: code, label, amountCents: -debitBalance });
      revenueGroups.set(g, list);
    }
  }

  const toSections = (
    groups: Map<string, StatementLine[]>,
    labels: Record<string, string>,
    fallback: string,
  ): StatementSection[] =>
    [...groups.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([g, lines]) => ({
        key: g,
        label: labels[g] ?? fallback,
        totalCents: sum(lines),
        lines: sortLines(lines),
      }));

  const expenses = toSections(expenseGroups, EXPENSE_GROUPS, 'Autres charges');
  const revenues = toSections(revenueGroups, REVENUE_GROUPS, 'Autres produits');
  const totalExpensesCents = expenses.reduce((a, s) => a + s.totalCents, 0);
  const totalRevenuesCents = revenues.reduce((a, s) => a + s.totalCents, 0);
  const resultCents = totalRevenuesCents - totalExpensesCents;

  const incomeStatement: IncomeStatement = {
    expenses,
    revenues,
    totalExpensesCents,
    totalRevenuesCents,
    resultCents,
    inKindUses: sortLines(inKindUses),
    inKindContributions: sortLines(inKindContributions),
    totalInKindUsesCents: sum(inKindUses),
    totalInKindContributionsCents: sum(inKindContributions),
  };

  // --- Bilan ---------------------------------------------------------------
  const assetLines = new Map<AssetKey, StatementLine[]>();
  const liabilityLines = new Map<LiabilityKey, StatementLine[]>();
  const unclassified: StatementLine[] = [];

  for (const [code, debitBalance] of cumulative) {
    if (debitBalance === 0) continue;
    const place = /^\d/.test(code) ? balanceSheetPlace(code, debitBalance) : null;
    const label = labelOf(code);
    if (!place) {
      unclassified.push({ accountCode: code, label, amountCents: debitBalance });
      continue;
    }
    if (place.side === 'asset') {
      const list = assetLines.get(place.key) ?? [];
      list.push({ accountCode: code, label, amountCents: debitBalance });
      assetLines.set(place.key, list);
    } else {
      const list = liabilityLines.get(place.key) ?? [];
      list.push({ accountCode: code, label, amountCents: -debitBalance });
      liabilityLines.set(place.key, list);
    }
  }

  if (priorResult !== 0) {
    const list = liabilityLines.get('report') ?? [];
    list.push({
      accountCode: '',
      label: 'Résultats des exercices antérieurs non affectés',
      amountCents: priorResult,
    });
    liabilityLines.set('report', list);
  }
  if (resultCents !== 0) {
    liabilityLines.set('resultat', [
      { accountCode: '', label: 'Excédent ou déficit de l’exercice en cours', amountCents: resultCents },
    ]);
  }

  const assets: StatementSection[] = ASSET_SECTIONS.filter(([k]) => assetLines.has(k)).map(
    ([key, label]) => {
      const lines = sortLines(assetLines.get(key)!);
      return { key, label, totalCents: sum(lines), lines };
    },
  );
  const liabilities: StatementSection[] = LIABILITY_SECTIONS.filter(([k]) =>
    liabilityLines.has(k),
  ).map(([key, label]) => {
    const raw = liabilityLines.get(key)!;
    // Les lignes calculées (sans code) restent en fin de section.
    const lines = [
      ...sortLines(raw.filter((l) => l.accountCode !== '')),
      ...raw.filter((l) => l.accountCode === ''),
    ];
    return { key, label, totalCents: sum(lines), lines };
  });

  const totalAssetsCents = assets.reduce((a, s) => a + s.totalCents, 0);
  const totalLiabilitiesCents = liabilities.reduce((a, s) => a + s.totalCents, 0);

  return {
    incomeStatement,
    balanceSheet: {
      assets,
      liabilities,
      totalAssetsCents,
      totalLiabilitiesCents,
      imbalanceCents: totalAssetsCents - totalLiabilitiesCents,
    },
    unclassified: sortLines(unclassified),
  };
}
