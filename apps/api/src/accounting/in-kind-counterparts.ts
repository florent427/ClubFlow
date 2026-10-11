/**
 * Contributions volontaires en nature (classe 8, règlement ANC 2018-06).
 *
 * Une écriture en nature ne touche jamais la trésorerie : chaque emploi
 * (86x, au débit) a pour contrepartie la ressource correspondante (87x, au
 * crédit), du même montant. L'écriture est neutre sur le résultat et
 * n'apparaît qu'en pied du compte de résultat.
 *
 * Les articles saisis portent l'emploi ; les contreparties 87x se déduisent
 * des articles et ne se saisissent pas.
 */

/** Préfixe des comptes d'emploi (articles) d'une écriture en nature. */
export const IN_KIND_USE_PREFIX = '86';
/** Préfixe des comptes de ressource (contreparties calculées). */
export const IN_KIND_RESOURCE_PREFIX = '87';

/** Compte d'emploi par défaut d'un article en nature encore non catégorisé. */
export const IN_KIND_DEFAULT_USE_ACCOUNT = '860000';

/**
 * Ressource 87x qui équilibre un emploi 86x :
 *  - 864 Personnel bénévole       → 870 Bénévolat
 *  - 860 Secours en nature        → 875 Dons en nature
 *  - 861/862 et autres 86x        → 871 Prestations en nature
 */
export function inKindResourceAccountFor(useAccountCode: string): string {
  if (useAccountCode.startsWith('864')) return '870000';
  if (useAccountCode.startsWith('860')) return '875000';
  return '871000';
}

export function isInKindUseAccount(code: string): boolean {
  return code.startsWith(IN_KIND_USE_PREFIX);
}

export function isInKindResourceAccount(code: string): boolean {
  return code.startsWith(IN_KIND_RESOURCE_PREFIX);
}

/**
 * Contreparties d'une écriture en nature : une ligne de crédit par compte
 * de ressource, égale à la somme des emplois qui y mènent. Les lignes qui
 * ne sont pas des emplois 86x (contreparties existantes comprises) sont
 * ignorées : le résultat ne dépend que des articles.
 */
export function computeInKindCounterparts(
  lines: ReadonlyArray<{ accountCode: string; debitCents: number }>,
): Array<{ accountCode: string; creditCents: number }> {
  const totals = new Map<string, number>();
  for (const line of lines) {
    if (!isInKindUseAccount(line.accountCode)) continue;
    const resource = inKindResourceAccountFor(line.accountCode);
    totals.set(resource, (totals.get(resource) ?? 0) + line.debitCents);
  }
  return [...totals.entries()]
    .filter(([, cents]) => cents > 0)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([accountCode, creditCents]) => ({ accountCode, creditCents }));
}
