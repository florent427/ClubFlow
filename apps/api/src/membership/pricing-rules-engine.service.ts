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
 * Config d'une règle PRODUCT_BUNDLE — combinaison de produits où l'un
 * des `primary` (sémantique OR : au moins un présent) est la condition
 * de déclenchement et le `secondary` reçoit la remise. La remise dépend
 * du `billingRhythm` du secondaire : un montant pour ANNUAL, un autre
 * pour MONTHLY.
 *
 * Ex « Tout art martial + Cross Training » :
 * - primaryProductIds = [Karaté, Judo, Tai-chi]  (OR — un seul suffit)
 * - secondaryProductId = Cross Training
 * - Si Cross en annuel : -20 € sur le tarif annuel
 * - Si Cross en mensuel : -2 € / mois
 *
 * Les primary peuvent être facturés dans un projet ANTÉRIEUR de la
 * même saison (cf `EvaluationContext.prior`) — la remise sur secondary
 * s'applique tant qu'au moins un primary est dans le foyer pour cette
 * saison.
 *
 * Le primary lui-même ne reçoit jamais de remise via ce pattern.
 *
 * ```json
 * {
 *   "primaryProductIds": ["karateId", "judoId", "taiChiId"],
 *   "secondaryProductId": "crossId",
 *   "discountForAnnual":  { "type": "FIXED_CENTS", "value": -2000 },
 *   "discountForMonthly": { "type": "FIXED_CENTS", "value": -200 }
 * }
 * ```
 */
export interface ProductBundleConfig {
  /** Liste OR : au moins un de ces produits doit être présent. */
  primaryProductIds: string[];
  secondaryProductId: string;
  /** Remise appliquée si le secondary est en `billingRhythm = ANNUAL`. */
  discountForAnnual: {
    type: 'PERCENT_BP' | 'FIXED_CENTS';
    /** Valeur signée. Négatif = remise. */
    value: number;
  };
  /** Remise appliquée si le secondary est en `billingRhythm = MONTHLY`. */
  discountForMonthly: {
    type: 'PERCENT_BP' | 'FIXED_CENTS';
    value: number;
  };
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
      // Multi-primary (OR sémantique) : on accepte aussi `primaryProductId`
      // singulier pour rétrocompat avec les configs créées avant la
      // refacto multi.
      const primaryIdsRaw =
        Array.isArray(v.primaryProductIds)
          ? v.primaryProductIds
          : typeof v.primaryProductId === 'string' && v.primaryProductId
            ? [v.primaryProductId]
            : null;
      if (!primaryIdsRaw || primaryIdsRaw.length === 0) {
        throw new BadRequestException(
          'primaryProductIds requis (au moins 1 produit déclencheur — sémantique OR)',
        );
      }
      const primaryIds = primaryIdsRaw.map((id, idx) => {
        if (typeof id !== 'string' || !id)
          throw new BadRequestException(
            `primaryProductIds[${idx}] doit être une chaîne UUID`,
          );
        return id;
      });
      if (typeof v.secondaryProductId !== 'string' || !v.secondaryProductId) {
        throw new BadRequestException(
          'secondaryProductId requis (produit qui reçoit la remise)',
        );
      }
      if (primaryIds.includes(v.secondaryProductId)) {
        throw new BadRequestException(
          'secondaryProductId ne peut pas faire partie de primaryProductIds',
        );
      }
      // Validation des remises annuel + mensuel
      const validateDiscount = (
        d: unknown,
        label: string,
      ): { type: 'PERCENT_BP' | 'FIXED_CENTS'; value: number } => {
        if (typeof d !== 'object' || d === null)
          throw new BadRequestException(`${label} doit être un objet`);
        const dd = d as Record<string, unknown>;
        if (dd.type !== 'PERCENT_BP' && dd.type !== 'FIXED_CENTS')
          throw new BadRequestException(
            `${label}.type doit être PERCENT_BP ou FIXED_CENTS`,
          );
        if (typeof dd.value !== 'number' || dd.value >= 0)
          throw new BadRequestException(
            `${label}.value doit être un nombre négatif (remise)`,
          );
        return {
          type: dd.type as 'PERCENT_BP' | 'FIXED_CENTS',
          value: dd.value,
        };
      };
      return {
        primaryProductIds: primaryIds,
        secondaryProductId: v.secondaryProductId,
        discountForAnnual: validateDiscount(
          v.discountForAnnual,
          'discountForAnnual',
        ),
        discountForMonthly: validateDiscount(
          v.discountForMonthly,
          'discountForMonthly',
        ),
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
  /**
   * Montant de base (cotisation ou frais) **APRÈS** prorata éventuel.
   * Ex : tarif annuel 300 € avec prorata 60 % → baseAmountCents = 18000.
   */
  baseAmountCents: number;
  /** ID du produit lié (pour PRODUCT_BUNDLE). Null pour frais uniques. */
  membershipProductId: string | null;
  /** Catégorie : SUBSCRIPTION (cotisation) ou ONE_TIME (licence/dossier). */
  category: 'SUBSCRIPTION' | 'ONE_TIME';
  /** Membre concerné (pour rang famille, âge…). */
  memberId: string;
  /** Âge à la date de référence (souvent début de saison). */
  ageAtReference: number | null;
  /** Rythme de facturation (utile pour PRODUCT_BUNDLE annuel/mensuel). */
  billingRhythm: 'ANNUAL' | 'MONTHLY';
  /**
   * Facteur de prorata appliqué à cette ligne (10000 = 100 %, 6000 =
   * 60 %). Utilisé par l'engine pour proratiser les remises FIXED_CENTS
   * (les % se proratisent naturellement car appliqués sur la base
   * déjà proratisée).
   *
   * Exemple : remise -20 € fixe sur une cotisation proratisée à 60 %
   * → on applique -12 € (60 % × 20 €) pour rester proportionnel.
   *
   * Default 10000 (pas de prorata).
   */
  prorataFactorBp: number;
}

/**
 * Contexte historique d'une famille pour la saison courante : tous les
 * Members ayant déjà été facturés pour des cotisations dans la saison
 * (peu importe le projet d'adhésion / cart). Utilisé par
 * FAMILY_PROGRESSIVE pour calculer le **rang global** d'un nouvel
 * adhérent (et non le rang dans le cart courant uniquement).
 *
 * Cas d'usage :
 *  - Septembre : Joseph + Léa facturés
 *  - Janvier : Tom ajouté → rang global = 3 → -20 % (et pas -10 % !)
 *  - Avril : Sarah ajoutée → rang global = 4 → -30 %
 *
 * Les factures déjà émises ne sont JAMAIS modifiées rétroactivement
 * (intégrité comptable). Si un nouveau membre arrive avec un montant
 * supérieur aux déjà facturés, son rang est calculé sur la position
 * dans le tri global mais sans modifier les factures précédentes — ce
 * qui peut donner un résultat sous-optimal pour la famille mais
 * préserve la traçabilité.
 */
export interface PriorMembershipsSnapshot {
  /** Members + leur cotisation déjà facturée pour cette saison. */
  entries: Array<{
    memberId: string;
    /** Montant base annuel facturé (pour comparer avec le tri). */
    baseAmountCents: number;
    membershipProductId: string | null;
    /** Date de facturation (pour ordre déterministe en cas d'ex aequo). */
    invoicedAt: Date;
  }>;
}

/**
 * Contexte complet d'évaluation : snapshot du cart en cours +
 * historique de la famille pour la saison.
 */
export interface EvaluationContext {
  cart: CartLineSnapshot[];
  prior: PriorMembershipsSnapshot;
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
    contextOrSnapshot: EvaluationContext | CartLineSnapshot[],
  ): Promise<EvaluationResult> {
    // Backward-compat : si appelé avec juste un array, on construit un
    // contexte sans historique (cas tests + premier appel).
    const context: EvaluationContext = Array.isArray(contextOrSnapshot)
      ? { cart: contextOrSnapshot, prior: { entries: [] } }
      : contextOrSnapshot;

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
        const application = this.applyRule(rule, config, context);
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
   * Applique une règle au contexte (cart en cours + historique famille).
   * Switch par pattern. Chaque branche retourne une `RuleApplication`
   * (peut être vide si la règle ne s'applique à aucune ligne).
   */
  private applyRule(
    rule: { id: string; label: string; pattern: MembershipPricingRulePattern },
    config: PricingRuleConfig,
    context: EvaluationContext,
  ): RuleApplication {
    const baseApp: RuleApplication = {
      ruleId: rule.id,
      ruleLabel: rule.label,
      pattern: rule.pattern,
      appliedTo: [],
    };
    const snapshot = context.cart;

    switch (rule.pattern) {
      case MembershipPricingRulePattern.FAMILY_PROGRESSIVE: {
        const c = config as FamilyProgressiveConfig;
        // ---------------------------------------------------------------
        // Rang GLOBAL = position dans (historique + cart) trié.
        //
        // Étape 1 : on construit la liste TOTALE des cotisations du foyer
        // pour cette saison (anciennes facturées + nouvelles dans le cart).
        // Étape 2 : on trie selon `sortBy` (par défaut AMOUNT_DESC).
        // Étape 3 : on applique les remises UNIQUEMENT aux nouvelles
        // lignes du cart (les anciennes sont figées comptablement).
        // ---------------------------------------------------------------

        const cartEligible = snapshot.filter(
          (s) =>
            s.category === 'SUBSCRIPTION' &&
            c.appliesTo.includes('SUBSCRIPTION'),
        );
        // On considère un seul tarif par membre (le plus élevé) pour le
        // classement, sans quoi un membre avec 2 formules compterait double.
        const cartByMember = new Map<string, (typeof cartEligible)[number]>();
        for (const l of cartEligible) {
          const ex = cartByMember.get(l.memberId);
          if (!ex || l.baseAmountCents > ex.baseAmountCents) {
            cartByMember.set(l.memberId, l);
          }
        }

        // Liste des candidats à classer = historique + cart (sans doublon
        // sur memberId — si un membre est dans l'historique ET le cart,
        // on garde l'historique car la facture est figée).
        type Candidate = {
          memberId: string;
          baseAmountCents: number;
          source: 'PRIOR' | 'CART';
          /** Item du cart si source=CART (pour appliquer la remise dessus). */
          cartItem: (typeof cartEligible)[number] | null;
          /** Date pour ordre déterministe en cas d'ex aequo. */
          orderDate: Date;
        };
        const priorByMember = new Map<string, Candidate>();
        for (const e of context.prior.entries) {
          priorByMember.set(e.memberId, {
            memberId: e.memberId,
            baseAmountCents: e.baseAmountCents,
            source: 'PRIOR',
            cartItem: null,
            orderDate: e.invoicedAt,
          });
        }
        const candidates: Candidate[] = [...priorByMember.values()];
        for (const [memberId, item] of cartByMember) {
          if (priorByMember.has(memberId)) continue; // déjà dans historique
          candidates.push({
            memberId,
            baseAmountCents: item.baseAmountCents,
            source: 'CART',
            cartItem: item,
            orderDate: new Date(),
          });
        }

        // Tri : critère principal par sortBy + tie-breaker stable par
        // orderDate (les anciens passent avant en cas d'ex aequo).
        const sortBy = c.sortBy;
        candidates.sort((a, b) => {
          let primary = 0;
          switch (sortBy) {
            case 'AMOUNT_ASC':
              primary = a.baseAmountCents - b.baseAmountCents;
              break;
            case 'AMOUNT_DESC':
              primary = b.baseAmountCents - a.baseAmountCents;
              break;
            // AGE_ASC/DESC : pas pertinent pour FAMILY (on n'a pas l'âge
            // dans l'historique). Fallback sur AMOUNT_DESC.
            default:
              primary = b.baseAmountCents - a.baseAmountCents;
          }
          if (primary !== 0) return primary;
          // Tie-breaker : orderDate croissante (anciens d'abord)
          return a.orderDate.getTime() - b.orderDate.getTime();
        });

        // Application des paliers
        const tiers = [...c.tiers].sort((a, b) => a.rank - b.rank);
        const maxRank = tiers[tiers.length - 1]?.rank ?? 0;
        for (let i = 0; i < candidates.length; i++) {
          const rank = i + 1;
          if (rank < 2) continue; // 1er = plein tarif
          const candidate = candidates[i];
          // Skip si déjà facturé (pas de rétroactif sur l'historique)
          if (candidate.source === 'PRIOR') continue;
          if (!candidate.cartItem) continue;
          const tier =
            tiers.find((t) => t.rank === rank) ??
            (rank > maxRank ? tiers.find((t) => t.rank === maxRank) : null);
          if (!tier) continue;
          const delta = this.computeDelta(
            candidate.cartItem.baseAmountCents,
            tier.type,
            tier.value,
            candidate.cartItem.prorataFactorBp,
          );
          if (delta === 0) continue;
          // Reason explicite pour transparence UI
          const explanation =
            context.prior.entries.length > 0
              ? `${rank}ᵉ adhérent du foyer pour cette saison (${context.prior.entries.length} déjà inscrit${context.prior.entries.length > 1 ? 's' : ''})`
              : `${rank}ᵉ adhérent du foyer`;
          baseApp.appliedTo.push({
            itemId: candidate.cartItem.itemId,
            deltaAmountCents: delta,
            reason: `${rule.label} — ${explanation} (${this.formatTierValue(tier.type, tier.value)})`,
          });
        }
        return baseApp;
      }

      case MembershipPricingRulePattern.PRODUCT_BUNDLE: {
        const c = config as ProductBundleConfig;
        // Sémantique OR : il suffit qu'AU MOINS UN des primaryProductIds
        // soit présent (dans le cart OU dans l'historique de la saison).
        const productIdsInContext = new Set([
          ...snapshot
            .map((s) => s.membershipProductId)
            .filter((p): p is string => Boolean(p)),
          ...context.prior.entries
            .map((e) => e.membershipProductId)
            .filter((p): p is string => Boolean(p)),
        ]);
        const matchedPrimary = c.primaryProductIds.find((id) =>
          productIdsInContext.has(id),
        );
        if (!matchedPrimary) return baseApp;

        // On applique la remise sur TOUTES les lignes du cart qui sont
        // le secondary (un foyer pourrait inscrire 2 enfants au cours
        // secondaire). Choix de la remise selon le billingRhythm de
        // chaque ligne.
        for (const line of snapshot) {
          if (line.membershipProductId !== c.secondaryProductId) continue;
          if (line.category !== 'SUBSCRIPTION') continue;
          const discount =
            line.billingRhythm === 'MONTHLY'
              ? c.discountForMonthly
              : c.discountForAnnual;
          const delta = this.computeDelta(
            line.baseAmountCents,
            discount.type,
            discount.value,
            line.prorataFactorBp,
          );
          if (delta === 0) continue;
          const rhythmLabel =
            line.billingRhythm === 'MONTHLY' ? 'mensuel' : 'annuel';
          baseApp.appliedTo.push({
            itemId: line.itemId,
            deltaAmountCents: delta,
            reason: `${rule.label} (${rhythmLabel}, ${this.formatTierValue(discount.type, discount.value)})`,
          });
        }
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
            line.prorataFactorBp,
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
   *
   * **Prorata sur FIXED_CENTS** : si la ligne du cart est proratisée
   * (ex 60% de la saison restante), une remise FIXED_CENTS de -20 €
   * devient -12 € (60% de 20 €). Évite qu'un nouvel adhérent
   * proratisé bénéficie d'une remise disproportionnée par rapport au
   * montant qu'il paie réellement.
   *
   * Pour PERCENT_BP, pas d'ajustement nécessaire : le calcul `base ×
   * pct` se proratise naturellement (la base est déjà proratisée).
   */
  private computeDelta(
    baseAmountCents: number,
    type: 'PERCENT_BP' | 'FIXED_CENTS',
    value: number,
    prorataFactorBp: number = 10_000,
  ): number {
    let delta: number;
    if (type === 'PERCENT_BP') {
      delta = Math.round((baseAmountCents * value) / 10_000);
    } else {
      // FIXED_CENTS : on proratise la valeur fixe pour rester
      // proportionnel au temps de saison réellement payé.
      delta = Math.round((value * prorataFactorBp) / 10_000);
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
