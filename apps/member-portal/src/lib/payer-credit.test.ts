import { describe, expect, it } from 'vitest';
import {
  payerCreditApplyCents,
  payerCreditApplyConfirmation,
  payerCreditKpi,
  payerCreditMovementTitle,
  shouldShowPayerCredit,
  signedEuroCents,
} from './payer-credit';

/** Intl sépare les milliers et l'euro par des espaces insécables. */
const texte = (s: string) => s.replace(/\s/g, ' ');

describe('shouldShowPayerCredit — jamais « 0,00 € » par défaut', () => {
  it('rien à afficher sans réponse : requête en erreur, en cours, ou module coupé', () => {
    expect(shouldShowPayerCredit(undefined)).toBe(false);
    expect(shouldShowPayerCredit(null)).toBe(false);
  });

  it('rien pour qui n’a jamais eu de crédit', () => {
    expect(shouldShowPayerCredit({ balanceCents: 0, movements: [] })).toBe(false);
  });

  it('un crédit épuisé reste visible avec son historique, un crédit négatif aussi', () => {
    const utilise = {
      paymentId: 'p-1',
      kind: 'USE' as const,
      label: 'Cotisation 2026',
      method: null,
      amountCents: -5000,
      createdAt: '2026-09-10T10:00:00Z',
    };
    expect(shouldShowPayerCredit({ balanceCents: 0, movements: [utilise] })).toBe(true);
    expect(shouldShowPayerCredit({ balanceCents: -300, movements: [] })).toBe(true);
  });
});

describe('payerCreditKpi — le solde', () => {
  it('positif : disponible ; négatif : à régulariser, sans signe moins', () => {
    expect(payerCreditKpi(3000)).toEqual({
      label: 'Crédit disponible',
      value: expect.stringMatching(/^30,00\s€$/),
      tone: 'ok',
    });
    expect(payerCreditKpi(-300)).toEqual({
      label: 'Crédit à régulariser',
      value: expect.stringMatching(/^3,00\s€$/),
      tone: 'due',
    });
    expect(payerCreditKpi(0).tone).toBe('neutral');
  });
});

describe('payerCreditApplyCents — ce que « Utiliser mon crédit » réglerait', () => {
  it('le plus petit du reste dû et du crédit', () => {
    expect(payerCreditApplyCents({ status: 'OPEN', balanceCents: 5000 }, 3000)).toBe(3000);
    expect(payerCreditApplyCents({ status: 'OPEN', balanceCents: 2000 }, 3000)).toBe(2000);
  });

  it('rien sur une facture qui n’est pas à payer', () => {
    expect(payerCreditApplyCents({ status: 'PAID', balanceCents: 0 }, 3000)).toBe(0);
    expect(payerCreditApplyCents({ status: 'DRAFT', balanceCents: 5000 }, 3000)).toBe(0);
    expect(payerCreditApplyCents({ status: 'OPEN', balanceCents: 0 }, 3000)).toBe(0);
  });

  it('rien sans crédit positif, ni tant que le crédit n’est pas connu', () => {
    expect(payerCreditApplyCents({ status: 'OPEN', balanceCents: 5000 }, 0)).toBe(0);
    expect(payerCreditApplyCents({ status: 'OPEN', balanceCents: 5000 }, -300)).toBe(0);
    expect(payerCreditApplyCents({ status: 'OPEN', balanceCents: 5000 }, undefined)).toBe(0);
  });
});

describe('payerCreditApplyConfirmation — ce que l’adhérent confirme', () => {
  it('règlement partiel : ce qui reste à payer, et le crédit après', () => {
    expect(
      texte(
        payerCreditApplyConfirmation({
          invoiceLabel: 'Cotisation 2026',
          applyCents: 3000,
          invoiceBalanceCents: 5000,
          creditBalanceCents: 3000,
        }),
      ),
    ).toBe(
      '30,00 € de « Cotisation 2026 » seront réglés avec votre crédit : il restera 20,00 € à payer, et votre crédit passera à 0,00 €.',
    );
  });

  it('au solde : la facture est soldée', () => {
    expect(
      texte(
        payerCreditApplyConfirmation({
          invoiceLabel: 'Stage',
          applyCents: 2000,
          invoiceBalanceCents: 2000,
          creditBalanceCents: 3500,
        }),
      ),
    ).toBe(
      '20,00 € de « Stage » seront réglés avec votre crédit : la facture sera soldée, et votre crédit passera à 15,00 €.',
    );
  });
});

describe('payerCreditMovementTitle et signedEuroCents — l’historique', () => {
  it('chaque mouvement dit ce qui s’est passé', () => {
    expect(payerCreditMovementTitle({ kind: 'DEPOSIT', label: 'Avance — Paul', method: 'MANUAL_CHECK' })).toBe(
      'Avance versée · Chèque',
    );
    expect(payerCreditMovementTitle({ kind: 'DEPOSIT_REFUND', label: 'Avance — Paul', method: 'MANUAL_CASH' })).toBe(
      'Avance remboursée',
    );
    expect(payerCreditMovementTitle({ kind: 'USE', label: 'Cotisation 2026', method: null })).toBe(
      'Utilisé pour « Cotisation 2026 »',
    );
    expect(payerCreditMovementTitle({ kind: 'USE_RETURN', label: 'Cotisation 2026', method: null })).toBe(
      'Rendu depuis « Cotisation 2026 »',
    );
  });

  it('le signe dit l’effet sur le crédit', () => {
    expect(texte(signedEuroCents(5000))).toBe('+50,00 €');
    expect(texte(signedEuroCents(-1250))).toBe('−12,50 €');
    expect(texte(signedEuroCents(0))).toBe('0,00 €');
  });
});
