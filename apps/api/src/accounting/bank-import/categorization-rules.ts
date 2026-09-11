/**
 * Moteur de règles de catégorisation (ADR-0014 §5), pur et sans base.
 *
 * Un libellé de relevé porte toujours du bruit : le canal (« PRLV SEPA »),
 * une date, une référence. On le normalise, puis on confronte les règles du
 * club au texte nettoyé. Une règle qui tombe décide seule : c'est elle qui
 * évite de repayer deux modèles pour le loyer de chaque mois.
 */

export type MatchKind = 'CONTAINS' | 'STARTS_WITH' | 'REGEX';
export type Direction = 'CREDIT' | 'DEBIT' | 'ANY';

export interface CategorizationRule {
  id: string;
  pattern: string;
  matchKind: MatchKind;
  direction: Direction;
  accountCode: string;
  projectId: string | null;
  label: string | null;
  isActive: boolean;
}

export interface RuleMatch {
  rule: CategorizationRule;
  /** Longueur du motif : sert à préférer la règle la plus spécifique. */
  specificity: number;
}

/**
 * Mots qui décrivent le canal de paiement ou l'habillage bancaire, pas la
 * contrepartie. Les retirer laisse le nom qui compte : « PRLV SEPA EDF
 * FACTURE 123456 » → « EDF ».
 */
const NOISE_TOKENS = new Set([
  'VIR',
  'VIRT',
  'VIREMENT',
  'VIREMENTS',
  'SEPA',
  'PRLV',
  'PRELEVEMENT',
  'PRELEVEMENTS',
  'PRLVT',
  'CARTE',
  'CB',
  'PAIEMENT',
  'PAIEMENTS',
  'ACHAT',
  'ACHATS',
  'RETRAIT',
  'REMISE',
  'DEPOT',
  'CHEQUE',
  'CHQ',
  'CHEQUES',
  'FACTURE',
  'FACT',
  'FAC',
  'REF',
  'REFERENCE',
  'MANDAT',
  'ECHEANCE',
  'COTISATION',
  'ABONNEMENT',
  'RECU',
  'EMIS',
  'RECUE',
  'RECU',
  'DE',
  'DU',
  'DES',
  'LA',
  'LE',
  'LES',
  'ET',
  'AU',
  'AUX',
  'POUR',
  'PAR',
  'SUR',
  'EUR',
  'FRAIS',
  'OPERATION',
  'NUM',
  'NO',
  'ID',
]);

/** Le motif appris est complété tant qu'il reste sous cette longueur. */
const MIN_PATTERN_LENGTH = 6;
const MAX_PATTERN_TOKENS = 2;

/**
 * Libellé prêt à être confronté aux règles : majuscules, sans accents, sans
 * dates ni suites de chiffres, espaces réduits. Le résultat reste lisible
 * pour un humain, parce qu'il s'affiche dans l'écran des règles.
 */
export function normalizeStatementLabel(label: string): string {
  return label
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    // Dates : 12/08, 12-08-2026, 2026-08-12.
    .replace(/\b\d{1,2}[/.-]\d{1,2}([/.-]\d{2,4})?\b/g, ' ')
    .replace(/\b\d{4}[/.-]\d{1,2}[/.-]\d{1,2}\b/g, ' ')
    // Références et numéros : toute suite d'au moins trois chiffres, et les
    // identifiants mêlant lettres et chiffres (FR7618719000…, 4974XXXXXX1234).
    .replace(/\b[A-Z]*\d{3,}[A-Z0-9]*\b/g, ' ')
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

/** Jetons porteurs de sens d'un libellé, dans l'ordre. */
export function meaningfulTokens(label: string): string[] {
  return normalizeStatementLabel(label)
    .split(' ')
    .filter((t) => t.length >= 3 && !NOISE_TOKENS.has(t));
}

/**
 * Motif à retenir quand on apprend d'une validation : le nom de la
 * contrepartie. Un jeton suffit s'il est assez long (« DECATHLON ») ; sinon
 * on en prend un second (« EDF » seul reste « EDF », « SARL DUPONT » devient
 * « SARL DUPONT »). Renvoie null si le libellé n'a aucun jeton utile.
 */
export function learnedPatternFor(label: string): string | null {
  const tokens = meaningfulTokens(label);
  if (tokens.length === 0) return null;
  const kept: string[] = [];
  for (const t of tokens) {
    kept.push(t);
    if (kept.join(' ').length >= MIN_PATTERN_LENGTH || kept.length >= MAX_PATTERN_TOKENS) {
      break;
    }
  }
  return kept.join(' ');
}

function directionOf(amountCents: number): Exclude<Direction, 'ANY'> {
  return amountCents >= 0 ? 'CREDIT' : 'DEBIT';
}

/** Une règle s'applique-t-elle à ce libellé normalisé et à ce sens ? */
export function ruleMatches(
  rule: CategorizationRule,
  normalizedLabel: string,
  amountCents: number,
): boolean {
  if (!rule.isActive) return false;
  if (rule.direction !== 'ANY' && rule.direction !== directionOf(amountCents)) {
    return false;
  }
  const pattern = normalizeStatementLabel(rule.pattern);
  if (!pattern) return false;
  switch (rule.matchKind) {
    case 'STARTS_WITH':
      return normalizedLabel.startsWith(pattern);
    case 'REGEX':
      try {
        // Le motif brut, pas normalisé : une expression régulière porte sa
        // propre syntaxe, la normaliser la casserait.
        return new RegExp(rule.pattern, 'i').test(normalizedLabel);
      } catch {
        // Expression invalide : la règle ne s'applique pas, plutôt que de
        // faire échouer toute la catégorisation.
        return false;
      }
    default:
      return normalizedLabel.includes(pattern);
  }
}

/**
 * La règle qui l'emporte pour une ligne : la plus spécifique d'abord (motif
 * le plus long), et à motif égal celle qui vise un sens précis plutôt que
 * les deux. Renvoie null si aucune règle ne tombe.
 */
export function applyRules(
  rules: CategorizationRule[],
  label: string,
  amountCents: number,
): RuleMatch | null {
  const normalized = normalizeStatementLabel(label);
  if (!normalized) return null;
  const matches = rules
    .filter((r) => ruleMatches(r, normalized, amountCents))
    .map((rule) => ({ rule, specificity: normalizeStatementLabel(rule.pattern).length }));
  if (matches.length === 0) return null;
  matches.sort(
    (a, b) =>
      b.specificity - a.specificity ||
      Number(b.rule.direction !== 'ANY') - Number(a.rule.direction !== 'ANY'),
  );
  return matches[0];
}
