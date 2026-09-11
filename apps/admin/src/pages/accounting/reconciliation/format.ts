import type {
  BankStatementLineStatusGql,
  BankStatementStatusGql,
  CsvMapping,
} from '../../../lib/types';

/**
 * Copie un mapping lu par Apollo (qui y ajoute `__typename`) en un objet
 * envoyable tel quel comme `CsvMappingInput`.
 */
export function cleanMapping(m: CsvMapping | null | undefined): CsvMapping | null {
  if (!m) return null;
  return {
    delimiter: m.delimiter,
    hasHeader: m.hasHeader,
    dateCol: m.dateCol,
    labelCol: m.labelCol,
    amountCol: m.amountCol,
    debitCol: m.debitCol,
    creditCol: m.creditCol,
    balanceCol: m.balanceCol,
    valueDateCol: m.valueDateCol,
    referenceCol: m.referenceCol,
    dateFormat: m.dateFormat,
    decimalSeparator: m.decimalSeparator,
  };
}

export function formatEuro(cents: number): string {
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: 'EUR',
  }).format(cents / 100);
}

/** Montant signé avec son signe explicite : « +250,00 € », « −45,10 € ». */
export function formatSigned(cents: number): string {
  const s = formatEuro(Math.abs(cents));
  return cents < 0 ? `−${s}` : `+${s}`;
}

/** « 2026-09-01 » → « 01/09/2026 ». */
export function formatFr(iso: string | null | undefined): string {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

/** 123456 → « 1234,56 » ; null → « ». Négatif conservé. */
export function centsToInput(cents: number | null): string {
  if (cents === null) return '';
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(cents);
  return `${sign}${Math.floor(abs / 100)},${String(abs % 100).padStart(2, '0')}`;
}

/** « 1 234,56 » → 123456 ; vide → null ; invalide → NaN. */
export function inputToCents(value: string): number | null {
  const s = value.replace(/\s/g, '').replace(',', '.');
  if (!s) return null;
  if (!/^-?\d+(\.\d{1,2})?$/.test(s)) return Number.NaN;
  return Math.round(Number(s) * 100);
}

export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Lit un fichier en base64 (sans le préfixe data:). */
export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Lecture du fichier impossible'));
    reader.onload = () => {
      const result = String(reader.result ?? '');
      const idx = result.indexOf(',');
      resolve(idx >= 0 ? result.slice(idx + 1) : result);
    };
    reader.readAsDataURL(file);
  });
}

export const STATEMENT_STATUS_LABELS: Record<BankStatementStatusGql, string> = {
  PARSING: 'Lecture…',
  NEEDS_CHECK: 'À vérifier',
  READY: 'À rapprocher',
  RECONCILED: 'Rapproché',
  FAILED: 'Échec de lecture',
};

export function statementStatusPill(status: BankStatementStatusGql): string {
  switch (status) {
    case 'RECONCILED':
      return 'cf-pill cf-pill--ok';
    case 'READY':
      return 'cf-pill cf-pill--muted';
    case 'NEEDS_CHECK':
      return 'cf-pill cf-pill--warn';
    case 'FAILED':
      return 'cf-pill cf-pill--danger';
    default:
      return 'cf-pill cf-pill--muted';
  }
}

export const LINE_STATUS_LABELS: Record<BankStatementLineStatusGql, string> = {
  UNMATCHED: 'À traiter',
  SUGGESTED: 'Suggestions',
  MATCHED: 'Rapprochée',
  IGNORED: 'Ignorée',
};

export function lineStatusPill(status: BankStatementLineStatusGql): string {
  switch (status) {
    case 'MATCHED':
      return 'cf-pill cf-pill--ok';
    case 'SUGGESTED':
      return 'cf-pill cf-pill--warn';
    case 'IGNORED':
      return 'cf-pill cf-pill--muted';
    default:
      return 'cf-pill cf-pill--danger';
  }
}
