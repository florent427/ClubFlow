import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import {
  MembershipPricingRulePattern,
  PricingAdjustmentType,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

// ============================================================================
// Types des configs par pattern
// ============================================================================

/**
 * Config d'une règle FAMILY_PROGRESSIVE — grille de remises selon le rang
 * du membre dans le foyer (2e, 3e, 4e+).
 *
 * `appliesTo: ["SUBSCRIPTION"]` = uniquement aux cotisations (pas aux
 * frais uniques type licence/dossier).
 *
 * `sortBy: "AMOUNT_DESC"` = on trie les cotisations par montant
 * décroissant et on applique les remises sur les rangs suivants — la
 * plus chère reste pleine, les moins chères sont remisées (mathématique
 * favorable au foyer).
 */
export interface FamilyProgressiveConfig {
  tiers: Array<{
    /** Rang du membre dans le foyer (≥ 2 ; 4 = "4e ET PLUS"). */
    rank: number;
    type: 'PERCENT_BP' | 'FIXED_CENTS';
    /** Valeur signée. Négatif = remise. Ex -1000 = -10 %. */
    value: number;
  }>;
  /** Toujours `["SUBSCRIPTION"]` en v1 ; on garde pour extensibilité. */
  appliesTo: Array<'SUBSCRIPTION'>;
  sortBy: 'AMOUNT_DESC' | 'AMOUNT_ASC' | 'AGE_DESC' | 'AGE_ASC';
}

/**
 * Config d'une règle PRODUCT_BUNDLE — si TOUS les `requiredProductIds`
 * sont présents dans le cart (au niveau foyer), applique la remise sur
 * `discountAppliesToProductId`.
 *
 * Ex Karaté + Cross Training = -20 € sur Cross Training :
 * ```
 * { requiredProductIds: [karateId, crossId], discountAppliesToProductId: crossId,
 *   discountType: "FIXED_CENTS", discountValue: -2000 }
 * ```
 */
export interface ProductBundleConfig {
  requiredProductIds: string[];
  discountAppliesToProductId: string;
  discountType: 'PERCENT_BP' | 'FIXED_CENTS';
  /** Valeur signée. Négatif = remise. */
  discountValue: number;
}

export interface AgeRangeDiscountConfig {
  /** Inclusif. */
  minAge?: number | null;
  /** Inclusif. */
  maxAge?: number | null;
  discountType: 'PERCENT_BP' | 'FIXED_CENTS';
  discountValue: number;
}

export interface NewMemberDiscountConfig {
  discountType: 'PERCENT_BP' | 'FIXED_CENTS';
  discountValue: number;
}

export interface LoyaltyDiscountConfig {
  /** Nombre minimum d'années consécutives. */
  minYears: number;
  discountType: 'PERCENT_BP' | 'FIXED_CENTS';
  discountValue: number;
}

export type PricingRuleConfig =
  | FamilyProgressiveConfig
  | ProductBundleConfig
  | AgeRangeDiscountConfig
  | NewMemberDiscountConfig
  | LoyaltyDiscountConfig;

// ============================================================================
// Validation runtime des configs (équivalent Zod sans la dépendance)
// ============================================================================

/**
 * Vérifie que `value` correspond bien au schéma attendu pour le `pattern`.
 * Throw `BadRequestException` détaillée si invalide. Utilisé au moment
 * du save côté admin.
 */
export function validateRuleConfig(
  pattern: MembershipPricingRulePattern,
  value: unknown,
): PricingRuleConfig {
  if (typeof value !== 'object' || value === null) {
    throw new BadRequestException('configJson doit être un objet');
  }
  const v = value as Record<string, unknown>;

  switch (pattern) {
    case MembershipPricingRulePattern.FAMILY_PROGRESSIVE: {
      if (!Array.isArray(v.tiers) || v.tiers.length === 0) {
        throw new BadRequestException(
          'tiers doit être un array non-vide (au moins 1 palier)',
        );
      }
      const tiers = v.tiers as unknown[];
      const validatedTiers = tiers.map((t, idx) => {
        if (typeof t !== 'object' || t === null)
          throw new BadRequestException(`tiers[${idx}] doit être un objet`);
        const tt = t as Record<string, unknown>;
        if (typeof tt.rank !== 'number' || tt.rank < 2)
          throw new BadRequestException(
            `tiers[${idx}].rank doit être ≥ 2 (le 1er adhérent paie plein tarif)`,
          );
        if (tt.type !== 'PERCENT_BP' && tt.type !== 'FIXED_CENTS')
          throw new BadRequestException(
            `tiers[${idx}].type doit être PERCENT_BP ou FIXED_CENTS`,
          );
        if (typeof tt.value !== 'number')
          throw new BadRequestException(
            `tiers[${idx}].value doit être un nombre`,
          );
        if (tt.type === 'PERCENT_BP' && (tt.value < -10000 || tt.value > 0))
          throw new BadRequestException(
            `tiers[${idx}].value en PERCENT_BP doit être entre -10000 (=-100%) et 0 (=0%)`,
          );
        return {
          rank: tt.rank,
          type: tt.type as 'PERCENT_BP' | 'FIXED_CENTS',
          value: tt.value,
        };
      });
      const appliesTo = Array.isArray(v.appliesTo)
        ? (v.appliesTo as string[])
        : ['SUBSCRIPTION'];
      const sortBy =
        v.sortBy === 'AMOUNT_ASC' ||
        v.sortBy === 'AMOUNT_DESC' ||
        v.sortBy === 'AGE_ASC' ||
        v.sortBy === 'AGE_DESC'
          ? v.sortBy
          : 'AMOUNT_DESC';
      return {
        tiers: validatedTiers,
        appliesTo: appliesTo.filter(
          (a) => a === 'SUBSCRIPTION',
        ) as Array<'SUBSCRIPTION'>,
        sortBy,
      };
    }

    case MembershipPricingRulePattern.PRODUCT_BUNDLE: {
      if (
        !Array.isArray(v.requiredProductIds) ||
        v.requiredProductIds.length < 2
      ) {
        throw new BadRequestException(
          'requiredProductIds doit contenir au moins 2 produits (sinon le pattern n’a pas de sens)',
        );
      }
      const requiredIds = (v.requiredProductIds as unknown[]).map((id, idx) => {
        if (typeof id !== 'string')
          throw new BadRequestException(
            `requiredProductIds[${idx}] doit être une chaîne UUID`,
          );
        return id;
      });
      if (typeof v.discountAppliesToProductId !== 'string') {
        throw new BadRequestException(
          'discountAppliesToProductId requis (UUID du produit cible)',
        );
      }
      if (!requiredIds.includes(v.discountAppliesToProductId)) {
        throw new BadRequestException(
          'discountAppliesToProductId doit faire partie de requiredProductIds',
        );
      }
      if (
        v.discountType !== 'PERCENT_BP' &&
        v.discountType !== 'FIXED_CENTS'
      )
        throw new BadRequestException(
          'discountType doit être PERCENT_BP ou FIXED_CENTS',
        );
      if (typeof v.discountValue !== 'number' || v.discountValue >= 0)
        throw new BadRequestException(
          'discountValue doit être un nombre négatif (remise)',
        );
      return {
        requiredProductIds: requiredIds,
        discountAppliesToProductId: v.discountAppliesToProductId,
        discountType: v.discountType as 'PERCENT_BP' | 'FIXED_CENTS',
        discountValue: v.discountValue,
      };
    }

    case MembershipPricingRulePattern.AGE_RANGE_DISCOUNT: {
      const minAge =
        typeof v.minAge === 'number'
          ? v.minAge
          : v.minAge === null
            ? null
            : null;
      const maxAge =
        typeof v.maxAge === 'number'
          ? v.maxAge
          : v.maxAge === null
            ? null
            : null;
      if (
        v.discountType !== 'PERCENT_BP' &&
        v.discountType !== 'FIXED_CENTS'
      )
        throw new BadRequestException('discountType invalide');
      if (typeof v.discountValue !== 'number' || v.discountValue >= 0)
        throw new BadRequestException(
          'discountValue doit être un nombre négatif',
        );
      return {
        minAge,
        maxAge,
        discountType: v.discountType as 'PERCENT_BP' | 'FIXED_CENTS',
        discountValue: v.discountValue,
      };
    }

    case MembershipPricingRulePattern.NEW_MEMBER_DISCOUNT: {
      if (
        v.discountType !== 'PERCENT_BP' &&
        v.discountType !== 'FIXED_CENTS'
      )
        throw new BadRequestException('discountType invalide');
      if (typeof v.discountValue !== 'number' || v.discountValue >= 0)
        throw new BadRequestException(
          'discountValue doit être un nombre négatif',
        );
      return {
        discountType: v.discountType as 'PERCENT_BP' | 'FIXED_CENTS',
        discountValue: v.discountValue,
      };
    }

    case MembershipPricingRulePattern.LOYALTY_DISCOUNT: {
      if (typeof v.minYears !== 'number' || v.minYears < 1)
        throw new BadRequestException('minYears doit être ≥ 1');
      if (
        v.discountType !== 'PERCENT_BP' &&
        v.discountType !== 'FIXED_CENTS'
      )
        throw new BadRequestException('discountType invalide');
      if (typeof v.discountValue !== 'number' || v.discountValue >= 0)
        throw new BadRequestException(
          'discountValue doit être un nombre négatif',
        );
      return {
        minYears: v.minYears,
        discountType: v.discountType as 'PERCENT_BP' | 'FIXED_CENTS',
        discountValue: v.discountValue,
      };
    }

    default: {
      const exhaustive: never = pattern;
      throw new BadRequestException(`Pattern non supporté : ${exhaustive}`);
    }
  }
}

// ============================================================================
// Contexte d'évaluation et résultat
// ============================================================================

/**
 * Snapshot d'une ligne de cart pour l'évaluation des règles. Reste
 * découplé du modèle Prisma pour faciliter les tests unitaires.
 */
export interface CartLineSnapshot {
  /** ID stable pour identifier la ligne dans le résultat. */
  itemId: string;
  /** Montant de base (cotisation ou frais). */
  baseAmountCents: number;
  /** ID du produit lié (pour PRODUCT_BUNDLE). Null pour frais uniques. */
  membershipProductId: string | null;
  /** Catégorie : SUBSCRIPTION (cotisation) ou ONE_TIME (licence/dossier). */
  category: 'SUBSCRIPTION' | 'ONE_TIME';
  /** Membre concerné (pour rang famille, âge…). */
  memberId: string;
  /** Âge à la date de référence (souvent début de saison). */
  ageAtReference: number | null;
}

export interface RuleApplication {
  ruleId: string;
  ruleLabel: string;
  pattern: MembershipPricingRulePattern;
  /** Lignes affectées et delta appliqué. */
  appliedTo: Array<{
    itemId: string;
    deltaAmountCents: number;
    /** Description lisible de la remise pour l'UI/audit. */
    reason: string;
  }>;
}

export interface EvaluationResult {
  /** Lignes finales avec adjustments à persister sur InvoiceLineAdjustment. */
  applications: RuleApplication[];
  /** Erreurs de validation runtime — règles ignorées (configJson cassée). */
  errors: Array<{ ruleId: string; ruleLabel: string; error: string }>;
}

// ============================================================================
// Engine
// ============================================================================

/**
 * Évalue toutes les règles de tarification actives d'un club sur un
 * snapshot de cart. Idempotent, stateless.
 *
 * **Robustesse** : si une règle a un `configJson` cassé (ex schéma
 * modifié post-création), elle est **ignorée** et loggée dans
 * `errors` — la facturation continue avec les autres règles.
 *
 * **Ordre** : les règles sont appliquées par `priority` croissant. Au
 * sein d'une priorité, ordre alphabétique du label.
 */
@Injectable()
export class PricingRulesEngineService {
  private readonly logger = new Logger(PricingRulesEngineService.name);

  constructor(private readonly prisma: PrismaService) {}

  async evaluate(
    clubId: string,
    snapshot: CartLineSnapshot[],
  ): Promise<EvaluationResult> {
    const rules = await this.prisma.membershipPricingRule.findMany({
      where: { clubId, isActive: true },
      orderBy: [{ priority: 'asc' }, { label: 'asc' }],
    });

    const applications: RuleApplication[] = [];
    const errors: Array<{ ruleId: string; ruleLabel: string; error: string }> =
      [];

    for (const rule of rules) {
      let config: PricingRuleConfig;
      try {
        config = validateRuleConfig(rule.pattern, rule.configJson);
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'config invalide';
        this.logger.warn(
          `[Rule ${rule.id} "${rule.label}"] configJson invalide → règle ignorée. Détail : ${message}`,
        );
        errors.push({ ruleId: rule.id, ruleLabel: rule.label, error: message });
        continue;
      }

      try {
        const application = this.applyRule(rule, config, snapshot);
        if (application.appliedTo.length > 0) {
          applications.push(application);
        }
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'erreur runtime';
        this.logger.error(
          `[Rule ${rule.id} "${rule.label}"] erreur runtime → règle ignorée. Détail : ${message}`,
        );
        errors.push({ ruleId: rule.id, ruleLabel: rule.label, error: message });
      }
    }

    return { applications, errors };
  }

  /**
   * Applique une règle au snapshot. Switch par pattern. Chaque branche
   * retourne une `RuleApplication` (peut être vide si la règle ne
   * s'applique à aucune ligne).
   */
  private applyRule(
    rule: { id: string; label: string; pattern: MembershipPricingRulePattern },
    config: PricingRuleConfig,
    snapshot: CartLineSnapshot[],
  ): RuleApplication {
    const baseApp: RuleApplication = {
      ruleId: rule.id,
      ruleLabel: rule.label,
      pattern: rule.pattern,
      appliedTo: [],
    };

    switch (rule.pattern) {
      case MembershipPricingRulePattern.FAMILY_PROGRESSIVE: {
        const c = config as FamilyProgressiveConfig;
        // Filtre selon appliesTo + tri (par défaut AMOUNT_DESC = la plus
        // chère en 1er, donc les remises s'appliquent aux MOINS chères).
        const eligible = snapshot
          .filter((s) =>
            s.category === 'SUBSCRIPTION' &&
            c.appliesTo.includes('SUBSCRIPTION'),
          )
          .sort((a, b) => {
            switch (c.sortBy) {
              case 'AMOUNT_ASC':
                return a.baseAmountCents - b.baseAmountCents;
              case 'AMOUNT_DESC':
                return b.baseAmountCents - a.baseAmountCents;
              case 'AGE_ASC':
                return (a.ageAtReference ?? 0) - (b.ageAtReference ?? 0);
              case 'AGE_DESC':
                return (b.ageAtReference ?? 0) - (a.ageAtReference ?? 0);
              default:
                return 0;
            }
          });
        // tiers triés par rank croissant pour pouvoir piocher facilement
        const tiers = [...c.tiers].sort((a, b) => a.rank - b.rank);
        // Plus haut rank = "ET PLUS" (ex 4 = 4 et au-delà)
        const maxRank = tiers[tiers.length - 1]?.rank ?? 0;
        for (let i = 0; i < eligible.length; i++) {
          const rank = i + 1; // rang 1 = 1er, pas remisé
          if (rank < 2) continue;
          const tier =
            tiers.find((t) => t.rank === rank) ??
            (rank > maxRank ? tiers.find((t) => t.rank === maxRank) : null);
          if (!tier) continue;
          const line = eligible[i];
          const delta = this.computeDelta(
            line.baseAmountCents,
            tier.type,
            tier.value,
          );
          if (delta === 0) continue;
          baseApp.appliedTo.push({
            itemId: line.itemId,
            deltaAmountCents: delta,
            reason: `${rule.label} — ${rank}ᵉ adhérent du foyer (${this.formatTierValue(tier.type, tier.value)})`,
          });
        }
        return baseApp;
      }

      case MembershipPricingRulePattern.PRODUCT_BUNDLE: {
        const c = config as ProductBundleConfig;
        const productIds = new Set(
          snapshot.map((s) => s.membershipProductId).filter((p): p is string => Boolean(p)),
        );
        const allRequired = c.requiredProductIds.every((id) =>
          productIds.has(id),
        );
        if (!allRequired) return baseApp;
        const target = snapshot.find(
          (s) => s.membershipProductId === c.discountAppliesToProductId,
        );
        if (!target) return baseApp;
        const delta = this.computeDelta(
          target.baseAmountCents,
          c.discountType,
          c.discountValue,
        );
        if (delta === 0) return baseApp;
        baseApp.appliedTo.push({
          itemId: target.itemId,
          deltaAmountCents: delta,
          reason: `${rule.label} (${this.formatTierValue(c.discountType, c.discountValue)})`,
        });
        return baseApp;
      }

      case MembershipPricingRulePattern.AGE_RANGE_DISCOUNT: {
        const c = config as AgeRangeDiscountConfig;
        for (const line of snapshot) {
          if (line.category !== 'SUBSCRIPTION') continue;
          if (line.ageAtReference == null) continue;
          if (c.minAge != null && line.ageAtReference < c.minAge) continue;
          if (c.maxAge != null && line.ageAtReference > c.maxAge) continue;
          const delta = this.computeDelta(
            line.baseAmountCents,
            c.discountType,
            c.discountValue,
          );
          if (delta === 0) continue;
          baseApp.appliedTo.push({
            itemId: line.itemId,
            deltaAmountCents: delta,
            reason: `${rule.label} (${this.formatTierValue(c.discountType, c.discountValue)})`,
          });
        }
        return baseApp;
      }

      case MembershipPricingRulePattern.NEW_MEMBER_DISCOUNT:
      case MembershipPricingRulePattern.LOYALTY_DISCOUNT: {
        // TODO v2 : nécessite de passer l'historique d'inscription dans
        // le snapshot. Pour l'instant règle no-op silencieuse.
        return baseApp;
      }

      default: {
        const exhaustive: never = rule.pattern;
        void exhaustive;
        return baseApp;
      }
    }
  }

  /**
   * Calcule le delta (négatif) appliqué sur une ligne, selon type et
   * valeur. Borne inférieure = -baseAmount (on ne peut pas remiser plus
   * que le prix de la ligne, sinon on aurait du crédit).
   */
  private computeDelta(
    baseAmountCents: number,
    type: 'PERCENT_BP' | 'FIXED_CENTS',
    value: number,
  ): number {
    let delta: number;
    if (type === 'PERCENT_BP') {
      delta = Math.round((baseAmountCents * value) / 10_000);
    } else {
      delta = value;
    }
    // Borne basse : ne peut pas dépasser le montant de la ligne
    if (delta < -baseAmountCents) {
      delta = -baseAmountCents;
    }
    return delta;
  }

  private formatTierValue(
    type: PricingAdjustmentType | 'PERCENT_BP' | 'FIXED_CENTS',
    value: number,
  ): string {
    if (type === 'PERCENT_BP') {
      return `${(value / 100).toFixed(0)} %`;
    }
    return `${(value / 100).toFixed(2).replace('.', ',')} €`;
  }
}
