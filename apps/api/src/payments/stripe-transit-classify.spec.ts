import {
  classifyTxn,
  labelForTxn,
  payoutArithmetic,
  type KnownIndex,
  type TransitTxn,
} from './stripe-transit-classify';

/**
 * Ce que le classement doit garantir : rien de connu ne devient une ligne à
 * catégoriser (sinon le trésorier voit double), et rien d'inconnu ne passe
 * à la trappe (sinon le transit dérive en silence).
 */

function txn(over: Partial<TransitTxn> = {}): TransitTxn {
  return {
    id: 'txn_1',
    type: 'charge',
    netCents: 1800,
    description: null,
    created: 1_760_000_000,
    sourceId: 'ch_1',
    paymentIntentId: 'pi_1',
    ...over,
  };
}

function index(over: Partial<Record<keyof KnownIndex, string[]>> = {}): KnownIndex {
  return {
    balanceTransactionIds: new Set(over.balanceTransactionIds ?? []),
    paymentIntentRefs: new Set(over.paymentIntentRefs ?? []),
    refundIds: new Set(over.refundIds ?? []),
  };
}

describe('classifyTxn', () => {
  it('reconnaît un encaissement par sa transaction de solde', () => {
    const known = index({ balanceTransactionIds: ['txn_1'] });
    expect(classifyTxn(txn(), known)).toBe('KNOWN_PAYMENT');
  });

  it('reconnaît un encaissement dont les frais ne sont pas encore récupérés', () => {
    // `stripeBalanceTransactionId` est encore nul : seule l'intention de
    // paiement rattache la transaction à l'encaissement.
    const known = index({ paymentIntentRefs: ['pi_1'] });
    expect(classifyTxn(txn(), known)).toBe('KNOWN_PAYMENT');
  });

  it('tient pour inconnu un encaissement qui ne correspond à rien', () => {
    expect(classifyTxn(txn(), index())).toBe('UNKNOWN');
  });

  it('tient pour inconnu un paiement encaissé depuis le dashboard Stripe', () => {
    // Pas d'intention connue, pas de transaction connue : c'est exactement
    // le cas que le lot 8 doit faire remonter.
    const t = txn({ id: 'txn_dash', paymentIntentId: 'pi_dashboard' });
    expect(classifyTxn(t, index({ paymentIntentRefs: ['pi_1'] }))).toBe('UNKNOWN');
  });

  it('reconnaît un remboursement par son identifiant', () => {
    const t = txn({ type: 'refund', sourceId: 're_1', netCents: -4000, paymentIntentId: null });
    expect(classifyTxn(t, index({ refundIds: ['re_1'] }))).toBe('KNOWN_REFUND');
  });

  it('tient pour inconnu un remboursement fait depuis le dashboard Stripe', () => {
    const t = txn({ type: 'refund', sourceId: 're_ailleurs', netCents: -4000, paymentIntentId: null });
    expect(classifyTxn(t, index({ refundIds: ['re_1'] }))).toBe('UNKNOWN');
  });

  it('classe un remboursement connu par sa transaction de solde comme remboursement', () => {
    // Et non comme encaissement : le type prime sur le chemin de
    // reconnaissance.
    const t = txn({ type: 'refund', netCents: -4000 });
    expect(classifyTxn(t, index({ balanceTransactionIds: ['txn_1'] }))).toBe('KNOWN_REFUND');
  });

  it.each(['stripe_fee', 'application_fee', 'application_fee_refund'])(
    'laisse la commission %s aux frais déjà portés par l’encaissement',
    (type) => {
      expect(classifyTxn(txn({ type, netCents: -175 }), index())).toBe('FEE');
    },
  );

  it.each(['payout', 'payout_cancel', 'payout_failure'])('reconnaît le virement %s', (type) => {
    expect(classifyTxn(txn({ type, sourceId: 'po_1', netCents: -10000 }), index())).toBe('PAYOUT');
  });

  it('tient pour inconnu un type jamais vu, plutôt que de l’ignorer', () => {
    // Un litige, un ajustement, un transfert : on ne sait pas, donc on le
    // montre. Le silence ferait dériver le transit.
    expect(classifyTxn(txn({ type: 'adjustment', netCents: -1500 }), index())).toBe('UNKNOWN');
  });
});

describe('payoutArithmetic', () => {
  it('accepte un lot dont les transactions font exactement le virement', () => {
    const txns = [
      txn({ id: 't1', netCents: 1800 }),
      txn({ id: 't2', netCents: 3350 }),
      txn({ id: 'tp', type: 'payout', netCents: -5150 }),
    ];
    expect(payoutArithmetic(5150, txns)).toEqual({ sumCents: 5150, deltaCents: 0, ok: true });
  });

  it('signale un écart quand il manque une transaction', () => {
    const txns = [txn({ id: 't1', netCents: 1800 }), txn({ id: 'tp', type: 'payout', netCents: -5150 })];
    expect(payoutArithmetic(5150, txns)).toMatchObject({ deltaCents: -3350, ok: false });
  });

  it('ne compte pas le virement lui-même dans la somme', () => {
    // Sinon la somme serait nulle et le contrôle ne dirait jamais rien.
    const txns = [txn({ id: 't1', netCents: 5150 }), txn({ id: 'tp', type: 'payout', netCents: -5150 })];
    expect(payoutArithmetic(5150, txns).sumCents).toBe(5150);
  });

  it('compte un remboursement en négatif', () => {
    const txns = [
      txn({ id: 't1', netCents: 5000 }),
      txn({ id: 't2', type: 'refund', sourceId: 're_1', netCents: -1000 }),
      txn({ id: 'tp', type: 'payout', netCents: -4000 }),
    ];
    expect(payoutArithmetic(4000, txns).ok).toBe(true);
  });
});

describe('labelForTxn', () => {
  it('reprend la description Stripe quand il y en a une', () => {
    expect(labelForTxn(txn({ description: 'Cotisation 2026' }))).toBe('Cotisation 2026');
  });

  it('à défaut, dit le type et la source : mieux vaut ça qu’une ligne muette', () => {
    expect(labelForTxn(txn({ description: '  ', type: 'adjustment', sourceId: 'adj_1' }))).toBe(
      'Stripe adjustment adj_1',
    );
  });

  it('tronque au format de la colonne', () => {
    expect(labelForTxn(txn({ description: 'x'.repeat(400) })).length).toBe(190);
  });
});
