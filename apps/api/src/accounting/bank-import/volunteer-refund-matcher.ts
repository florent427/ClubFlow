import { meaningfulTokens } from './categorization-rules';
import { nameScore } from './member-transfer-matcher';

/**
 * Reconnaissance d'un remboursement de bénévole sur une ligne DÉBITRICE
 * (ADR-0016), pure et sans base.
 *
 * Le miroir du virement d'adhérent : là où de l'argent ENTRE au nom d'un
 * payeur, ici il SORT au nom de quelqu'un à qui le club doit de l'argent.
 * « VIR SEPA JEAN DUPONT REMB FRAIS » face aux reçus qu'il a avancés.
 *
 * Proposable en un clic seulement quand un seul bénévole est reconnu ET que
 * le montant tombe juste sur ses reçus ouverts. Sinon la ligne reste à
 * trancher à la main : rembourser la mauvaise personne est une erreur qu'un
 * relevé ne rattrape pas.
 */

export interface VolunteerOpenReceipt {
  entryId: string;
  label: string;
  amountCents: number;
  occurredAt: Date;
}

export interface VolunteerBalanceForMatch {
  memberId: string;
  firstName: string;
  lastName: string;
  receipts: VolunteerOpenReceipt[];
}

export type VolunteerAmountMatch =
  /** Le montant solde TOUS les reçus ouverts du bénévole. */
  | 'EXACT_ALL'
  /** Il en solde un sous-ensemble, et un seul convient. */
  | 'EXACT_SUBSET'
  /** Aucun sous-ensemble ne tombe juste. */
  | 'NONE';

export interface VolunteerRefundCandidate {
  memberId: string;
  firstName: string;
  lastName: string;
  /** 100 = nom et prénom reconnus, 70 = nom de famille seul. */
  nameScore: number;
  /** Reçus que ce remboursement solderait, vides si rien ne tombe juste. */
  entryIds: string[];
  amountMatch: VolunteerAmountMatch;
  /** Total encore dû à ce bénévole, tous reçus confondus. */
  openCents: number;
  openCount: number;
  /** 0 à 100 : nom ET montant. Au-dessus de 80, proposable en un clic. */
  confidence: number;
}

const AMOUNT_WEIGHT: Record<VolunteerAmountMatch, number> = {
  EXACT_ALL: 100,
  EXACT_SUBSET: 80,
  NONE: 0,
};

/**
 * Au-delà, on ne cherche pas de sous-ensemble : 2^16 combinaisons pour un
 * bénévole qui aurait 16 reçus ouverts, c'est déjà généreux, et la
 * proposition ne vaudrait plus rien tant les combinaisons se ressembleraient.
 */
const MAX_SUBSET_SEARCH = 16;

/** Proposable en un clic : un seul bénévole reconnu, un montant qui tombe juste. */
export const AUTO_VOLUNTEER_CONFIDENCE = 80;

export function matchVolunteerRefund(params: {
  label: string;
  reference: string | null;
  /** Montant SORTI du compte, en valeur absolue. */
  amountCents: number;
  balances: VolunteerBalanceForMatch[];
}): VolunteerRefundCandidate[] {
  if (params.amountCents <= 0) return [];
  const tokens = new Set([
    ...meaningfulTokens(params.label),
    ...(params.reference ? meaningfulTokens(params.reference) : []),
  ]);
  if (tokens.size === 0) return [];

  const named = params.balances
    .map((b) => ({
      b,
      score: nameScore(
        { kind: 'MEMBER', id: b.memberId, firstName: b.firstName, lastName: b.lastName },
        tokens,
      ),
    }))
    .filter((x) => x.score > 0 && x.b.receipts.length > 0);
  if (named.length === 0) return [];

  // Un nom cité une seule fois vaut mieux qu'un nom partagé.
  const best = Math.max(...named.map((x) => x.score));
  const shortlist = named.filter((x) => x.score === best);
  const ambiguous = shortlist.length > 1;

  const candidates = shortlist.map(({ b, score }) => {
    const openCents = b.receipts.reduce((s, r) => s + r.amountCents, 0);
    const { entryIds, amountMatch } = pickReceipts(params.amountCents, b.receipts, openCents);
    const raw = Math.round((score + AMOUNT_WEIGHT[amountMatch]) / 2);
    return {
      memberId: b.memberId,
      firstName: b.firstName,
      lastName: b.lastName,
      nameScore: score,
      entryIds,
      amountMatch,
      openCents,
      openCount: b.receipts.length,
      confidence: ambiguous ? Math.min(60, raw) : raw,
    };
  });

  return candidates.sort(
    (a, b) => b.confidence - a.confidence || b.openCents - a.openCents,
  );
}

/**
 * Quels reçus ce montant solde-t-il ? Tous, de préférence : c'est le cas
 * ordinaire, le club rembourse ce qu'il doit. Sinon un sous-ensemble, et
 * seulement s'il n'y en a qu'UN qui tombe juste — deux façons d'arriver au
 * même total, et proposer l'une revient à choisir pour le trésorier.
 */
function pickReceipts(
  amountCents: number,
  receipts: readonly VolunteerOpenReceipt[],
  openCents: number,
): { entryIds: string[]; amountMatch: VolunteerAmountMatch } {
  const ordered = receipts
    .slice()
    .sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime() || a.entryId.localeCompare(b.entryId));

  if (openCents === amountCents) {
    return { entryIds: ordered.map((r) => r.entryId), amountMatch: 'EXACT_ALL' };
  }
  if (amountCents > openCents || ordered.length > MAX_SUBSET_SEARCH) {
    return { entryIds: [], amountMatch: 'NONE' };
  }

  let found: string[] | null = null;
  for (let mask = 1; mask < 1 << ordered.length; mask++) {
    let sum = 0;
    for (let i = 0; i < ordered.length; i++) {
      if (mask & (1 << i)) sum += ordered[i].amountCents;
      if (sum > amountCents) break;
    }
    if (sum !== amountCents) continue;
    if (found) return { entryIds: [], amountMatch: 'NONE' }; // deux façons : on ne choisit pas
    found = ordered.filter((_, i) => mask & (1 << i)).map((r) => r.entryId);
  }
  return found
    ? { entryIds: found, amountMatch: 'EXACT_SUBSET' }
    : { entryIds: [], amountMatch: 'NONE' };
}
