import {
  PricingRulesEngineService,
  validateRuleConfig,
  type CartLineSnapshot,
  type EvaluationContext,
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

/**
 * Helper pour construire rapidement un snapshot de ligne dans les tests.
 * Tous les défauts pointent sur SUBSCRIPTION + ANNUAL pour le cas le
 * plus courant.
 */
function line(
  partial: Partial<CartLineSnapshot> & { itemId: string },
): CartLineSnapshot {
  return {
    itemId: partial.itemId,
    baseAmountCents: partial.baseAmountCents ?? 10000,
    membershipProductId: partial.membershipProductId ?? null,
    category: partial.category ?? 'SUBSCRIPTION',
    memberId: partial.memberId ?? `m-${partial.itemId}`,
    ageAtReference: partial.ageAtReference ?? null,
    billingRhythm: partial.billingRhythm ?? 'ANNUAL',
    prorataFactorBp: partial.prorataFactorBp ?? 10000,
  };
}

function ctx(
  cart: CartLineSnapshot[],
  prior: EvaluationContext['prior']['entries'] = [],
): EvaluationContext {
  return { cart, prior: { entries: prior } };
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
  // FAMILY_PROGRESSIVE — sans historique (tout dans le cart en cours)
  // ==========================================================================

  describe('FAMILY_PROGRESSIVE — cart sans historique', () => {
    it('applique 10/20/30 % en partant des moins chères (sortBy=AMOUNT_DESC)', async () => {
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
      const result = await svc.evaluate(
        clubId,
        ctx([
          line({ itemId: 'joseph', baseAmountCents: 15000, memberId: 'mJ' }),
          line({ itemId: 'lea', baseAmountCents: 12000, memberId: 'mL' }),
          line({ itemId: 'tom', baseAmountCents: 9000, memberId: 'mT' }),
          line({ itemId: 'sarah', baseAmountCents: 9000, memberId: 'mS' }),
        ]),
      );
      expect(result.errors).toHaveLength(0);
      expect(result.applications).toHaveLength(1);
      const app = result.applications[0];
      expect(app.appliedTo.find((a) => a.itemId === 'joseph')).toBeUndefined();
      expect(app.appliedTo.find((a) => a.itemId === 'lea')?.deltaAmountCents).toBe(
        -1200,
      );
      expect(app.appliedTo.find((a) => a.itemId === 'tom')?.deltaAmountCents).toBe(
        -1800,
      );
      expect(app.appliedTo.find((a) => a.itemId === 'sarah')?.deltaAmountCents).toBe(
        -2700,
      );
    });

    it('ne remise pas les frais uniques (ONE_TIME)', async () => {
      rules.push({
        id: 'r1',
        clubId,
        pattern: 'FAMILY_PROGRESSIVE',
        label: 'F',
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
      const result = await svc.evaluate(
        clubId,
        ctx([
          line({ itemId: 'cot1', baseAmountCents: 10000, memberId: 'm1' }),
          line({
            itemId: 'lic1',
            baseAmountCents: 5000,
            memberId: 'm1',
            category: 'ONE_TIME',
          }),
          line({ itemId: 'cot2', baseAmountCents: 8000, memberId: 'm2' }),
        ]),
      );
      const app = result.applications[0];
      expect(app.appliedTo).toHaveLength(1);
      expect(app.appliedTo[0].itemId).toBe('cot2');
    });

    it('le 5e adhérent et plus reçoivent le tier max (4+)', async () => {
      rules.push({
        id: 'r1',
        clubId,
        pattern: 'FAMILY_PROGRESSIVE',
        label: 'F',
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
      const result = await svc.evaluate(
        clubId,
        ctx(
          Array.from({ length: 6 }, (_, i) =>
            line({
              itemId: `m${i}`,
              baseAmountCents: 10000,
              memberId: `mid${i}`,
            }),
          ),
        ),
      );
      const deltas = result.applications[0].appliedTo.map(
        (a) => a.deltaAmountCents,
      );
      expect(deltas).toEqual([-1000, -2000, -3000, -3000, -3000]);
    });
  });

  // ==========================================================================
  // FAMILY_PROGRESSIVE — avec historique (rang global)
  // ==========================================================================

  describe('FAMILY_PROGRESSIVE — avec historique (projets étalés)', () => {
    it('Tom ajouté en janvier après Joseph + Léa en septembre → rang 3 = -20%', async () => {
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
      const result = await svc.evaluate(
        clubId,
        ctx(
          // Cart en cours : juste Tom (200€)
          [line({ itemId: 'tom', baseAmountCents: 20000, memberId: 'mT' })],
          // Historique : Joseph (300€) + Léa (250€) déjà facturés en septembre
          [
            {
              memberId: 'mJ',
              baseAmountCents: 30000,
              membershipProductId: 'p1',
              invoicedAt: new Date('2025-09-01'),
            },
            {
              memberId: 'mL',
              baseAmountCents: 25000,
              membershipProductId: 'p1',
              invoicedAt: new Date('2025-09-01'),
            },
          ],
        ),
      );
      // Classement global : Joseph 300 → rang 1, Léa 250 → rang 2,
      // Tom 200 → rang 3 → -20%
      const app = result.applications[0];
      expect(app.appliedTo).toHaveLength(1);
      expect(app.appliedTo[0].itemId).toBe('tom');
      expect(app.appliedTo[0].deltaAmountCents).toBe(-4000); // -20% de 200€
      expect(app.appliedTo[0].reason).toMatch(/3.{0,5}adh/);
      expect(app.appliedTo[0].reason).toMatch(/2 d[ée]j[àa] inscrits/i);
    });

    it("Sarah ajoutée 4ème, même la plus chère, prend rang 4 (factures historiques figées)", async () => {
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
      const result = await svc.evaluate(
        clubId,
        ctx(
          // Sarah arrive avec 400€ (la plus chère)
          [line({ itemId: 'sarah', baseAmountCents: 40000, memberId: 'mS' })],
          [
            {
              memberId: 'mJ',
              baseAmountCents: 30000,
              membershipProductId: 'p1',
              invoicedAt: new Date('2025-09-01'),
            },
            {
              memberId: 'mL',
              baseAmountCents: 25000,
              membershipProductId: 'p1',
              invoicedAt: new Date('2025-09-01'),
            },
            {
              memberId: 'mT',
              baseAmountCents: 20000,
              membershipProductId: 'p1',
              invoicedAt: new Date('2026-01-15'),
            },
          ],
        ),
      );
      // Classement global par AMOUNT_DESC : Sarah 400 → rang 1, Joseph 300 →
      // rang 2, Léa 250 → rang 3, Tom 200 → rang 4. Sarah étant rang 1,
      // ne reçoit aucune remise (et les anciennes factures restent figées).
      // Aucune application n'est ajoutée au résultat (filtre length>0).
      expect(result.applications).toHaveLength(0);
    });
  });

  // ==========================================================================
  // PRODUCT_BUNDLE — primary + secondary + remises annuel/mensuel
  // ==========================================================================

  describe('PRODUCT_BUNDLE — nouveau schéma', () => {
    it('Karaté + Cross Training en annuel → -20€ sur Cross', async () => {
      rules.push({
        id: 'r1',
        clubId,
        pattern: 'PRODUCT_BUNDLE',
        label: 'Karaté + Cross',
        isActive: true,
        priority: 0,
        configJson: {
          primaryProductId: 'karate',
          secondaryProductId: 'cross',
          discountForAnnual: { type: 'FIXED_CENTS', value: -2000 },
          discountForMonthly: { type: 'FIXED_CENTS', value: -200 },
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      const result = await svc.evaluate(
        clubId,
        ctx([
          line({
            itemId: 'k1',
            baseAmountCents: 30000,
            membershipProductId: 'karate',
            memberId: 'm1',
            billingRhythm: 'ANNUAL',
          }),
          line({
            itemId: 'c1',
            baseAmountCents: 25000,
            membershipProductId: 'cross',
            memberId: 'm1',
            billingRhythm: 'ANNUAL',
          }),
        ]),
      );
      const app = result.applications[0];
      expect(app.appliedTo).toHaveLength(1);
      expect(app.appliedTo[0].itemId).toBe('c1');
      expect(app.appliedTo[0].deltaAmountCents).toBe(-2000);
      expect(app.appliedTo[0].reason).toMatch(/annuel/);
    });

    it('Karaté + Cross Training en mensuel → -2€ sur Cross', async () => {
      rules.push({
        id: 'r1',
        clubId,
        pattern: 'PRODUCT_BUNDLE',
        label: 'Karaté + Cross',
        isActive: true,
        priority: 0,
        configJson: {
          primaryProductId: 'karate',
          secondaryProductId: 'cross',
          discountForAnnual: { type: 'FIXED_CENTS', value: -2000 },
          discountForMonthly: { type: 'FIXED_CENTS', value: -200 },
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      const result = await svc.evaluate(
        clubId,
        ctx([
          line({
            itemId: 'k1',
            baseAmountCents: 3000,
            membershipProductId: 'karate',
            memberId: 'm1',
            billingRhythm: 'MONTHLY',
          }),
          line({
            itemId: 'c1',
            baseAmountCents: 2500,
            membershipProductId: 'cross',
            memberId: 'm1',
            billingRhythm: 'MONTHLY',
          }),
        ]),
      );
      const app = result.applications[0];
      expect(app.appliedTo).toHaveLength(1);
      expect(app.appliedTo[0].deltaAmountCents).toBe(-200);
      expect(app.appliedTo[0].reason).toMatch(/mensuel/);
    });

    it("primary acheté dans projet précédent → secondary du nouveau projet bénéficie quand même", async () => {
      rules.push({
        id: 'r1',
        clubId,
        pattern: 'PRODUCT_BUNDLE',
        label: 'Karaté + Cross',
        isActive: true,
        priority: 0,
        configJson: {
          primaryProductId: 'karate',
          secondaryProductId: 'cross',
          discountForAnnual: { type: 'FIXED_CENTS', value: -2000 },
          discountForMonthly: { type: 'FIXED_CENTS', value: -200 },
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      const result = await svc.evaluate(
        clubId,
        ctx(
          // Cart : juste Cross (Cross ajouté en janvier)
          [
            line({
              itemId: 'c1',
              baseAmountCents: 25000,
              membershipProductId: 'cross',
              memberId: 'm1',
              billingRhythm: 'ANNUAL',
            }),
          ],
          // Historique : Karaté facturé en septembre
          [
            {
              memberId: 'm1',
              baseAmountCents: 30000,
              membershipProductId: 'karate',
              invoicedAt: new Date('2025-09-01'),
            },
          ],
        ),
      );
      const app = result.applications[0];
      expect(app.appliedTo).toHaveLength(1);
      expect(app.appliedTo[0].itemId).toBe('c1');
      expect(app.appliedTo[0].deltaAmountCents).toBe(-2000);
    });

    it("ne s'applique pas si primary absent du cart ET de l'historique", async () => {
      rules.push({
        id: 'r1',
        clubId,
        pattern: 'PRODUCT_BUNDLE',
        label: 'Bundle',
        isActive: true,
        priority: 0,
        configJson: {
          primaryProductId: 'karate',
          secondaryProductId: 'cross',
          discountForAnnual: { type: 'FIXED_CENTS', value: -2000 },
          discountForMonthly: { type: 'FIXED_CENTS', value: -200 },
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      const result = await svc.evaluate(
        clubId,
        ctx([
          line({
            itemId: 'c1',
            baseAmountCents: 25000,
            membershipProductId: 'cross',
            memberId: 'm1',
            billingRhythm: 'ANNUAL',
          }),
        ]),
      );
      expect(result.applications).toHaveLength(0);
    });
  });

  // ==========================================================================
  // PRODUCT_BUNDLE — multi-primary (OR sémantique)
  // ==========================================================================

  describe('PRODUCT_BUNDLE — multi-primary OR', () => {
    it('déclenche si AU MOINS UN primary est présent (OR)', async () => {
      rules.push({
        id: 'r1',
        clubId,
        pattern: 'PRODUCT_BUNDLE',
        label: 'Tout art martial + Cross',
        isActive: true,
        priority: 0,
        configJson: {
          primaryProductIds: ['karate', 'judo', 'taichi'],
          secondaryProductId: 'cross',
          discountForAnnual: { type: 'FIXED_CENTS', value: -2000 },
          discountForMonthly: { type: 'FIXED_CENTS', value: -200 },
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      // Adhérent prend Judo + Cross : suffit pour déclencher (OR)
      const result = await svc.evaluate(
        clubId,
        ctx([
          line({
            itemId: 'judo1',
            baseAmountCents: 30000,
            membershipProductId: 'judo',
            memberId: 'm1',
          }),
          line({
            itemId: 'cross1',
            baseAmountCents: 25000,
            membershipProductId: 'cross',
            memberId: 'm1',
          }),
        ]),
      );
      expect(result.applications).toHaveLength(1);
      expect(result.applications[0].appliedTo[0].itemId).toBe('cross1');
      expect(result.applications[0].appliedTo[0].deltaAmountCents).toBe(-2000);
    });

    it("ne déclenche pas si AUCUN primary présent", async () => {
      rules.push({
        id: 'r1',
        clubId,
        pattern: 'PRODUCT_BUNDLE',
        label: 'Bundle',
        isActive: true,
        priority: 0,
        configJson: {
          primaryProductIds: ['karate', 'judo'],
          secondaryProductId: 'cross',
          discountForAnnual: { type: 'FIXED_CENTS', value: -2000 },
          discountForMonthly: { type: 'FIXED_CENTS', value: -200 },
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      const result = await svc.evaluate(
        clubId,
        ctx([
          line({
            itemId: 'cross1',
            baseAmountCents: 25000,
            membershipProductId: 'cross',
            memberId: 'm1',
          }),
        ]),
      );
      expect(result.applications).toHaveLength(0);
    });

    it("rétrocompat : ancien schéma `primaryProductId` singulier accepté", async () => {
      rules.push({
        id: 'r1',
        clubId,
        pattern: 'PRODUCT_BUNDLE',
        label: 'Legacy bundle',
        isActive: true,
        priority: 0,
        configJson: {
          primaryProductId: 'karate', // ancien format
          secondaryProductId: 'cross',
          discountForAnnual: { type: 'FIXED_CENTS', value: -2000 },
          discountForMonthly: { type: 'FIXED_CENTS', value: -200 },
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      const result = await svc.evaluate(
        clubId,
        ctx([
          line({
            itemId: 'k1',
            baseAmountCents: 30000,
            membershipProductId: 'karate',
            memberId: 'm1',
          }),
          line({
            itemId: 'c1',
            baseAmountCents: 25000,
            membershipProductId: 'cross',
            memberId: 'm1',
          }),
        ]),
      );
      expect(result.applications).toHaveLength(1);
    });
  });

  // ==========================================================================
  // Prorata sur remises FIXED_CENTS
  // ==========================================================================

  describe('Prorata sur remises FIXED_CENTS', () => {
    it('applique le prorata aux remises FIXED_CENTS', async () => {
      rules.push({
        id: 'r1',
        clubId,
        pattern: 'PRODUCT_BUNDLE',
        label: 'Bundle',
        isActive: true,
        priority: 0,
        configJson: {
          primaryProductIds: ['karate'],
          secondaryProductId: 'cross',
          discountForAnnual: { type: 'FIXED_CENTS', value: -2000 },
          discountForMonthly: { type: 'FIXED_CENTS', value: -200 },
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      // Cross facturé à 60% (prorata) : tarif 250€ → 150€
      const result = await svc.evaluate(
        clubId,
        ctx([
          line({
            itemId: 'k1',
            baseAmountCents: 30000,
            membershipProductId: 'karate',
            memberId: 'm1',
          }),
          line({
            itemId: 'c1',
            baseAmountCents: 15000, // déjà post-prorata (250 × 0.6)
            membershipProductId: 'cross',
            memberId: 'm1',
            prorataFactorBp: 6000, // 60%
          }),
        ]),
      );
      // Remise -20€ × 60% = -12€
      expect(result.applications[0].appliedTo[0].deltaAmountCents).toBe(-1200);
    });

    it("PERCENT_BP n'est PAS modifié par le prorata (calcul naturel)", async () => {
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
      const result = await svc.evaluate(
        clubId,
        ctx([
          line({
            itemId: 'a',
            baseAmountCents: 30000, // 100% (déjà payé plein)
            memberId: 'm1',
            prorataFactorBp: 10000,
          }),
          line({
            itemId: 'b',
            baseAmountCents: 12000, // 60% de 20000
            memberId: 'm2',
            prorataFactorBp: 6000,
          }),
        ]),
      );
      // -10% de 12000 = -1200 (pas double prorata)
      expect(
        result.applications[0].appliedTo.find((a) => a.itemId === 'b')
          ?.deltaAmountCents,
      ).toBe(-1200);
    });
  });

  // ==========================================================================
  // Robustesse
  // ==========================================================================

  describe('Robustesse', () => {
    it('ignore une règle avec configJson invalide et continue les autres', async () => {
      rules.push({
        id: 'broken',
        clubId,
        pattern: 'FAMILY_PROGRESSIVE',
        label: 'Cassée',
        isActive: true,
        priority: 0,
        configJson: { tiers: 'not an array' },
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
      const result = await svc.evaluate(
        clubId,
        ctx([
          line({ itemId: 'a', baseAmountCents: 10000, memberId: 'm1' }),
          line({ itemId: 'b', baseAmountCents: 8000, memberId: 'm2' }),
        ]),
      );
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].ruleId).toBe('broken');
      expect(result.applications).toHaveLength(1);
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
          primaryProductId: 'p1',
          secondaryProductId: 'p2',
          discountForAnnual: { type: 'FIXED_CENTS', value: -50000 },
          discountForMonthly: { type: 'FIXED_CENTS', value: -1000 },
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      const result = await svc.evaluate(
        clubId,
        ctx([
          line({
            itemId: 'a',
            baseAmountCents: 10000,
            membershipProductId: 'p1',
            memberId: 'm1',
          }),
          line({
            itemId: 'b',
            baseAmountCents: 5000,
            membershipProductId: 'p2',
            memberId: 'm1',
          }),
        ]),
      );
      expect(result.applications[0].appliedTo[0].deltaAmountCents).toBe(-5000);
    });
  });

  // ==========================================================================
  // validateRuleConfig
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

    it('PRODUCT_BUNDLE refuse primary == secondary (singulier)', () => {
      expect(() =>
        validateRuleConfig('PRODUCT_BUNDLE', {
          primaryProductId: 'a',
          secondaryProductId: 'a',
          discountForAnnual: { type: 'FIXED_CENTS', value: -1000 },
          discountForMonthly: { type: 'FIXED_CENTS', value: -100 },
        }),
      ).toThrow(/secondaryProductId.*primaryProductIds/);
    });

    it("PRODUCT_BUNDLE refuse secondary inclus dans primaryProductIds[]", () => {
      expect(() =>
        validateRuleConfig('PRODUCT_BUNDLE', {
          primaryProductIds: ['a', 'b'],
          secondaryProductId: 'a',
          discountForAnnual: { type: 'FIXED_CENTS', value: -1000 },
          discountForMonthly: { type: 'FIXED_CENTS', value: -100 },
        }),
      ).toThrow(/secondaryProductId.*primaryProductIds/);
    });

    it('PRODUCT_BUNDLE accepte multi-primary[]', () => {
      expect(() =>
        validateRuleConfig('PRODUCT_BUNDLE', {
          primaryProductIds: ['karate', 'judo', 'taichi'],
          secondaryProductId: 'cross',
          discountForAnnual: { type: 'FIXED_CENTS', value: -2000 },
          discountForMonthly: { type: 'FIXED_CENTS', value: -200 },
        }),
      ).not.toThrow();
    });

    it('PRODUCT_BUNDLE refuse une remise positive', () => {
      expect(() =>
        validateRuleConfig('PRODUCT_BUNDLE', {
          primaryProductId: 'a',
          secondaryProductId: 'b',
          discountForAnnual: { type: 'FIXED_CENTS', value: 1000 },
          discountForMonthly: { type: 'FIXED_CENTS', value: -100 },
        }),
      ).toThrow(/négatif/);
    });

    it('PRODUCT_BUNDLE valide avec annuel + mensuel séparés', () => {
      expect(() =>
        validateRuleConfig('PRODUCT_BUNDLE', {
          primaryProductId: 'karate',
          secondaryProductId: 'cross',
          discountForAnnual: { type: 'FIXED_CENTS', value: -2000 },
          discountForMonthly: { type: 'FIXED_CENTS', value: -200 },
        }),
      ).not.toThrow();
    });
  });
});
