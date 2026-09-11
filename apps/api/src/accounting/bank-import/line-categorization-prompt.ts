/**
 * Prompt et lecture de réponse pour la catégorisation d'une ligne de relevé
 * (ADR-0014 §5). Purs : testés sans réseau.
 *
 * Le modèle ne choisit pas librement : il choisit dans le plan comptable du
 * club, avec les règles déjà en vigueur et les décisions récentes sous les
 * yeux. Quand il n'est pas sûr, on lui demande UNE question plutôt qu'une
 * réponse au hasard.
 */

export interface PromptAccount {
  code: string;
  label: string;
  kind: string;
}

export interface PromptExample {
  label: string;
  accountCode: string;
  accountLabel: string;
}

export interface PromptRule {
  pattern: string;
  direction: string;
  accountCode: string;
}

export interface ConversationTurn {
  role: 'ASSISTANT' | 'USER';
  text: string;
}

export interface CategorizationPromptInput {
  /** Libellé brut de la ligne, tel qu'imprimé par la banque. */
  label: string;
  /** Signé : positif = encaissement, négatif = décaissement. */
  amountCents: number;
  /** YYYY-MM-DD */
  bookedOn: string;
  /** Compte bancaire du relevé, pour situer le mouvement. */
  financialAccountLabel: string;
  accounts: PromptAccount[];
  projects: Array<{ id: string; title: string }>;
  rules: PromptRule[];
  examples: PromptExample[];
  conversation: ConversationTurn[];
}

export const CATEGORIZATION_SYSTEM_PROMPT =
  'Tu es aide-comptable d’une association sportive française. Tu catégorises des lignes de relevé bancaire selon le plan comptable du club. Tu réponds UNIQUEMENT en JSON strict, sans markdown, sans texte autour.';

const euro = (cents: number): string => {
  const abs = Math.abs(cents);
  return `${cents < 0 ? '−' : '+'}${Math.floor(abs / 100)},${String(abs % 100).padStart(2, '0')} €`;
};

export function buildCategorizationPrompt(input: CategorizationPromptInput): string {
  const sens = input.amountCents >= 0 ? 'ENCAISSEMENT (argent reçu)' : 'DÉCAISSEMENT (argent sorti)';
  const accountsList = input.accounts
    .map((a) => `  - ${a.code} (${a.kind}) — ${a.label}`)
    .join('\n');
  const projectsList =
    input.projects.length > 0
      ? input.projects.map((p) => `  - ${p.id} — ${p.title}`).join('\n')
      : '  (aucun projet actif : projectId = null)';
  const rulesList =
    input.rules.length > 0
      ? input.rules
          .map((r) => `  - « ${r.pattern} » (${r.direction}) → ${r.accountCode}`)
          .join('\n')
      : '  (aucune règle pour l’instant)';
  const examplesList =
    input.examples.length > 0
      ? input.examples
          .map((e) => `  - « ${e.label} » → ${e.accountCode} ${e.accountLabel}`)
          .join('\n')
      : '  (aucune décision passée comparable)';
  const dialogue =
    input.conversation.length > 0
      ? `\n## Échange déjà eu avec le trésorier\n${input.conversation
          .map((t) => `  ${t.role === 'ASSISTANT' ? 'Toi' : 'Trésorier'} : ${t.text}`)
          .join('\n')}\nTiens compte de sa réponse : elle tranche.\n`
      : '';

  return `Catégorise cette ligne de relevé bancaire.

Ligne : « ${input.label} »
Date : ${input.bookedOn}
Montant : ${euro(input.amountCents)} — ${sens}
Compte bancaire : ${input.financialAccountLabel}
${dialogue}
## Comptes disponibles (choisis-en UN dans cette liste)
${accountsList}

## Règles déjà en vigueur dans ce club
${rulesList}

## Décisions passées sur des libellés proches
${examplesList}

## Projets actifs
${projectsList}

## Réponse attendue — JSON strict
{
  "accountCode": "code à 6 chiffres pris dans la liste, ou null si tu ne sais pas",
  "projectId": "UUID d'un projet actif, ou null",
  "label": "libellé d'écriture lisible par un humain, sans le bruit bancaire (max 80 caractères)",
  "confidencePct": entier de 0 à 100,
  "reasoning": "une phrase courte, max 200 caractères",
  "question": "UNE question courte au trésorier si tu n'es pas sûr, sinon null (max 200 caractères)"
}

## Règles
- accountCode DOIT figurer dans la liste ci-dessus, sinon null.
- Un ENCAISSEMENT va sur un compte de produits (classe 7) ; un DÉCAISSEMENT sur un compte de charges (classe 6) ou d'immobilisation (classe 2) si le bien est durable et coûte 500 € ou plus. Un mouvement entre deux comptes du club (classe 5) est un virement interne.
- Le libellé doit dire QUI et QUOI : « EDF — facture électricité », pas « PRLV SEPA EDF 12/08 REF 123 ».
- confidencePct ≥ 80 seulement si tu es sûr du compte. Dans le doute, baisse la confiance et pose UNE question précise : ce qui te manque, pas une question générale.
- Ne pose pas de question si le trésorier y a déjà répondu plus haut.
- Une seule question à la fois, en français, tutoiement.`;
}

export interface ParsedCategorization {
  accountCode: string | null;
  projectId: string | null;
  label: string | null;
  confidencePct: number;
  reasoning: string | null;
  question: string | null;
}

function cleanJson(s: string): string {
  const stripped = s
    .replace(/^\s*```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/i, '')
    .trim();
  if (stripped.startsWith('{')) return stripped;
  const start = stripped.indexOf('{');
  const end = stripped.lastIndexOf('}');
  return start >= 0 && end > start ? stripped.slice(start, end + 1) : stripped;
}

const str = (v: unknown, max: number): string | null => {
  if (typeof v !== 'string') return null;
  const t = v.replace(/\s+/g, ' ').trim();
  return t.length > 0 && t.toLowerCase() !== 'null' ? t.slice(0, max) : null;
};

/**
 * Lecture tolérante de la réponse. Un compte hors du plan comptable du club
 * est refusé ici : mieux vaut pas de proposition qu'une proposition
 * invérifiable. Renvoie null si la réponse n'est pas du JSON.
 */
export function parseCategorizationJson(
  content: string,
  knownAccountCodes: Set<string>,
  knownProjectIds: Set<string>,
): ParsedCategorization | null {
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(cleanJson(content)) as Record<string, unknown>;
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null) return null;
  const code = str(parsed.accountCode, 20);
  const projectId = str(parsed.projectId, 60);
  const rawConfidence = parsed.confidencePct;
  let confidencePct = 0;
  if (typeof rawConfidence === 'number' && Number.isFinite(rawConfidence)) {
    // Un modèle qui répond « 0.85 » parle en fraction, pas en pourcentage.
    // « 1 » est lu comme 100 % : personne ne rend une confiance de 1 %.
    confidencePct =
      rawConfidence > 0 && rawConfidence <= 1
        ? Math.round(rawConfidence * 100)
        : Math.round(rawConfidence);
  }
  confidencePct = Math.max(0, Math.min(100, confidencePct));
  const accountCode = code && knownAccountCodes.has(code) ? code : null;
  return {
    accountCode,
    projectId: projectId && knownProjectIds.has(projectId) ? projectId : null,
    label: str(parsed.label, 200),
    // Un compte refusé ne peut pas rester « sûr ».
    confidencePct: accountCode ? confidencePct : 0,
    reasoning: str(parsed.reasoning, 300),
    question: str(parsed.question, 200),
  };
}
