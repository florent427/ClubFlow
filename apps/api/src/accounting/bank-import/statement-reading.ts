import type { ReadLine, StatementReading } from './merge-readings';

/**
 * Lecture d'un relevé PDF par un modèle vision (ADR-0014 §3) : le prompt et
 * l'analyse tolérante de sa réponse. Pur, testé sans réseau.
 */

export const STATEMENT_READING_SYSTEM_PROMPT =
  'Tu lis des relevés de compte bancaires français pour une association. Tu réponds UNIQUEMENT en JSON strict, sans markdown, sans commentaire.';

export interface ReadingPromptParams {
  /** Numéros (à partir de 1) des pages envoyées dans cet appel. */
  pageNumbers: number[];
  /** Nombre total de pages du relevé. */
  pageCount: number;
  /** Texte natif des pages envoyées ; vide sur un scan. */
  nativeText: string;
  /**
   * Solde courant à la fin de l'appel précédent (relevés longs lus par
   * paquets de pages) ; null au premier appel.
   */
  previousRunningBalanceCents: number | null;
}

export function buildStatementReadingPrompt(p: ReadingPromptParams): string {
  const first = p.pageNumbers[0] === 1;
  const last = p.pageNumbers[p.pageNumbers.length - 1] === p.pageCount;
  const which =
    p.pageCount === 1
      ? 'Tu reçois le relevé complet (1 page).'
      : `Tu reçois les pages ${p.pageNumbers.join(', ')} sur ${p.pageCount} d’un relevé.`;
  const continuity =
    p.previousRunningBalanceCents !== null
      ? `\nLe solde courant à la fin des pages précédentes était ${p.previousRunningBalanceCents} centimes : les opérations de ces pages continuent à partir de là.`
      : '';
  const balancesRule = `${first ? '- openingBalanceCents = « ancien solde », « solde précédent », « solde au JJ/MM » en tête de relevé.' : '- openingBalanceCents = null (le début du relevé n’est pas dans ces pages).'}
${last ? '- closingBalanceCents = « nouveau solde », « solde au JJ/MM » en fin de relevé.' : '- closingBalanceCents = null (la fin du relevé n’est pas dans ces pages).'}`;
  const native = p.nativeText.trim()
    ? `\n=== TEXTE NATIF DU PDF (source prioritaire pour les chiffres, sans erreur d’OCR) ===\n${p.nativeText.trim()}\n=== FIN DU TEXTE NATIF ===\n`
    : '';

  return `${which}${continuity}
Extrais les opérations exactement comme elles sont imprimées.

Réponds STRICTEMENT en JSON sur ce schéma :
{
  "iban": "IBAN du compte s’il est imprimé, sinon null",
  "periodStart": "YYYY-MM-DD ou null",
  "periodEnd": "YYYY-MM-DD ou null",
  "openingBalanceCents": entier en centimes ou null,
  "closingBalanceCents": entier en centimes ou null,
  "lines": [
    { "bookedOn": "YYYY-MM-DD", "valueOn": "YYYY-MM-DD ou null", "label": "libellé complet", "amountCents": entier signé en centimes, "balanceAfterCents": entier en centimes ou null }
  ]
}

Règles :
- Une entrée par opération. Ignore les lignes « Solde », « Total », « Report », « Sous-total », les en-têtes et les pieds de page : ce ne sont pas des opérations.
- Montants en CENTIMES, entiers, jamais en euros décimaux : 1 234,56 € → 123456. Une opération au DÉBIT (retrait, prélèvement, carte, virement émis, frais) est NÉGATIVE ; au CRÉDIT (remise, virement reçu, dépôt) POSITIVE. Regarde dans quelle colonne (Débit / Crédit) le montant est imprimé.
- Dates au format YYYY-MM-DD ; l’année vient de l’en-tête du relevé quand la ligne n’imprime que JJ/MM. bookedOn = date d’opération ; valueOn = date de valeur si une colonne existe, sinon null.
- label = le libellé complet de la ligne, sur une seule ligne, y compris la référence si elle est imprimée.
- balanceAfterCents = solde après l’opération si le relevé l’imprime à chaque ligne, sinon null.
${balancesRule}
- Un solde débiteur (à découvert) est négatif.
- Aucune opération inventée, aucune opération oubliée : la somme des amountCents doit relier l’ancien solde au nouveau.
${native}`;
}

/** Résultat d'une analyse de réponse : lecture (ou null) et avertissements. */
export interface ParsedReading {
  reading: StatementReading | null;
  warnings: string[];
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const FR_DATE = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/;

function cleanJson(s: string): string {
  const stripped = s
    .replace(/^\s*```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/i, '')
    .trim();
  if (stripped.startsWith('{')) return stripped;
  // Du texte autour du JSON : on prend le premier objet.
  const start = stripped.indexOf('{');
  const end = stripped.lastIndexOf('}');
  return start >= 0 && end > start ? stripped.slice(start, end + 1) : stripped;
}

/** Date YYYY-MM-DD valide, ou null. Tolère JJ/MM/AAAA. */
export function parseReadDate(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const s = raw.trim();
  let iso: string | null = null;
  if (ISO_DATE.test(s)) iso = s;
  else {
    const m = FR_DATE.exec(s);
    if (m) iso = `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  }
  if (!iso) return null;
  const d = new Date(`${iso}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== iso ? null : iso;
}

/**
 * Montant en centimes. Un entier est pris tel quel ; un décimal est
 * considéré comme des euros (le modèle a désobéi) ; une chaîne « −45,10 »
 * ou « 1 234,56 » est lue comme des euros.
 */
export function parseReadCents(raw: unknown): number | null {
  if (typeof raw === 'number') {
    if (!Number.isFinite(raw)) return null;
    return Number.isInteger(raw) ? raw : Math.round(raw * 100);
  }
  if (typeof raw !== 'string') return null;
  const s = raw
    .replace(/[\s €]/g, '')
    .replace(/[−–]/g, '-')
    .replace(/\.(?=\d{3}(\D|$))/g, '')
    .replace(',', '.');
  if (!/^[-+]?\d+(\.\d{1,2})?$/.test(s)) return null;
  return Math.round(Number(s) * 100);
}

export function parseStatementReadingJson(content: string): ParsedReading {
  const warnings: string[] = [];
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(cleanJson(content)) as Record<string, unknown>;
  } catch (err) {
    return {
      reading: null,
      warnings: [`Réponse non JSON : ${err instanceof Error ? err.message : String(err)}`],
    };
  }
  if (typeof parsed !== 'object' || parsed === null) {
    return { reading: null, warnings: ['Réponse JSON sans objet.'] };
  }
  const rawLines = Array.isArray(parsed.lines) ? parsed.lines : [];
  const lines: ReadLine[] = [];
  rawLines.forEach((x, i) => {
    if (typeof x !== 'object' || x === null) return;
    const r = x as Record<string, unknown>;
    const bookedOn = parseReadDate(r.bookedOn);
    const amountCents = parseReadCents(r.amountCents);
    const label = typeof r.label === 'string' ? r.label.replace(/\s+/g, ' ').trim() : '';
    if (!bookedOn || amountCents === null || amountCents === 0) {
      warnings.push(`Ligne ${i + 1} écartée (date ou montant illisible) : ${label || '(sans libellé)'}`);
      return;
    }
    lines.push({
      bookedOn,
      valueOn: parseReadDate(r.valueOn),
      label: label || '(sans libellé)',
      amountCents,
      balanceAfterCents: parseReadCents(r.balanceAfterCents),
    });
  });
  const iban = typeof parsed.iban === 'string' ? parsed.iban.replace(/\s+/g, '').toUpperCase() : null;
  return {
    reading: {
      iban: iban && iban.length >= 15 ? iban : null,
      periodStart: parseReadDate(parsed.periodStart),
      periodEnd: parseReadDate(parsed.periodEnd),
      openingBalanceCents: parseReadCents(parsed.openingBalanceCents),
      closingBalanceCents: parseReadCents(parsed.closingBalanceCents),
      lines,
    },
    warnings,
  };
}
