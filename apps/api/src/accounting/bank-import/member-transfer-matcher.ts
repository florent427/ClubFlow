import { meaningfulTokens, normalizeStatementLabel } from './categorization-rules';

/**
 * Reconnaissance d'un virement d'adhérent (ADR-0014 §7), pure et sans base.
 *
 * Un virement porte le nom du payeur : « VIR SEPA DUPONT JEAN COTISATION ».
 * On confronte ce nom aux membres et contacts du club, puis le montant aux
 * factures ouvertes de son foyer. Tant qu'un nom ne désigne qu'une personne
 * ET que le montant tombe juste, c'est proposable en un clic ; deux
 * homonymes, ou un montant qui ne colle à rien, restent à trancher à la main.
 */

export type PayerKind = 'MEMBER' | 'CONTACT';

export interface MatchablePerson {
  kind: PayerKind;
  id: string;
  firstName: string;
  lastName: string;
}

export interface MatchableInvoice {
  id: string;
  label: string;
  amountCents: number;
  /** Reste dû, avoirs et acomptes déduits. Toujours > 0 ici. */
  balanceCents: number;
  dueAt: Date | null;
  /** Personnes autorisées à payer cette facture (foyer ou groupe foyer). */
  payerIds: string[];
}

export interface TransferAllocation {
  invoiceId: string;
  amountCents: number;
}

export interface PayerCandidate {
  payer: MatchablePerson;
  /** 0 à 100 : à quel point ce payeur est reconnu dans le libellé. */
  nameScore: number;
  /** Factures que cette personne peut payer, de la plus ancienne d'abord. */
  invoices: MatchableInvoice[];
  /** Répartition qui épuise exactement le virement, quand elle existe. */
  allocations: TransferAllocation[];
  /** Comment le montant a été retrouvé. */
  amountMatch: 'EXACT' | 'SUM' | 'PARTIAL' | 'NONE';
  /** 0 à 100 : nom ET montant. Au-dessus de 80, proposable en un clic. */
  confidence: number;
}

/** Nom de famille de trois caractères, ça existe : « LY », non. */
const MIN_NAME_LENGTH = 3;
/** Au-delà, additionner des factures devient du devinement. */
const MAX_INVOICES_IN_SUM = 2;

function normalizeName(s: string): string {
  return normalizeStatementLabel(s);
}

/**
 * À quel point cette personne est nommée dans le libellé : 100 si nom et
 * prénom y sont, 70 si seul le nom de famille y est, 0 sinon. Le prénom
 * seul ne suffit jamais — « JEAN » désigne trop de monde.
 */
export function nameScore(person: MatchablePerson, labelTokens: Set<string>): number {
  const last = normalizeName(person.lastName);
  const first = normalizeName(person.firstName);
  const lastTokens = last.split(' ').filter((t) => t.length >= MIN_NAME_LENGTH);
  if (lastTokens.length === 0) return 0;
  const lastSeen = lastTokens.every((t) => labelTokens.has(t));
  if (!lastSeen) return 0;
  const firstTokens = first.split(' ').filter((t) => t.length >= MIN_NAME_LENGTH);
  const firstSeen = firstTokens.length > 0 && firstTokens.some((t) => labelTokens.has(t));
  return firstSeen ? 100 : 70;
}

/**
 * Répartition du virement sur les factures du payeur : une facture au reste
 * exact, sinon deux qui tombent juste ensemble, sinon la plus ancienne en
 * paiement partiel.
 */
export function allocate(
  amountCents: number,
  invoices: MatchableInvoice[],
): { allocations: TransferAllocation[]; amountMatch: PayerCandidate['amountMatch'] } {
  if (amountCents <= 0 || invoices.length === 0) {
    return { allocations: [], amountMatch: 'NONE' };
  }
  const exact = invoices.find((i) => i.balanceCents === amountCents);
  if (exact) {
    return {
      allocations: [{ invoiceId: exact.id, amountCents }],
      amountMatch: 'EXACT',
    };
  }
  for (let i = 0; i < invoices.length; i++) {
    for (let j = i + 1; j < Math.min(invoices.length, i + 1 + MAX_INVOICES_IN_SUM * 4); j++) {
      if (invoices[i].balanceCents + invoices[j].balanceCents === amountCents) {
        return {
          allocations: [
            { invoiceId: invoices[i].id, amountCents: invoices[i].balanceCents },
            { invoiceId: invoices[j].id, amountCents: invoices[j].balanceCents },
          ],
          amountMatch: 'SUM',
        };
      }
    }
  }
  // Paiement partiel : la plus ancienne facture absorbe ce qui arrive, à
  // condition qu'elle puisse l'absorber entièrement.
  const oldest = invoices[0];
  if (oldest.balanceCents > amountCents) {
    return {
      allocations: [{ invoiceId: oldest.id, amountCents }],
      amountMatch: 'PARTIAL',
    };
  }
  return { allocations: [], amountMatch: 'NONE' };
}

const AMOUNT_WEIGHT: Record<PayerCandidate['amountMatch'], number> = {
  EXACT: 100,
  SUM: 80,
  PARTIAL: 55,
  NONE: 0,
};

/**
 * Payeurs plausibles pour une ligne créditrice, du plus sûr au moins sûr.
 * `confidence` ne dépasse 80 que si le nom est reconnu ET le montant tombe
 * exactement ; et le premier candidat n'est proposable que s'il est SEUL à
 * ce niveau de nom — deux homonymes valent une question, pas un choix.
 */
export function matchMemberTransfer(params: {
  label: string;
  reference: string | null;
  amountCents: number;
  people: MatchablePerson[];
  /** Factures ouvertes du club, reste dû > 0. */
  invoices: MatchableInvoice[];
}): PayerCandidate[] {
  if (params.amountCents <= 0) return [];
  const tokens = new Set([
    ...meaningfulTokens(params.label),
    ...(params.reference ? meaningfulTokens(params.reference) : []),
  ]);
  if (tokens.size === 0) return [];

  const named = params.people
    .map((p) => ({ p, score: nameScore(p, tokens) }))
    .filter((x) => x.score > 0);
  if (named.length === 0) return [];

  // Un nom cité une seule fois vaut mieux qu'un nom partagé : on retient le
  // meilleur niveau de reconnaissance, et on signale l'ambiguïté par le
  // nombre de candidats rendus.
  const best = Math.max(...named.map((x) => x.score));
  const shortlist = named.filter((x) => x.score === best);
  const ambiguous = shortlist.length > 1;

  const candidates: PayerCandidate[] = shortlist.map(({ p, score }) => {
    const invoices = params.invoices
      .filter((i) => i.payerIds.includes(p.id))
      .sort(
        (a, b) =>
          (a.dueAt?.getTime() ?? Number.MAX_SAFE_INTEGER) -
            (b.dueAt?.getTime() ?? Number.MAX_SAFE_INTEGER) || a.id.localeCompare(b.id),
      );
    const { allocations, amountMatch } = allocate(params.amountCents, invoices);
    const confidence = ambiguous
      ? Math.min(60, Math.round((score + AMOUNT_WEIGHT[amountMatch]) / 2))
      : Math.round((score + AMOUNT_WEIGHT[amountMatch]) / 2);
    return { payer: p, nameScore: score, invoices, allocations, amountMatch, confidence };
  });

  return candidates.sort(
    (a, b) => b.confidence - a.confidence || b.invoices.length - a.invoices.length,
  );
}

/** Proposable en un clic : un seul payeur reconnu et un montant qui tombe juste. */
export const AUTO_PAYER_CONFIDENCE = 80;
