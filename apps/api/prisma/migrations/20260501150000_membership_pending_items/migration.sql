-- ============================================================================
-- Migration : MembershipCartPendingItem
--
-- Permet l'inscription "en attente" d'un Contact ou enfant dans un cart
-- d'adhésion sans créer de fiche Member tant que le cart n'est pas validé.
-- À la validation, chaque PendingItem est transformé en Member réel +
-- N MembershipCartItem (1 par formule sélectionnée).
--
-- Migration NON destructive : nouvelle table, aucune colonne supprimée
-- ou modifiée sur l'existant.
-- ============================================================================

-- 1) Nouvelle table
CREATE TABLE "MembershipCartPendingItem" (
    "id" TEXT NOT NULL,
    "cartId" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "civility" "MemberCivility" NOT NULL,
    "birthDate" TIMESTAMP(3) NOT NULL,
    "email" TEXT NOT NULL,
    "contactId" TEXT,
    "membershipProductIds" TEXT[],
    "billingRhythm" "SubscriptionBillingRhythm" NOT NULL DEFAULT 'ANNUAL',
    "convertedToMemberId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MembershipCartPendingItem_pkey" PRIMARY KEY ("id")
);

-- 2) Indexes
CREATE INDEX "MembershipCartPendingItem_cartId_idx" ON "MembershipCartPendingItem"("cartId");
CREATE INDEX "MembershipCartPendingItem_contactId_idx" ON "MembershipCartPendingItem"("contactId");
CREATE UNIQUE INDEX "MembershipCartPendingItem_cartId_email_firstName_lastName_key"
  ON "MembershipCartPendingItem"("cartId", "email", "firstName", "lastName");

-- 3) Foreign keys
ALTER TABLE "MembershipCartPendingItem"
  ADD CONSTRAINT "MembershipCartPendingItem_cartId_fkey"
  FOREIGN KEY ("cartId") REFERENCES "MembershipCart"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MembershipCartPendingItem"
  ADD CONSTRAINT "MembershipCartPendingItem_contactId_fkey"
  FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "MembershipCartPendingItem"
  ADD CONSTRAINT "MembershipCartPendingItem_convertedToMemberId_fkey"
  FOREIGN KEY ("convertedToMemberId") REFERENCES "Member"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ============================================================================
-- 4) Multi-formules par membre : casser l'ancienne contrainte unique
--    `(cartId, memberId)` qui interdisait à un membre d'avoir plusieurs
--    formules dans le cart. Nouvelle contrainte composite avec
--    `membershipProductId` : on évite uniquement les doublons exacts.
--
--    Cas d'usage débloqué : Samantha s'inscrit Karaté + Cross Training
--    en une seule action.
-- ============================================================================

-- Drop ancienne contrainte unique
ALTER TABLE "MembershipCartItem" DROP CONSTRAINT IF EXISTS "MembershipCartItem_cartId_memberId_key";
DROP INDEX IF EXISTS "MembershipCartItem_cartId_memberId_key";

-- Nouvelle contrainte unique composite
CREATE UNIQUE INDEX "MembershipCartItem_cartId_memberId_membershipProductId_key"
  ON "MembershipCartItem"("cartId", "memberId", "membershipProductId");
