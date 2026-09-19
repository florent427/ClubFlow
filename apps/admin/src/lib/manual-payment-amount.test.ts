import { describe, expect, it } from 'vitest';
import {
  amountAfterMethodChange,
  initialManualPaymentAmount,
  readManualPaymentAmount,
} from './manual-payment-amount';

describe('initialManualPaymentAmount', () => {
  it('ne pré-remplit jamais un chèque : il se saisit tel qu’écrit dessus', () => {
    expect(initialManualPaymentAmount('MANUAL_CHECK', 36600)).toBe('');
  });

  it('propose le reste dû pour les espèces et le virement', () => {
    expect(initialManualPaymentAmount('MANUAL_CASH', 36600)).toBe('366.00');
    expect(initialManualPaymentAmount('MANUAL_TRANSFER', 9150)).toBe('91.50');
  });

  it('ne propose rien quand il ne reste rien à payer', () => {
    expect(initialManualPaymentAmount('MANUAL_CASH', 0)).toBe('');
  });
});

describe('amountAfterMethodChange', () => {
  it('passer au chèque vide le reste dû proposé d’office', () => {
    expect(
      amountAfterMethodChange('366.00', 'MANUAL_CASH', 'MANUAL_CHECK', 36600),
    ).toBe('');
  });

  it('passer au chèque garde un montant saisi à la main', () => {
    expect(
      amountAfterMethodChange('91.50', 'MANUAL_CASH', 'MANUAL_CHECK', 36600),
    ).toBe('91.50');
  });

  it('quitter le chèque avec un champ vide reprend le reste dû', () => {
    expect(
      amountAfterMethodChange('', 'MANUAL_CHECK', 'MANUAL_CASH', 36600),
    ).toBe('366.00');
  });

  it('quitter le chèque garde le montant du chèque déjà saisi', () => {
    expect(
      amountAfterMethodChange('91.50', 'MANUAL_CHECK', 'MANUAL_TRANSFER', 36600),
    ).toBe('91.50');
  });
});

describe('readManualPaymentAmount', () => {
  it('un chèque sans montant : l’erreur dit quoi saisir', () => {
    expect(readManualPaymentAmount('  ', 'MANUAL_CHECK')).toEqual({
      cents: null,
      error: 'Saisissez le montant du chèque, tel qu’il est écrit dessus.',
    });
  });

  it('un autre mode sans montant : erreur aussi', () => {
    expect(readManualPaymentAmount('', 'MANUAL_CASH').error).toBe(
      'Saisissez le montant encaissé.',
    );
  });

  it('lit la virgule française', () => {
    expect(readManualPaymentAmount('91,50', 'MANUAL_CHECK')).toEqual({
      cents: 9150,
      error: null,
    });
  });

  it('refuse zéro, un négatif ou du texte', () => {
    expect(readManualPaymentAmount('0', 'MANUAL_CHECK').error).toBe('Montant invalide.');
    expect(readManualPaymentAmount('-5', 'MANUAL_CASH').error).toBe('Montant invalide.');
    expect(readManualPaymentAmount('abc', 'MANUAL_CASH').error).toBe('Montant invalide.');
  });
});
