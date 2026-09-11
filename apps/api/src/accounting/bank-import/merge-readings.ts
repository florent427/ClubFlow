/**
 * Fusion de deux lectures indépendantes d'un même relevé (ADR-0014 §3).
 *
 * Deux modèles lisent le PDF ; on apparie leurs lignes et on garde tout :
 * une ligne vue par les deux est « d'accord », une ligne vue d'un seul
 * côté ou avec un montant ou une date différents est incluse mais marquée
 * divergente, avec les deux versions. C'est ensuite le contrôle
 * arithmétique qui juge (`statement-integrity.ts`), pas l'accord des
 * modèles : deux modèles peuvent se tromper ensemble.
 */

export interface ReadLine {
  /** YYYY-MM-DD */
  bookedOn: string;
  valueOn: string | null;
  label: string;
  /** Signé : + crédit, − débit. */
  amountCents: number;
  balanceAfterCents: number | null;
}

export interface StatementReading {
  iban: string | null;
  periodStart: string | null;
  periodEnd: string | null;
  openingBalanceCents: number | null;
  closingBalanceCents: number | null;
  lines: ReadLine[];
}

export type DivergenceKind = 'ONLY_IN_A' | 'ONLY_IN_B' | 'AMOUNT' | 'DATE';

export interface LineDivergence {
  kind: DivergenceKind;
  a: ReadLine | null;
  b: ReadLine | null;
}

export interface MergedLine extends ReadLine {
  readingAgreement: boolean;
  divergence: LineDivergence | null;
}

export interface MergedReading {
  lines: MergedLine[];
  iban: string | null;
  periodStart: string | null;
  periodEnd: string | null;
  openingBalanceCents: number | null;
  closingBalanceCents: number | null;
  /** Désaccords hors lignes (soldes, période), en clair, lecture A retenue. */
  warnings: string[];
  /** 'A' ou 'B' quand une seule lecture a abouti ; null quand les deux. */
  singleReading: 'A' | 'B' | null;
  divergenceCount: number;
}

const SIMILARITY_THRESHOLD = 0.5;

export function normalizeLabel(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

/** Coefficient de Dice sur les mots ; 1 = mêmes mots. */
export function labelSimilarity(a: string, b: string): number {
  const na = normalizeLabel(a);
  const nb = normalizeLabel(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  if (na.length >= 4 && nb.length >= 4 && (na.includes(nb) || nb.includes(na))) return 1;
  const ta = new Set(na.split(' '));
  const tb = new Set(nb.split(' '));
  let common = 0;
  for (const t of ta) if (tb.has(t)) common++;
  return (2 * common) / (ta.size + tb.size);
}

function agreed(a: ReadLine, b: ReadLine): MergedLine {
  return {
    bookedOn: a.bookedOn,
    valueOn: a.valueOn ?? b.valueOn,
    // Le libellé le plus complet des deux.
    label: a.label.length >= b.label.length ? a.label : b.label,
    amountCents: a.amountCents,
    balanceAfterCents: a.balanceAfterCents ?? b.balanceAfterCents,
    readingAgreement: true,
    divergence: null,
  };
}

function diverged(kind: DivergenceKind, a: ReadLine | null, b: ReadLine | null): MergedLine {
  const base = (a ?? b) as ReadLine;
  return {
    bookedOn: base.bookedOn,
    valueOn: base.valueOn,
    label: base.label,
    amountCents: base.amountCents,
    balanceAfterCents: base.balanceAfterCents,
    readingAgreement: false,
    divergence: { kind, a, b },
  };
}

/** « 1 328,66 € », sans dépendre des espaces fines de la locale du serveur. */
const euro = (cents: number): string => {
  const abs = Math.abs(cents);
  const int = Math.floor(abs / 100)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return `${cents < 0 ? '−' : ''}${int},${String(abs % 100).padStart(2, '0')} €`;
};

function pickBalance(
  what: string,
  a: number | null,
  b: number | null,
  warnings: string[],
): number | null {
  if (a !== null && b !== null && a !== b) {
    warnings.push(`${what} : lecture A ${euro(a)}, lecture B ${euro(b)} ; A retenue.`);
    return a;
  }
  return a ?? b;
}

function pickText(what: string, a: string | null, b: string | null, warnings: string[]): string | null {
  if (a && b && a !== b) {
    warnings.push(`${what} : lecture A ${a}, lecture B ${b} ; A retenue.`);
    return a;
  }
  return a ?? b;
}

export function mergeReadings(
  a: StatementReading | null,
  b: StatementReading | null,
): MergedReading {
  if (!a && !b) {
    return {
      lines: [],
      iban: null,
      periodStart: null,
      periodEnd: null,
      openingBalanceCents: null,
      closingBalanceCents: null,
      warnings: ['Aucune lecture n’a abouti.'],
      singleReading: null,
      divergenceCount: 0,
    };
  }
  if (!a || !b) {
    const only = (a ?? b) as StatementReading;
    return {
      lines: sortByDate(
        only.lines.map((l) => ({ ...l, readingAgreement: true, divergence: null })),
      ),
      iban: only.iban,
      periodStart: only.periodStart,
      periodEnd: only.periodEnd,
      openingBalanceCents: only.openingBalanceCents,
      closingBalanceCents: only.closingBalanceCents,
      warnings: [
        `Une seule lecture a abouti (${a ? 'A' : 'B'}) : le contrôle d’intégrité est le seul garde-fou.`,
      ],
      singleReading: a ? 'A' : 'B',
      divergenceCount: 0,
    };
  }

  const usedB = new Set<number>();
  const merged: MergedLine[] = [];
  const pendingA: number[] = [];

  // 1. Appariement exact sur (date, montant), dans l'ordre.
  a.lines.forEach((la, i) => {
    const j = b.lines.findIndex(
      (lb, k) => !usedB.has(k) && lb.bookedOn === la.bookedOn && lb.amountCents === la.amountCents,
    );
    if (j >= 0) {
      usedB.add(j);
      merged.push(agreed(la, b.lines[j]));
    } else {
      pendingA.push(i);
    }
  });

  // 2. Même montant OU même date, libellés proches → désaccord de date ou
  //    de montant (la ligne existe, une des lectures s'est trompée).
  for (const i of pendingA) {
    const la = a.lines[i];
    let best = -1;
    let bestScore = 0;
    let kind: 'AMOUNT' | 'DATE' | null = null;
    b.lines.forEach((lb, k) => {
      if (usedB.has(k)) return;
      const sameAmount = lb.amountCents === la.amountCents;
      const sameDate = lb.bookedOn === la.bookedOn;
      if (!sameAmount && !sameDate) return;
      const s = labelSimilarity(la.label, lb.label);
      if (s >= SIMILARITY_THRESHOLD && s > bestScore) {
        best = k;
        bestScore = s;
        kind = sameAmount ? 'DATE' : 'AMOUNT';
      }
    });
    if (best >= 0 && kind) {
      usedB.add(best);
      merged.push(diverged(kind, la, b.lines[best]));
    } else {
      merged.push(diverged('ONLY_IN_A', la, null));
    }
  }

  // 3. Ce que B a vu et pas A.
  b.lines.forEach((lb, k) => {
    if (!usedB.has(k)) merged.push(diverged('ONLY_IN_B', null, lb));
  });

  const warnings: string[] = [];
  const lines = sortByDate(merged);
  return {
    lines,
    iban: pickText('IBAN', a.iban, b.iban, warnings),
    periodStart: pickText('Début de période', a.periodStart, b.periodStart, warnings),
    periodEnd: pickText('Fin de période', a.periodEnd, b.periodEnd, warnings),
    openingBalanceCents: pickBalance(
      'Solde de début',
      a.openingBalanceCents,
      b.openingBalanceCents,
      warnings,
    ),
    closingBalanceCents: pickBalance(
      'Solde de fin',
      a.closingBalanceCents,
      b.closingBalanceCents,
      warnings,
    ),
    warnings,
    singleReading: null,
    divergenceCount: lines.filter((l) => !l.readingAgreement).length,
  };
}

/** Tri stable par date : l'ordre du relevé est conservé à date égale. */
function sortByDate<T extends { bookedOn: string }>(lines: T[]): T[] {
  return lines
    .map((l, i) => ({ l, i }))
    .sort((x, y) => x.l.bookedOn.localeCompare(y.l.bookedOn) || x.i - y.i)
    .map((x) => x.l);
}
