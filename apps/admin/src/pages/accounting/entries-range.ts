/**
 * Préréglages de période de la page Comptabilité. Bornes en ISO, `from`
 * inclus et `to` exclu, comme l'API les lit.
 */
export type Period = 'ALL' | 'MONTH' | 'YEAR' | 'FISCAL' | 'CUSTOM';

/** Exercice en cours tel que le rend `clubAccountingFiscalSettings`. */
export type CurrentFiscalYear = {
  /** « YYYY-MM-DD », premier jour. */
  startsOn: string;
  /** « YYYY-MM-DD », dernier jour inclus. */
  endsOn: string;
};

const ONE_DAY_MS = 24 * 3600 * 1000;

function dayStart(isoDate: string): Date {
  return new Date(isoDate + 'T00:00:00Z');
}

function dayAfter(isoDate: string): Date {
  return new Date(dayStart(isoDate).getTime() + ONE_DAY_MS);
}

export function computeRange(
  period: Period,
  customFrom: string,
  customTo: string,
  fiscalYear: CurrentFiscalYear | null,
  now: Date = new Date(),
): { from: string | null; to: string | null } {
  if (period === 'MONTH') {
    const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const to = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
    return { from: from.toISOString(), to: to.toISOString() };
  }
  if (period === 'YEAR') {
    const from = new Date(Date.UTC(now.getUTCFullYear(), 0, 1));
    const to = new Date(Date.UTC(now.getUTCFullYear() + 1, 0, 1));
    return { from: from.toISOString(), to: to.toISOString() };
  }
  if (period === 'FISCAL' && fiscalYear) {
    // L'exercice du club (SKSR : du 1er septembre au 31 août), pas l'année
    // civile. Tant que les réglages ne sont pas chargés, aucune borne.
    return {
      from: dayStart(fiscalYear.startsOn).toISOString(),
      to: dayAfter(fiscalYear.endsOn).toISOString(),
    };
  }
  if (period === 'CUSTOM') {
    return {
      from: customFrom ? dayStart(customFrom).toISOString() : null,
      to: customTo ? dayAfter(customTo).toISOString() : null,
    };
  }
  return { from: null, to: null };
}
