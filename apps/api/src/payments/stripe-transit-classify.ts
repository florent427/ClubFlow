/**
 * Classement des transactions de solde Stripe d'un virement (ADR-0014, lot 8).
 *
 * Stripe verse au club le net d'un lot de transactions. ClubFlow connaît
 * déjà la plupart d'entre elles : chaque encaissement a son `Payment`, chaque
 * remboursement le sien, et les commissions sont portées par
 * `stripeFeeCents`. Ce qui reste — un paiement encaissé depuis le dashboard
 * Stripe, un litige, un ajustement — n'existe nulle part dans ClubFlow.
 *
 * Ces inconnues ne sont pas une anomalie à corriger en silence : ce sont des
 * mouvements réels sur le compte de transit. Elles deviennent des lignes à
 * catégoriser, exactement comme une ligne de relevé bancaire.
 *
 * Module PUR : aucune dépendance à Stripe ni à Prisma, pour que le classement
 * se teste sans mocker ni l'un ni l'autre.
 */

export type TransitTxnKind =
  /** Le virement lui-même : il vide le solde, il n'a rien à catégoriser. */
  | 'PAYOUT'
  /** Commission Stripe, déjà portée par `stripeFeeCents` sur l'encaissement. */
  | 'FEE'
  /** Encaissement connu de ClubFlow. */
  | 'KNOWN_PAYMENT'
  /** Remboursement connu de ClubFlow. */
  | 'KNOWN_REFUND'
  /** Personne ne la connaît : elle devient une ligne à catégoriser. */
  | 'UNKNOWN';

/** Ce qu'on retient d'une transaction de solde, sans dépendre du SDK. */
export interface TransitTxn {
  id: string;
  /** `charge`, `payment`, `refund`, `payout`, `stripe_fee`, `adjustment`… */
  type: string;
  /** Ce qui a réellement bougé sur le solde Stripe, en centimes. */
  netCents: number;
  description: string | null;
  /** Horodatage Stripe, en secondes. */
  created: number;
  /** Identifiant de l'objet source (`ch_…`, `re_…`, `po_…`). */
  sourceId: string | null;
  /** Intention de paiement, quand la source est une charge dépliée. */
  paymentIntentId: string | null;
}

/** Ce que ClubFlow connaît déjà, indexé pour un classement sans requête. */
export interface KnownIndex {
  balanceTransactionIds: ReadonlySet<string>;
  paymentIntentRefs: ReadonlySet<string>;
  refundIds: ReadonlySet<string>;
}

const FEE_TYPES = new Set(['stripe_fee', 'application_fee', 'application_fee_refund']);
const PAYMENT_TYPES = new Set(['charge', 'payment']);
const REFUND_TYPES = new Set(['refund', 'payment_refund', 'payment_failure_refund']);

export function classifyTxn(txn: TransitTxn, known: KnownIndex): TransitTxnKind {
  if (txn.type === 'payout' || txn.type === 'payout_cancel' || txn.type === 'payout_failure') {
    return 'PAYOUT';
  }
  if (FEE_TYPES.has(txn.type)) return 'FEE';

  // La voie la plus sûre : l'encaissement porte l'identifiant de SA
  // transaction de solde, écrit par la récupération des frais.
  if (known.balanceTransactionIds.has(txn.id)) {
    return REFUND_TYPES.has(txn.type) ? 'KNOWN_REFUND' : 'KNOWN_PAYMENT';
  }
  if (PAYMENT_TYPES.has(txn.type)) {
    // Les frais n'ont pas encore été récupérés : on retombe sur l'intention
    // de paiement, que `externalRef` porte depuis l'encaissement.
    if (txn.paymentIntentId && known.paymentIntentRefs.has(txn.paymentIntentId)) {
      return 'KNOWN_PAYMENT';
    }
    return 'UNKNOWN';
  }
  if (REFUND_TYPES.has(txn.type)) {
    if (txn.sourceId && known.refundIds.has(txn.sourceId)) return 'KNOWN_REFUND';
    return 'UNKNOWN';
  }
  return 'UNKNOWN';
}

/**
 * Contrôle d'intégrité du virement, et il est FOURNI PAR STRIPE : la somme
 * des transactions du lot, le virement lui-même exclu, vaut exactement le
 * montant versé. Un écart veut dire qu'on n'a pas tout lu — une page
 * manquante, un filtre de trop — et non qu'une écriture est fausse.
 */
export function payoutArithmetic(
  payoutAmountCents: number,
  txns: readonly TransitTxn[],
): { sumCents: number; deltaCents: number; ok: boolean } {
  const sumCents = txns
    .filter((t) => classifyTxn(t, EMPTY_INDEX) !== 'PAYOUT')
    .reduce((s, t) => s + t.netCents, 0);
  const deltaCents = sumCents - payoutAmountCents;
  return { sumCents, deltaCents, ok: deltaCents === 0 };
}

const EMPTY_INDEX: KnownIndex = {
  balanceTransactionIds: new Set(),
  paymentIntentRefs: new Set(),
  refundIds: new Set(),
};

/** Libellé lisible pour une ligne à catégoriser. */
export function labelForTxn(txn: TransitTxn): string {
  const described = txn.description?.trim();
  if (described) return described.slice(0, 190);
  const source = txn.sourceId ? ` ${txn.sourceId}` : '';
  return `Stripe ${txn.type}${source}`.slice(0, 190);
}
