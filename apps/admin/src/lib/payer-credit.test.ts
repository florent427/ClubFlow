import { describe, expect, it } from 'vitest';
import {
  buildApplyPayerCreditInput,
  depositRefundCeilingCents,
  depositRefundHowText,
  depositRefundNotice,
  manualPaymentSurplus,
  parsePersonKey,
  personKey,
  surplusPaymentNotice,
  buildPayerCreditDepositInput,
  creditUseAmountLabel,
  describeCreditUse,
  describeDepositPayments,
  emptyPayerCreditDepositForm,
  parseEurosToCents,
  type PayerCreditDepositForm,
} from './payer-credit';

function form(over: Partial<PayerCreditDepositForm> = {}): PayerCreditDepositForm {
  return {
    ...emptyPayerCreditDepositForm('Camille Titulaire', '2026-09-15'),
    amount: '50',
    ...over,
  };
}

describe('parseEurosToCents', () => {
  it('lit un montant tel qu’on l’écrit en France', () => {
    expect(parseEurosToCents('50')).toBe(5000);
    expect(parseEurosToCents('50,5')).toBe(5050);
    expect(parseEurosToCents('12,05')).toBe(1205);
    expect(parseEurosToCents(' 1 250,00 ')).toBe(125000);
    expect(parseEurosToCents('0.1')).toBe(10);
  });

  it('refuse ce qui n’est pas un montant en euros', () => {
    for (const raw of ['', 'abc', '12,345', '-5', '1e3', '12,', ',5']) {
      expect(parseEurosToCents(raw)).toBeNull();
    }
  });
});

describe('buildPayerCreditDepositInput', () => {
  it('espèces : le montant en centimes, au nom du membre, sans fiche chèque', () => {
    expect(
      buildPayerCreditDepositInput({ memberId: 'm-1' }, form({ amount: '20,50' })),
    ).toEqual({
      input: {
        memberId: 'm-1',
        amountCents: 2050,
        method: 'MANUAL_CASH',
        externalRef: null,
      },
    });
  });

  it('chèque : la référence devient le numéro, émetteur, banque et date suivent', () => {
    expect(
      buildPayerCreditDepositInput(
        { contactId: 'c-1' },
        form({
          method: 'MANUAL_CHECK',
          reference: ' 4917496 ',
          chequeBank: 'Crédit Agricole',
        }),
      ),
    ).toEqual({
      input: {
        contactId: 'c-1',
        amountCents: 5000,
        method: 'MANUAL_CHECK',
        externalRef: '4917496',
        cheque: {
          number: '4917496',
          drawerName: 'Camille Titulaire',
          bankName: 'Crédit Agricole',
          receivedOn: '2026-09-15',
        },
      },
    });
  });

  it('virement : la référence passe, sans fiche chèque même si ses champs sont remplis', () => {
    expect(
      buildPayerCreditDepositInput(
        { memberId: 'm-1' },
        form({ method: 'MANUAL_TRANSFER', reference: 'VIR-0915', chequeBank: 'Oubliée' }),
      ),
    ).toEqual({
      input: {
        memberId: 'm-1',
        amountCents: 5000,
        method: 'MANUAL_TRANSFER',
        externalRef: 'VIR-0915',
      },
    });
  });

  it('refuse un montant nul ou illisible, et s’arrête au plafond de l’API', () => {
    for (const amount of ['', '0', '0,00', 'cinquante']) {
      expect(
        buildPayerCreditDepositInput({ memberId: 'm-1' }, form({ amount })),
      ).toHaveProperty('error');
    }
    expect(
      buildPayerCreditDepositInput({ memberId: 'm-1' }, form({ amount: '10 000' })),
    ).toHaveProperty('input.amountCents', 1_000_000);
    expect(
      buildPayerCreditDepositInput({ memberId: 'm-1' }, form({ amount: '10000,01' })),
    ).toHaveProperty('error');
  });

  it('refuse un numéro de chèque trop long pour la fiche, pas une référence de virement', () => {
    const longue = '1'.repeat(31);
    expect(
      buildPayerCreditDepositInput(
        { memberId: 'm-1' },
        form({ method: 'MANUAL_CHECK', reference: longue }),
      ),
    ).toHaveProperty('error');
    expect(
      buildPayerCreditDepositInput(
        { memberId: 'm-1' },
        form({ method: 'MANUAL_TRANSFER', reference: longue }),
      ),
    ).toHaveProperty('input.externalRef', longue);
  });
});

describe('describeDepositPayments', () => {
  it('nomme le moyen de versement et sa référence', () => {
    expect(
      describeDepositPayments([
        {
          id: 'p1',
          amountCents: 5000,
          method: 'MANUAL_CHECK',
          externalRef: '4917496',
          createdAt: '2026-09-15T10:00:00.000Z',
        },
      ]),
    ).toBe('Chèque · 4917496');
    expect(
      describeDepositPayments([
        {
          id: 'p2',
          amountCents: 2000,
          method: 'MANUAL_CASH',
          externalRef: null,
          createdAt: '2026-09-15T10:00:00.000Z',
        },
      ]),
    ).toBe('Espèces');
  });
});

describe('buildApplyPayerCreditInput', () => {
  const camille = { memberId: 'm-1', contactId: null, balanceCents: 3000 };

  it('au nom du profil proposé par le serveur, en centimes', () => {
    expect(
      buildApplyPayerCreditInput({ invoiceId: 'f-1', candidate: camille, amount: '25,50', invoiceBalanceCents: 4000 }),
    ).toEqual({ input: { invoiceId: 'f-1', memberId: 'm-1', amountCents: 2550 } });
    expect(
      buildApplyPayerCreditInput({
        invoiceId: 'f-1',
        candidate: { memberId: null, contactId: 'c-1', balanceCents: 3000 },
        amount: '10',
        invoiceBalanceCents: 4000,
      }),
    ).toEqual({ input: { invoiceId: 'f-1', contactId: 'c-1', amountCents: 1000 } });
  });

  it('s’arrête au plus petit du crédit et du reste dû', () => {
    // Crédit 30 €, reste dû 40 € : 30 € au plus.
    expect(
      buildApplyPayerCreditInput({ invoiceId: 'f-1', candidate: camille, amount: '30', invoiceBalanceCents: 4000 }),
    ).toHaveProperty('input.amountCents', 3000);
    expect(
      buildApplyPayerCreditInput({ invoiceId: 'f-1', candidate: camille, amount: '30,01', invoiceBalanceCents: 4000 }),
    ).toHaveProperty('error');
    // Reste dû 20 €, crédit 30 € : 20 € au plus.
    expect(
      buildApplyPayerCreditInput({ invoiceId: 'f-1', candidate: camille, amount: '20,01', invoiceBalanceCents: 2000 }),
    ).toHaveProperty('error');
  });

  it('refuse un montant nul ou illisible', () => {
    for (const amount of ['', '0', 'tout']) {
      expect(
        buildApplyPayerCreditInput({ invoiceId: 'f-1', candidate: camille, amount, invoiceBalanceCents: 4000 }),
      ).toHaveProperty('error');
    }
  });
});

describe('utilisations du crédit', () => {
  it('dit sur quelle facture le crédit est parti, ou d’où il revient', () => {
    expect(describeCreditUse({ invoiceLabel: 'Cotisation 2026', amountCents: 4000 })).toBe(
      'Utilisé sur « Cotisation 2026 »',
    );
    expect(describeCreditUse({ invoiceLabel: 'Cotisation 2026', amountCents: -1500 })).toBe(
      'Rendu depuis « Cotisation 2026 »',
    );
  });

  it('écrit l’effet sur le crédit avec son signe', () => {
    expect(creditUseAmountLabel(4000)).toBe('−40,00 €');
    expect(creditUseAmountLabel(-1500)).toBe('+15,00 €');
  });
});

describe('depositRefundCeilingCents — rembourser une avance par carte', () => {
  it('au plus le crédit encore disponible, et au plus le remboursable de l’encaissement', () => {
    // 50 € versés, 30 € utilisés : 20 € de crédit.
    expect(depositRefundCeilingCents(5000, 2000)).toBe(2000);
    // Un premier remboursement de 40 € : 10 € restent remboursables.
    expect(depositRefundCeilingCents(1000, 2000)).toBe(1000);
  });

  it('rien quand le crédit est épuisé ou négatif', () => {
    expect(depositRefundCeilingCents(5000, 0)).toBe(0);
    expect(depositRefundCeilingCents(5000, -300)).toBe(0);
  });
});

describe('rembourser une avance hors carte (tâche 4.2)', () => {
  it('dit comment l’argent sort, selon le moyen du versement', () => {
    expect(depositRefundHowText('MANUAL_CASH')).toContain('Rendu en espèces');
    expect(depositRefundHowText('MANUAL_TRANSFER')).toContain('À rendre par virement, depuis la banque de l’encaissement');
    expect(depositRefundHowText('MANUAL_CHECK')).toContain('il est rendu à l’adhérent');
    expect(depositRefundHowText('STRIPE_CARD')).toContain('via Stripe');
    expect(depositRefundHowText('PAYER_CREDIT')).toBe('');
  });

  it('confirme ce qui a été fait, et ce qui reste à faire pour un virement', () => {
    expect(depositRefundNotice('CASH', '20,00 €')).toBe('20,00 € rendus en espèces : le remboursement et son avoir sont enregistrés.');
    expect(depositRefundNotice('CHEQUE_RETURN', '20,00 €')).toBe('Chèque de 20,00 € rendu : le remboursement et son avoir sont enregistrés.');
    for (const kind of ['TRANSFER', 'CHEQUE_PARTIAL', 'CHEQUE_DEPOSITED']) {
      expect(depositRefundNotice(kind, '15,00 €')).toBe('15,00 € à rendre par virement : le remboursement et son avoir sont enregistrés.');
    }
  });
});

describe('trop-perçu d’un encaissement (tâche 4.1)', () => {
  const base = { balanceCents: 5000, personKey: '' };

  it('rien à verser tant que le montant ne dépasse pas le reste dû', () => {
    expect(manualPaymentSurplus({ ...base, amountCents: 5000, method: 'MANUAL_CHECK' })).toEqual({ surplusCents: 0, error: null });
    expect(manualPaymentSurplus({ ...base, amountCents: 3000, method: 'MANUAL_CASH' })).toEqual({ surplusCents: 0, error: null });
  });

  it('espèces ou virement au-delà du reste dû : il faut choisir la personne', () => {
    expect(manualPaymentSurplus({ ...base, amountCents: 7000, method: 'MANUAL_CASH' })).toEqual({
      surplusCents: 2000,
      error: 'Le montant dépasse le reste dû (50,00 €) : choisissez au crédit de qui verser les 20,00 € de plus.',
    });
    expect(
      manualPaymentSurplus({ ...base, amountCents: 7000, method: 'MANUAL_TRANSFER', personKey: 'c:c-paul' }),
    ).toEqual({ surplusCents: 2000, error: null });
  });

  it('un chèque ne verse pas de surplus, même avec une personne choisie', () => {
    expect(
      manualPaymentSurplus({ ...base, amountCents: 7000, method: 'MANUAL_CHECK', personKey: 'm:m-1' }).error,
    ).toBe('Le montant dépasse le reste dû (50,00 €). Un chèque ne règle qu’une pièce : encaissez le reste dû, puis le surplus en avance.');
  });

  it('la clé d’une personne fait l’aller-retour vers les identifiants de l’API', () => {
    expect(personKey({ memberId: 'm-1', contactId: null })).toBe('m:m-1');
    expect(personKey({ memberId: null, contactId: 'c-2' })).toBe('c:c-2');
    expect(parsePersonKey('m:m-1')).toEqual({ memberId: 'm-1', contactId: null });
    expect(parsePersonKey('c:c-2')).toEqual({ memberId: null, contactId: 'c-2' });
    expect(parsePersonKey('')).toEqual({ memberId: null, contactId: null });
  });

  it('confirme la répartition', () => {
    expect(surplusPaymentNotice(5000, 2000, 'Paul Payeur')).toBe(
      '50,00 € encaissés sur la facture, 20,00 € versés au crédit de Paul Payeur.',
    );
  });
});
