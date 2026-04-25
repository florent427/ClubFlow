-- ============================================================================
-- Migration : MembershipPricingRule (système de remises configurables)
--
-- Permet à l'admin de configurer des règles de remise via des "patterns"
-- prédéfinis (FAMILY_PROGRESSIVE, PRODUCT_BUNDLE, AGE_RANGE_DISCOUNT,
-- NEW_MEMBER_DISCOUNT, LOYALTY_DISCOUNT). Chaque pattern a son schéma
-- Zod côté service ; configJson stocke les paramètres spécifiques.
--
-- Migration NON destructive : nouvelle table + enum, aucune colonne
-- supprimée sur l'existant. La règle famille uniforme du Club
-- (membershipFamilyDiscountFromNth/Type/Value) reste en place pour
-- rétrocompat — un fallback dans le service convertit cette
-- configuration legacy en une règle pattern FAMILY_PROGRESSIVE virtuelle
-- si aucune règle n'est définie.
-- ============================================================================

-- 1) Nouvel enum
CREATE TYPE "MembershipPricingRulePattern" AS ENUM (
  'FAMILY_PROGRESSIVE',
  'PRODUCT_BUNDLE',
  'AGE_RANGE_DISCOUNT',
  'NEW_MEMBER_DISCOUNT',
  'LOYALTY_DISCOUNT'
);

-- 2) Nouvelle table
CREATE TABLE "MembershipPricingRule" (
    "id" TEXT NOT NULL,
    "clubId" TEXT NOT NULL,
    "pattern" "MembershipPricingRulePattern" NOT NULL,
    "label" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "configJson" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MembershipPricingRule_pkey" PRIMARY KEY ("id")
);

-- 3) Indexes
CREATE INDEX "MembershipPricingRule_clubId_isActive_priority_idx"
  ON "MembershipPricingRule"("clubId", "isActive", "priority");
CREATE INDEX "MembershipPricingRule_clubId_pattern_idx"
  ON "MembershipPricingRule"("clubId", "pattern");

-- 4) Foreign key
ALTER TABLE "MembershipPricingRule"
  ADD CONSTRAINT "MembershipPricingRule_clubId_fkey"
  FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;
