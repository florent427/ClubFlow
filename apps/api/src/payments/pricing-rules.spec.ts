import { ClubPaymentMethod, PricingAdjustmentType } from '@prisma/client';
import { applyPricing } from './pricing-rules';

describe('applyPricing', () => {
  it('sans règle retourne le montant de base', () => {
    expect(applyPricing(10_000, ClubPaymentMethod.STRIPE_CARD, null)).toBe(
      10_000,
    );
  });

  it('PERCENT_BP +5 % sur 10 000 € → 10 500 €', () => {
    const rule = {
      id: '1',
      clubId: 'c',
      method: ClubPaymentMethod.STRIPE_CARD,
      adjustmentType: PricingAdjustmentType.PERCENT_BP,
      adjustmentValue: 500,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    expect(applyPricing(1_000_000, ClubPaymentMethod.STRIPE_CARD, rule)).toBe(
      1_050_000,
    );
  });

  it('FIXED_CENTS +2 € sur 100 € → 102 €', () => {
    const rule = {
      id: '1',
      clubId: 'c',
      method: ClubPaymentMethod.MANUAL_TRANSFER,
      adjustmentType: PricingAdjustmentType.FIXED_CENTS,
      adjustmentValue: 200,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    expect(
      applyPricing(10_000, ClubPaymentMethod.MANUAL_TRANSFER, rule),
    ).toBe(10_200);
  });
});
