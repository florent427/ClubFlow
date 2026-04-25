import {
  PricingRulesEngineService,
  validateRuleConfig,
  type CartLineSnapshot,
} from './pricing-rules-engine.service';
import type { PrismaService } from '../prisma/prisma.service';

interface FakeRule {
  id: string;
  clubId: string;
  pattern:
    | 'FAMILY_PROGRESSIVE'
    | 'PRODUCT_BUNDLE'
    | 'AGE_RANGE_DISCOUNT'
    | 'NEW_MEMBER_DISCOUNT'
    | 'LOYALTY_DISCOUNT';
  label: string;
  isActive: boolean;
  priority: number;
  configJson: unknown;
  createdAt: Date;
  updatedAt: Date;
}

describe('PricingRulesEngineService', () => {
  const clubId = 'club-1';
  let rules: FakeRule[];
  let svc: PricingRulesEngineService;

  function fakePrisma(): PrismaService {
    return {
      membershipPricingRule: {
        findMany: jest.fn(async () =>
          [...rules]
            .filter((r) => r.isActive)
            .sort(
              (a, b) =>
                a.priority - b.priority || a.label.localeCompare(b.label),
            ),
        ),
      },
    } as unknown as PrismaService;
  }

  beforeEach(() => {
    rules = [];
    svc = new PricingRulesEngineService(fakePrisma());
  });

  // ==========================================================================
  // FAMILY_PROGRESSIVE
  // ==========================================================================

  describe('FAMILY_PROGRESSIVE pattern', () => {
    it('applique 10/20/30% sur les cotisations en partant des moins chères (sortBy=AMOUNT_DESC)', async () => {
      // Foyer Hoarau : 4 enfants, cotisations 150 / 120 / 90 / 90
      // Le plus cher (150€) reste plein, on remise les 3 suivants
      rules.push({
        id: 'r1',
        clubId,
        pattern: 'FAMILY_PROGRESSIVE',
        label: 'Famille progressive',
        isActive: true,
        priority: 0,
        configJson: {
          tiers: [
            { rank: 2, type: 'PERCENT_BP', value: -1000 },
            { rank: 3, type: 'PERCENT_BP', value: -2000 },
            { rank: 4, type: 'PERCENT_BP', value: -3000 },
          ],
          appliesTo: ['SUBSCRIPTION'],
          sortBy: 'AMOUNT_DESC',
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      const snapshot: CartLineSnapshot[] = [
        {
          itemId: 'joseph',
          baseAmountCents: 15000,
          membershipProductId: 'p1',
          category: 'SUBSCRIPTION',
          memberId: 'm1',
          ageAtReference: 8,
        },
        {
          itemId: 'lea',
          baseAmountCents: 12000,
          membershipProductId: 'p2',
          category: 'SUBSCRIPTION',
          memberId: 'm2',
          ageAtReference: 12,
        },
        {
          itemId: 'tom',
          baseAmountCents: 9000,
          membershipProductId: 'p3',
          category: 'SUBSCRIPTION',
          memberId: 'm3',
          ageAtReference: 6,
        },
        {
          itemId: 'sarah',
          baseAmountCents: 9000,
          membershipProductId: 'p4',
          category: 'SUBSCRIPTION',
          memberId: 'm4',
          ageAtReference: 4,
        },
      ];

      const result = await svc.evaluate(clubId, snapshot);

      expect(result.errors).toHaveLength(0);
      expect(result.applications).toHaveLength(1);
      const app = result.applications[0];
      // Joseph (le plus cher) NON remisé : pas dans appliedTo
      const josephApp = app.appliedTo.find((a) => a.itemId === 'joseph');
      expect(josephApp).toBeUndefined();
      // Léa = 2e (rang 2) → -10% → -1200
      expect(app.appliedTo.find((a) => a.itemId === 'lea')?.deltaAmountCents).toBe(
        -1200,
      );
      // Tom = 3e → -20% → -1800
      expect(app.appliedTo.find((a) => a.itemId === 'tom')?.deltaAmountCents).toBe(
        -1800,
      );
      // Sarah = 4e → -30% → -2700
      expect(app.appliedTo.find((a) => a.itemId === 'sarah')?.deltaAmountCents).toBe(
        -2700,
      );
    });

    it("ne remise PAS les frais uniques (licence, dossier)", async () => {
      rules.push({
        id: 'r1',
        clubId,
        pattern: 'FAMILY_PROGRESSIVE',
        label: 'Famille',
        isActive: true,
        priority: 0,
        configJson: {
          tiers: [{ rank: 2, type: 'PERCENT_BP', value: -1000 }],
          appliesTo: ['SUBSCRIPTION'],
          sortBy: 'AMOUNT_DESC',
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      const snapshot: CartLineSnapshot[] = [
        {
          itemId: 'cot1',
          baseAmountCents: 10000,
          membershipProductId: 'p1',
          category: 'SUBSCRIPTION',
          memberId: 'm1',
          ageAtReference: 30,
        },
        {
          itemId: 'lic1',
          baseAmountCents: 5000,
          membershipProductId: null,
          category: 'ONE_TIME',
          memberId: 'm1',
          ageAtReference: 30,
        },
        {
          itemId: 'cot2',
          baseAmountCents: 8000,
          membershipProductId: 'p2',
          category: 'SUBSCRIPTION',
          memberId: 'm2',
          ageAtReference: 25,
        },
      ];

      const result = await svc.evaluate(clubId, snapshot);

      expect(result.applications).toHaveLength(1);
      const app = result.applications[0];
      // Seul cot2 (la 2e cotisation, la moins chère) doit être remisé
      expect(app.appliedTo).toHaveLength(1);
      expect(app.appliedTo[0].itemId).toBe('cot2');
      expect(app.appliedTo[0].deltaAmountCents).toBe(-800); // -10% de 8000
    });

    it("le 5e adhérent et plus reçoivent le tier max (4+)", async () => {
      rules.push({
        id: 'r1',
        clubId,
        pattern: 'FAMILY_PROGRESSIVE',
        label: 'Famille',
        isActive: true,
        priority: 0,
        configJson: {
          tiers: [
            { rank: 2, type: 'PERCENT_BP', value: -1000 },
            { rank: 3, type: 'PERCENT_BP', value: -2000 },
            { rank: 4, type: 'PERCENT_BP', value: -3000 },
          ],
          appliesTo: ['SUBSCRIPTION'],
          sortBy: 'AMOUNT_DESC',
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      const snapshot: CartLineSnapshot[] = Array.from({ length: 6 }, (_, i) => ({
        itemId: `m${i}`,
        baseAmountCents: 10000,
        membershipProductId: `p${i}`,
        category: 'SUBSCRIPTION' as const,
        memberId: `mid${i}`,
        ageAtReference: 30,
      }));
      const result = await svc.evaluate(clubId, snapshot);
      const app = result.applications[0];
      // 6 membres : 1er = plein, 2e = -10%, 3e = -20%, 4e/5e/6e = -30%
      expect(app.appliedTo).toHaveLength(5);
      const deltas = app.appliedTo.map((a) => a.deltaAmountCents);
      expect(deltas).toEqual([-1000, -2000, -3000, -3000, -3000]);
    });
  });

  // ==========================================================================
  // PRODUCT_BUNDLE
  // ==========================================================================

  describe('PRODUCT_BUNDLE pattern', () => {
    it('applique -20€ sur Cross Training quand Karaté + Cross sont présents', async () => {
      rules.push({
        id: 'r1',
        clubId,
        pattern: 'PRODUCT_BUNDLE',
        label: 'Karaté + Cross Training',
        isActive: true,
        priority: 0,
        configJson: {
          requiredProductIds: ['karate', 'cross'],
          discountAppliesToProductId: 'cross',
          discountType: 'FIXED_CENTS',
          discountValue: -2000,
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      const snapshot: CartLineSnapshot[] = [
        {
          itemId: 'item-karate',
          baseAmountCents: 30000,
          membershipProductId: 'karate',
          category: 'SUBSCRIPTION',
          memberId: 'm1',
          ageAtReference: 30,
        },
        {
          itemId: 'item-cross',
          baseAmountCents: 25000,
          membershipProductId: 'cross',
          category: 'SUBSCRIPTION',
          memberId: 'm1',
          ageAtReference: 30,
        },
      ];
      const result = await svc.evaluate(clubId, snapshot);
      expect(result.applications).toHaveLength(1);
      expect(result.applications[0].appliedTo).toHaveLength(1);
      expect(result.applications[0].appliedTo[0].itemId).toBe('item-cross');
      expect(result.applications[0].appliedTo[0].deltaAmountCents).toBe(-2000);
    });

    it("ne s'applique pas si seulement Karaté (sans Cross)", async () => {
      rules.push({
        id: 'r1',
        clubId,
        pattern: 'PRODUCT_BUNDLE',
        label: 'Bundle',
        isActive: true,
        priority: 0,
        configJson: {
          requiredProductIds: ['karate', 'cross'],
          discountAppliesToProductId: 'cross',
          discountType: 'FIXED_CENTS',
          discountValue: -2000,
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      const snapshot: CartLineSnapshot[] = [
        {
          itemId: 'item-karate',
          baseAmountCents: 30000,
          membershipProductId: 'karate',
          category: 'SUBSCRIPTION',
          memberId: 'm1',
          ageAtReference: 30,
        },
      ];
      const result = await svc.evaluate(clubId, snapshot);
      expect(result.applications).toHaveLength(0);
    });
  });

  // ==========================================================================
  // Robustesse / gestion d'erreurs
  // ==========================================================================

  describe('Robustesse', () => {
    it('ignore une règle avec configJson invalide et continue', async () => {
      rules.push({
        id: 'broken',
        clubId,
        pattern: 'FAMILY_PROGRESSIVE',
        label: 'Cassée',
        isActive: true,
        priority: 0,
        configJson: { tiers: 'not an array' }, // invalide
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      rules.push({
        id: 'good',
        clubId,
        pattern: 'FAMILY_PROGRESSIVE',
        label: 'Bonne',
        isActive: true,
        priority: 1,
        configJson: {
          tiers: [{ rank: 2, type: 'PERCENT_BP', value: -1000 }],
          appliesTo: ['SUBSCRIPTION'],
          sortBy: 'AMOUNT_DESC',
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      const snapshot: CartLineSnapshot[] = [
        {
          itemId: 'a',
          baseAmountCents: 10000,
          membershipProductId: 'p',
          category: 'SUBSCRIPTION',
          memberId: 'm1',
          ageAtReference: 30,
        },
        {
          itemId: 'b',
          baseAmountCents: 8000,
          membershipProductId: 'p2',
          category: 'SUBSCRIPTION',
          memberId: 'm2',
          ageAtReference: 25,
        },
      ];
      const result = await svc.evaluate(clubId, snapshot);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].ruleId).toBe('broken');
      expect(result.applications).toHaveLength(1);
      expect(result.applications[0].ruleId).toBe('good');
    });

    it('borne le delta à -baseAmount (pas de remise > montant)', async () => {
      rules.push({
        id: 'r1',
        clubId,
        pattern: 'PRODUCT_BUNDLE',
        label: 'Méga remise',
        isActive: true,
        priority: 0,
        configJson: {
          requiredProductIds: ['p1', 'p2'],
          discountAppliesToProductId: 'p2',
          discountType: 'FIXED_CENTS',
          discountValue: -50000, // énorme
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      const snapshot: CartLineSnapshot[] = [
        {
          itemId: 'a',
          baseAmountCents: 10000,
          membershipProductId: 'p1',
          category: 'SUBSCRIPTION',
          memberId: 'm1',
          ageAtReference: 30,
        },
        {
          itemId: 'b',
          baseAmountCents: 5000,
          membershipProductId: 'p2',
          category: 'SUBSCRIPTION',
          memberId: 'm1',
          ageAtReference: 30,
        },
      ];
      const result = await svc.evaluate(clubId, snapshot);
      // Borne basse : delta ne peut pas être < -5000
      expect(result.applications[0].appliedTo[0].deltaAmountCents).toBe(-5000);
    });
  });

  // ==========================================================================
  // validateRuleConfig (validation au save)
  // ==========================================================================

  describe('validateRuleConfig', () => {
    it('refuse FAMILY_PROGRESSIVE sans tiers', () => {
      expect(() =>
        validateRuleConfig('FAMILY_PROGRESSIVE', { tiers: [] }),
      ).toThrow();
    });

    it('refuse FAMILY_PROGRESSIVE avec rank < 2', () => {
      expect(() =>
        validateRuleConfig('FAMILY_PROGRESSIVE', {
          tiers: [{ rank: 1, type: 'PERCENT_BP', value: -1000 }],
        }),
      ).toThrow(/≥ 2/);
    });

    it('refuse PRODUCT_BUNDLE avec discountValue positif', () => {
      expect(() =>
        validateRuleConfig('PRODUCT_BUNDLE', {
          requiredProductIds: ['a', 'b'],
          discountAppliesToProductId: 'a',
          discountType: 'FIXED_CENTS',
          discountValue: 1000, // positif = invalide
        }),
      ).toThrow(/négatif/);
    });

    it("refuse PRODUCT_BUNDLE avec discountAppliesToProductId hors requiredProductIds", () => {
      expect(() =>
        validateRuleConfig('PRODUCT_BUNDLE', {
          requiredProductIds: ['a', 'b'],
          discountAppliesToProductId: 'c',
          discountType: 'FIXED_CENTS',
          discountValue: -1000,
        }),
      ).toThrow(/faire partie/);
    });

    it('accepte une config FAMILY_PROGRESSIVE valide', () => {
      const result = validateRuleConfig('FAMILY_PROGRESSIVE', {
        tiers: [
          { rank: 2, type: 'PERCENT_BP', value: -1000 },
          { rank: 3, type: 'PERCENT_BP', value: -2000 },
        ],
        appliesTo: ['SUBSCRIPTION'],
        sortBy: 'AMOUNT_DESC',
      });
      expect(result).toBeDefined();
    });
  });
});
