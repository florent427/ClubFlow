/**
 * Formes communes aux lecteurs de relevés (OFX, CSV, PDF au lot 2). Un
 * lecteur rend des lignes triées par date croissante et, quand le fichier
 * les porte, les soldes de début et de fin. `amountCents` est SIGNÉ :
 * positif = crédit pour le club, négatif = débit.
 */
export interface ParsedStatementLine {
  bookedOn: Date;
  valueOn: Date | null;
  label: string;
  rawLabel: string;
  reference: string | null;
  amountCents: number;
  balanceAfterCents: number | null;
  fitId: string | null;
}

export interface ParsedStatement {
  lines: ParsedStatementLine[];
  openingBalanceCents: number | null;
  closingBalanceCents: number | null;
  periodStart: Date | null;
  periodEnd: Date | null;
  /** Identifiant de compte porté par le fichier (IBAN ou n° de compte). */
  accountId: string | null;
  currency: string | null;
  warnings: string[];
}

/**
 * Décode un fichier texte de banque. UTF-8 avec BOM, UTF-8 strict, sinon
 * Windows-1252 — le format historique des exports bancaires français.
 * `hint` : en-tête OFX `CHARSET:1252`, quand il existe.
 */
export function decodeStatementText(
  buffer: Buffer,
  hint?: string | null,
): { text: string; encoding: 'utf-8' | 'windows-1252' } {
  if (
    buffer.length >= 3 &&
    buffer[0] === 0xef &&
    buffer[1] === 0xbb &&
    buffer[2] === 0xbf
  ) {
    return { text: buffer.subarray(3).toString('utf8'), encoding: 'utf-8' };
  }
  if (hint && /1252|latin|8859/i.test(hint)) {
    return {
      text: new TextDecoder('windows-1252').decode(buffer),
      encoding: 'windows-1252',
    };
  }
  try {
    return {
      text: new TextDecoder('utf-8', { fatal: true }).decode(buffer),
      encoding: 'utf-8',
    };
  } catch {
    return {
      text: new TextDecoder('windows-1252').decode(buffer),
      encoding: 'windows-1252',
    };
  }
}

export function utcDate(year: number, month: number, day: number): Date | null {
  const d = new Date(Date.UTC(year, month - 1, day));
  if (
    d.getUTCFullYear() !== year ||
    d.getUTCMonth() !== month - 1 ||
    d.getUTCDate() !== day
  ) {
    return null;
  }
  return d;
}

/** Tri stable par date croissante : à date égale, l'ordre du fichier. */
export function sortByDateStable<T extends { bookedOn: Date }>(lines: T[]): T[] {
  return lines
    .map((l, i) => ({ l, i }))
    .sort(
      (a, b) =>
        a.l.bookedOn.getTime() - b.l.bookedOn.getTime() || a.i - b.i,
    )
    .map((x) => x.l);
}
