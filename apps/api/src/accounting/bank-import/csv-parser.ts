import { BadRequestException } from '@nestjs/common';
import {
  decodeStatementText,
  sortByDateStable,
  utcDate,
} from './statement-types';
import type { ParsedStatement, ParsedStatementLine } from './statement-types';

/**
 * Lecteur CSV (ADR-0014 §3), déterministe et sans IA.
 *
 * Chaque banque a son format : séparateur, encodage, ordre des colonnes,
 * débit/crédit séparés ou montant signé, virgule décimale, dates
 * `JJ/MM/AAAA`. On DÉTECTE un mapping, le trésorier le confirme une fois,
 * et il est mémorisé sur le compte financier.
 */

export type CsvDateFormat = 'DMY' | 'YMD' | 'MDY';

export interface CsvMapping {
  delimiter: string;
  hasHeader: boolean;
  dateCol: number;
  labelCol: number;
  /** Montant signé. Exclusif avec débit/crédit. */
  amountCol: number | null;
  debitCol: number | null;
  creditCol: number | null;
  balanceCol: number | null;
  valueDateCol: number | null;
  referenceCol: number | null;
  dateFormat: CsvDateFormat;
  decimalSeparator: ',' | '.';
}

export interface CsvDetection {
  delimiter: string;
  encoding: string;
  hasHeader: boolean;
  headers: string[];
  sampleRows: string[][];
  rowCount: number;
  mapping: CsvMapping;
}

/** Découpe RFC 4180 (guillemets doublés, séparateur entre guillemets). */
export function splitCsvText(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cell += ch;
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
    } else if (ch === delimiter) {
      row.push(cell);
      cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += ch;
    }
  }
  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

/** Le séparateur qui donne le plus de colonnes, de façon constante. */
export function detectDelimiter(text: string): string {
  const sample = text.split(/\r?\n/).filter((l) => l.trim()).slice(0, 20);
  let best = ';';
  let bestScore = -1;
  for (const d of [';', ',', '\t', '|']) {
    const counts = sample.map((l) => splitCsvText(l, d)[0]?.length ?? 1);
    const max = Math.max(...counts);
    if (max < 2) continue;
    const consistent = counts.filter((c) => c === max).length;
    const score = consistent * 100 + max;
    if (score > bestScore) {
      bestScore = score;
      best = d;
    }
  }
  return best;
}

/** `1 234,56`, `-12.50`, `12,5 €`, `(12,00)` → centimes ; null si vide/illisible. */
export function parseCsvNumber(
  raw: string | undefined,
  decimal: ',' | '.',
): number | null {
  if (raw === undefined) return null;
  let s = raw.replace(/[\s  €]/g, '').trim();
  if (!s) return null;
  let negative = false;
  if (/^\(.*\)$/.test(s)) {
    negative = true;
    s = s.slice(1, -1);
  }
  if (s.endsWith('-')) {
    negative = true;
    s = s.slice(0, -1);
  }
  if (decimal === ',') {
    s = s.replace(/\./g, '').replace(',', '.');
  } else {
    s = s.replace(/,/g, '');
  }
  if (!/^[-+]?\d+(\.\d+)?$/.test(s)) return null;
  const cents = Math.round(Number(s) * 100);
  return negative ? -Math.abs(cents) : cents;
}

export function parseCsvDate(
  raw: string | undefined,
  fmt: CsvDateFormat,
): Date | null {
  if (!raw) return null;
  const s = raw.trim();
  if (fmt === 'YMD') {
    const m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/.exec(s);
    return m ? utcDate(Number(m[1]), Number(m[2]), Number(m[3])) : null;
  }
  const m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/.exec(s);
  if (!m) return null;
  let year = Number(m[3]);
  if (m[3].length === 2) year += 2000;
  const a = Number(m[1]);
  const b = Number(m[2]);
  return fmt === 'MDY' ? utcDate(year, a, b) : utcDate(year, b, a);
}

const norm = (s: string): string =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();

function looksLikeDate(s: string): boolean {
  return /^\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4}/.test(s.trim()) || /^\d{4}[-/.]\d{2}[-/.]\d{2}/.test(s.trim());
}

function looksLikeNumber(s: string): boolean {
  const t = s.replace(/[\s  €]/g, '');
  return /^[-+(]?\d+([.,]\d+)?[)-]?$/.test(t) && t.length > 0;
}

function detectDateFormat(samples: string[]): CsvDateFormat {
  let dmy = 0;
  let mdy = 0;
  for (const s of samples) {
    const t = s.trim();
    if (/^\d{4}[-/.]/.test(t)) return 'YMD';
    const m = /^(\d{1,2})[-/.](\d{1,2})[-/.]/.exec(t);
    if (!m) continue;
    if (Number(m[1]) > 12) dmy++;
    if (Number(m[2]) > 12) mdy++;
  }
  if (mdy > dmy) return 'MDY';
  return 'DMY';
}

function detectDecimal(samples: string[]): ',' | '.' {
  let comma = 0;
  let dot = 0;
  for (const s of samples) {
    if (/\d,\d{1,2}$/.test(s.trim())) comma++;
    if (/\d\.\d{1,2}$/.test(s.trim())) dot++;
  }
  return dot > comma ? '.' : ',';
}

/**
 * Détecte séparateur, encodage, en-tête et mapping de colonnes. Le mapping
 * est une proposition : l'écran d'import l'affiche avec un aperçu et le
 * trésorier le corrige au besoin.
 */
export function detectCsv(buffer: Buffer): CsvDetection {
  const { text, encoding } = decodeStatementText(buffer);
  const delimiter = detectDelimiter(text);
  const rows = splitCsvText(text, delimiter);
  if (rows.length === 0) {
    throw new BadRequestException('Fichier CSV vide.');
  }
  const width = Math.max(...rows.map((r) => r.length));
  const first = rows[0];
  const hasHeader =
    first.filter((c) => c.trim() && !looksLikeDate(c) && !looksLikeNumber(c)).length >=
    Math.max(2, Math.ceil(first.length / 2));
  const headers = hasHeader
    ? first.map((h) => h.trim())
    : Array.from({ length: width }, (_, i) => `Colonne ${i + 1}`);
  const data = hasHeader ? rows.slice(1) : rows;

  const find = (re: RegExp, exclude: number[] = []): number =>
    headers.findIndex((h, i) => !exclude.includes(i) && re.test(norm(h)));

  let dateCol = -1;
  let valueDateCol = -1;
  let labelCol = -1;
  let amountCol = -1;
  let debitCol = -1;
  let creditCol = -1;
  let balanceCol = -1;
  let referenceCol = -1;

  if (hasHeader) {
    valueDateCol = find(/valeur|value/);
    dateCol = find(/date/, valueDateCol >= 0 ? [valueDateCol] : []);
    labelCol = find(/libell|intitul|descr|label|nature|detail|motif|communication/);
    debitCol = find(/debit/);
    creditCol = find(/credit/);
    if (debitCol < 0 || creditCol < 0) {
      amountCol = find(/montant|amount|somme/);
      if (amountCol >= 0) {
        debitCol = -1;
        creditCol = -1;
      }
    }
    balanceCol = find(/solde|balance/);
    referenceCol = find(/^ref|reference|numero|n°/, [labelCol]);
  }

  // Repli sur le contenu quand l'en-tête ne dit rien.
  const colStats = Array.from({ length: width }, (_, c) => {
    const cells = data.slice(0, 50).map((r) => r[c] ?? '').filter((v) => v.trim());
    const n = Math.max(1, cells.length);
    return {
      date: cells.filter(looksLikeDate).length / n,
      num: cells.filter(looksLikeNumber).length / n,
      textLen: cells.reduce((s, v) => s + v.length, 0) / n,
    };
  });
  if (dateCol < 0) {
    dateCol = colStats.findIndex((s) => s.date >= 0.6);
  }
  const numericCols = colStats
    .map((s, i) => ({ s, i }))
    .filter((x) => x.i !== dateCol && x.i !== valueDateCol && x.s.num >= 0.6)
    .map((x) => x.i);
  if (amountCol < 0 && debitCol < 0 && creditCol < 0) {
    if (numericCols.length >= 1) amountCol = numericCols[0];
    if (numericCols.length >= 2 && balanceCol < 0) balanceCol = numericCols[1];
  }
  if (labelCol < 0) {
    const textCols = colStats
      .map((s, i) => ({ s, i }))
      .filter(
        (x) =>
          x.i !== dateCol &&
          x.i !== valueDateCol &&
          x.i !== amountCol &&
          x.i !== debitCol &&
          x.i !== creditCol &&
          x.i !== balanceCol,
      )
      .sort((a, b) => b.s.textLen - a.s.textLen);
    labelCol = textCols[0]?.i ?? 0;
  }
  if (dateCol < 0) dateCol = 0;

  const dateSamples = data.slice(0, 30).map((r) => r[dateCol] ?? '');
  const numSamples = data
    .slice(0, 30)
    .flatMap((r) =>
      [amountCol, debitCol, creditCol, balanceCol]
        .filter((c) => c >= 0)
        .map((c) => r[c] ?? ''),
    )
    .filter((v) => v.trim());

  return {
    delimiter,
    encoding,
    hasHeader,
    headers,
    sampleRows: data.slice(0, 8),
    rowCount: data.length,
    mapping: {
      delimiter,
      hasHeader,
      dateCol,
      labelCol,
      amountCol: amountCol >= 0 ? amountCol : null,
      debitCol: debitCol >= 0 ? debitCol : null,
      creditCol: creditCol >= 0 ? creditCol : null,
      balanceCol: balanceCol >= 0 ? balanceCol : null,
      valueDateCol: valueDateCol >= 0 ? valueDateCol : null,
      referenceCol: referenceCol >= 0 ? referenceCol : null,
      dateFormat: detectDateFormat(dateSamples),
      decimalSeparator: detectDecimal(numSamples),
    },
  };
}

export function parseCsv(buffer: Buffer, mapping: CsvMapping): ParsedStatement {
  const { text } = decodeStatementText(buffer);
  const rows = splitCsvText(text, mapping.delimiter);
  const data = mapping.hasHeader ? rows.slice(1) : rows;
  const warnings: string[] = [];
  const lines: ParsedStatementLine[] = [];
  const dec = mapping.decimalSeparator;

  data.forEach((row, i) => {
    const rowNo = i + (mapping.hasHeader ? 2 : 1);
    const bookedOn = parseCsvDate(row[mapping.dateCol], mapping.dateFormat);
    if (!bookedOn) {
      warnings.push(`Ligne ${rowNo} ignorée : date illisible (« ${row[mapping.dateCol] ?? ''} »).`);
      return;
    }
    let amountCents: number | null = null;
    if (mapping.amountCol !== null && mapping.amountCol !== undefined) {
      amountCents = parseCsvNumber(row[mapping.amountCol], dec);
    } else {
      const debit =
        mapping.debitCol !== null && mapping.debitCol !== undefined
          ? parseCsvNumber(row[mapping.debitCol], dec)
          : null;
      const credit =
        mapping.creditCol !== null && mapping.creditCol !== undefined
          ? parseCsvNumber(row[mapping.creditCol], dec)
          : null;
      if (debit !== null || credit !== null) {
        // Un débit est une sortie : positif dans sa colonne chez la plupart
        // des banques, déjà négatif chez quelques-unes. Dans les deux cas
        // il compte en négatif.
        amountCents = (credit ?? 0) + (debit === null ? 0 : -Math.abs(debit));
      }
    }
    if (amountCents === null) {
      warnings.push(`Ligne ${rowNo} ignorée : montant illisible.`);
      return;
    }
    const label = (row[mapping.labelCol] ?? '').trim() || '(sans libellé)';
    const reference =
      mapping.referenceCol !== null && mapping.referenceCol !== undefined
        ? (row[mapping.referenceCol] ?? '').trim() || null
        : null;
    lines.push({
      bookedOn,
      valueOn:
        mapping.valueDateCol !== null && mapping.valueDateCol !== undefined
          ? parseCsvDate(row[mapping.valueDateCol], mapping.dateFormat)
          : null,
      label: label.replace(/\s+/g, ' '),
      rawLabel: row.map((c) => c.trim()).filter(Boolean).join(' | '),
      reference,
      amountCents,
      balanceAfterCents:
        mapping.balanceCol !== null && mapping.balanceCol !== undefined
          ? parseCsvNumber(row[mapping.balanceCol], dec)
          : null,
      fitId: null,
    });
  });

  if (lines.length === 0) {
    throw new BadRequestException(
      'Aucune ligne lisible : vérifie le mapping des colonnes.',
    );
  }

  // Ordre : avec une colonne solde, le fichier dit lui-même dans quel sens il
  // est écrit (solde[i] = solde[i-1] + montant[i] en croissant). Sans solde,
  // tri stable par date.
  let ordered: ParsedStatementLine[];
  const withBalance = lines.every((l) => l.balanceAfterCents !== null);
  if (withBalance && lines.length >= 2) {
    const b = (l: ParsedStatementLine) => l.balanceAfterCents as number;
    const ascending = b(lines[1]) === b(lines[0]) + lines[1].amountCents;
    const descending = b(lines[0]) === b(lines[1]) + lines[0].amountCents;
    if (ascending) ordered = lines;
    else if (descending) ordered = [...lines].reverse();
    else {
      warnings.push(
        'La colonne solde ne suit pas les montants : ordre par date, soldes ignorés.',
      );
      ordered = sortByDateStable(lines).map((l) => ({ ...l, balanceAfterCents: null }));
    }
  } else {
    ordered = sortByDateStable(lines);
  }

  const first = ordered[0];
  const last = ordered[ordered.length - 1];
  const balancesUsable = ordered.every((l) => l.balanceAfterCents !== null);
  return {
    lines: ordered,
    openingBalanceCents: balancesUsable
      ? (first.balanceAfterCents as number) - first.amountCents
      : null,
    closingBalanceCents: balancesUsable ? (last.balanceAfterCents as number) : null,
    periodStart: ordered.reduce((m, l) => (l.bookedOn < m ? l.bookedOn : m), first.bookedOn),
    periodEnd: ordered.reduce((m, l) => (l.bookedOn > m ? l.bookedOn : m), first.bookedOn),
    accountId: null,
    currency: null,
    warnings,
  };
}
