import { describe, expect, it } from 'vitest';
import {
  buildPayerCreditDepositInput,
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
