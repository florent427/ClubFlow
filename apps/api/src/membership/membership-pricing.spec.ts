import {
  computeMembershipAdjustments,
  computeOneTimeFeeAdjustments,
  computeProrataFactorBp,
  inclusiveCalendarDays,
  type MembershipPricingInput,
} from './membership-pricing';

describe('membership-pricing', () => {
  describe('inclusiveCalendarDays', () => {
    it('same day returns 1', () => {
      const d = new Date(Date.UTC(2026, 5, 15));
      expect(inclusiveCalendarDays(d, d)).toBe(1);
    });

    it('spans inclusive', () => {
      const a = new Date(Date.UTC(2026, 8, 1));
      const b = new Date(Date.UTC(2026, 8, 10));
      expect(inclusiveCalendarDays(a, b)).toBe(10);
    });
  });

  describe('computeProrataFactorBp', () => {
    const start = new Date(Date.UTC(2025, 8, 1));
    const end = new Date(Date.UTC(2026, 7, 31));

    it('full season at start', () => {
      const bp = computeProrataFactorBp(start, start, end);
      expect(bp).toBe(10_000);
    });

    it('half season roughly mid', () => {
      const mid = new Date(Date.UTC(2026, 1, 15));
      const bp = computeProrataFactorBp(mid, start, end);
      expect(bp).toBeGreaterThan(4000);
      expect(bp).toBeLessThan(6000);
    });

    it('after end returns 0', () => {
      const late = new Date(Date.UTC(2027, 0, 1));
      expect(computeProrataFactorBp(late, start, end)).toBe(0);
    });
  });

  describe('computeMembershipAdjustments', () => {
    const base: Omit<
      MembershipPricingInput,
      'publicAid' | 'exceptional'
    > = {
      baseAmountCents: 100_00,
      allowProrata: true,
      allowFamily: false,
      allowPublicAid: false,
      allowExceptional: false,
      exceptionalCapPercentBp: null,
      prorataFactorBp: 10_000,
      priorFamilyMembershipCount: 0,
      familyRule: null,
    };

    it('applies prorata only', () => {
      const { adjustments, subtotalAfterBusinessCents } =
        computeMembershipAdjustments({
          ...base,
          prorataFactorBp: 5_000,
        });
      expect(adjustments[0].type).toBe('PRORATA_SEASON');
      expect(subtotalAfterBusinessCents).toBe(50_00);
    });

    it('applies family when nth threshold reached', () => {
      const { adjustments, subtotalAfterBusinessCents } =
        computeMembershipAdjustments({
          ...base,
          allowFamily: true,
          familyRule: {
            fromNth: 2,
            adjustmentType: 'PERCENT_BP',
            adjustmentValue: -1_000,
          },
          priorFamilyMembershipCount: 1,
          prorataFactorBp: 10_000,
        });
      expect(adjustments.some((a) => a.type === 'FAMILY')).toBe(true);
      expect(subtotalAfterBusinessCents).toBe(90_00);
    });

    it('caps exceptional discount', () => {
      const { adjustments, subtotalAfterBusinessCents } =
        computeMembershipAdjustments({
          ...base,
          allowExceptional: true,
          exceptionalCapPercentBp: 500,
          exceptional: { amountCents: -80_00, reason: 'Geste' },
          prorataFactorBp: 10_000,
        });
      const ex = adjustments.find((a) => a.type === 'EXCEPTIONAL');
      expect(ex?.amountCents).toBe(-5_00);
      expect(subtotalAfterBusinessCents).toBe(95_00);
    });

    it('sans prorata (ex. cotisation mensuelle) : aucun ajustement PRORATA_SEASON', () => {
      const { adjustments } = computeMembershipAdjustments({
        ...base,
        allowProrata: false,
        allowFamily: true,
        familyRule: {
          fromNth: 2,
          adjustmentType: 'PERCENT_BP',
          adjustmentValue: -1_000,
        },
        priorFamilyMembershipCount: 1,
        prorataFactorBp: 5_000,
      });
      expect(adjustments.some((a) => a.type === 'PRORATA_SEASON')).toBe(
        false,
      );
      expect(adjustments.some((a) => a.type === 'FAMILY')).toBe(true);
    });
  });

  describe('computeOneTimeFeeAdjustments', () => {
    it('100 € + remise exceptionnelle −10 € → 90 €', () => {
      const { adjustments, subtotalAfterBusinessCents } =
        computeOneTimeFeeAdjustments({
          baseAmountCents: 100_00,
          allowExceptional: true,
          exceptionalCapPercentBp: null,
          exceptional: { amountCents: -10_00, reason: 'Geste' },
        });
      expect(adjustments).toHaveLength(1);
      expect(adjustments[0].type).toBe('EXCEPTIONAL');
      expect(subtotalAfterBusinessCents).toBe(90_00);
    });

    it('sans remise : sous-total = base', () => {
      const { adjustments, subtotalAfterBusinessCents } =
        computeOneTimeFeeAdjustments({
          baseAmountCents: 50_00,
          allowExceptional: true,
          exceptionalCapPercentBp: null,
          exceptional: undefined,
        });
      expect(adjustments).toHaveLength(0);
      expect(subtotalAfterBusinessCents).toBe(50_00);
    });
  });
});
