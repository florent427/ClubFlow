import type Stripe from 'stripe';
import { extractStripeFee } from './stripe-fees.service';

/**
 * Extraction des frais Stripe d'un PaymentIntent enrichi (Phase 2).
 *
 * Deux choses comptent ici, et une seule saute aux yeux :
 *  - savoir dire « je ne sais pas encore » sans se tromper (SEPA non dénoué) ;
 *  - ne retenir que les frais Stripe, à l'exclusion d'une future commission
 *    plateforme ClubFlow qui n'a rien à faire dans les frais bancaires du club.
 */

type FeeDetail = { type: string; amount: number };

function makePi(args: {
  charge?: 'absent' | 'string' | 'object';
  balanceTransaction?: 'absent' | 'string' | 'object';
  feeDetails?: FeeDetail[];
  currency?: string;
}): Stripe.PaymentIntent {
  const {
    charge = 'object',
    balanceTransaction = 'object',
    feeDetails = [{ type: 'stripe_fee', amount: 175 }],
    currency = 'eur',
  } = args;

  if (charge === 'absent') return { latest_charge: null } as never;
  if (charge === 'string') return { latest_charge: 'ch_123' } as never;

  const bt =
    balanceTransaction === 'absent'
      ? null
      : balanceTransaction === 'string'
        ? 'txn_123'
        : { id: 'txn_123', currency, fee_details: feeDetails };

  return { latest_charge: { balance_transaction: bt } } as never;
}

describe('extractStripeFee', () => {
  it('extrait le montant, la devise et l’identifiant de transaction', () => {
    const fee = extractStripeFee(makePi({}));

    expect(fee).toEqual({
      feeCents: 175,
      currency: 'eur',
      balanceTransactionId: 'txn_123',
    });
  });

  it('renvoie null quand la charge n’est pas encore dénouée (cas SEPA)', () => {
    // C'est le cas NOMINAL d'un prélèvement SEPA au moment du webhook de
    // succès : la balance transaction n'existe pas encore. Ce n'est pas une
    // erreur, c'est un « repasse plus tard ».
    expect(extractStripeFee(makePi({ balanceTransaction: 'absent' }))).toBeNull();
  });

  it('renvoie null si la charge ou la transaction n’est pas développée', () => {
    // Sans `expand`, Stripe ne renvoie que des identifiants. Mieux vaut ne
    // rien affirmer que de deviner un montant.
    expect(extractStripeFee(makePi({ charge: 'string' }))).toBeNull();
    expect(extractStripeFee(makePi({ balanceTransaction: 'string' }))).toBeNull();
    expect(extractStripeFee(makePi({ charge: 'absent' }))).toBeNull();
  });

  it('EXCLUT la commission plateforme du montant retenu', () => {
    // Le jour où une commission ClubFlow sera prélevée, elle apparaîtra dans
    // balance_transaction.fee. La retenir imputerait la commission de la
    // plateforme aux frais bancaires DU CLUB — sans erreur ni log.
    const fee = extractStripeFee(
      makePi({
        feeDetails: [
          { type: 'stripe_fee', amount: 175 },
          { type: 'application_fee', amount: 500 },
        ],
      }),
    );

    expect(fee?.feeCents).toBe(175);
  });

  it('additionne plusieurs lignes de frais Stripe', () => {
    const fee = extractStripeFee(
      makePi({
        feeDetails: [
          { type: 'stripe_fee', amount: 150 },
          { type: 'stripe_fee', amount: 25 },
        ],
      }),
    );

    expect(fee?.feeCents).toBe(175);
  });

  it('renvoie null si aucun frais Stripe n’est présent', () => {
    // Une transaction sans frais Stripe ne doit pas produire d'écriture à 0 €.
    expect(
      extractStripeFee(
        makePi({ feeDetails: [{ type: 'application_fee', amount: 500 }] }),
      ),
    ).toBeNull();
    expect(extractStripeFee(makePi({ feeDetails: [] }))).toBeNull();
  });

  it('ne suppose pas l’euro : conserve la devise renvoyée par Stripe', () => {
    const fee = extractStripeFee(makePi({ currency: 'usd' }));

    expect(fee?.currency).toBe('usd');
  });
});
