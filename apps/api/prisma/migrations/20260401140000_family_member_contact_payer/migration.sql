-- Payeur foyer via Contact (sans Member) + traçabilité paiement.
-- Conserve l’index unique partiel existant : un seul PAYER par foyer.

-- FamilyMember : memberId nullable, contactId optionnel
DROP INDEX IF EXISTS "FamilyMember_familyId_memberId_key";

ALTER TABLE "FamilyMember" ALTER COLUMN "memberId" DROP NOT NULL;

ALTER TABLE "FamilyMember" ADD COLUMN "contactId" TEXT;

ALTER TABLE "FamilyMember"
ADD CONSTRAINT "FamilyMember_contactId_fkey"
FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Un même membre ne peut pas être lié deux fois au même foyer (lignes avec memberId).
CREATE UNIQUE INDEX "FamilyMember_familyId_memberId_key"
ON "FamilyMember" ("familyId", "memberId")
WHERE "memberId" IS NOT NULL;

-- Un même contact payeur ne peut pas être lié deux fois au même foyer.
CREATE UNIQUE INDEX "FamilyMember_familyId_contactId_key"
ON "FamilyMember" ("familyId", "contactId")
WHERE "contactId" IS NOT NULL;

CREATE INDEX "FamilyMember_contactId_idx" ON "FamilyMember"("contactId");

-- Payment : payeur contact
ALTER TABLE "Payment" ADD COLUMN "paidByContactId" TEXT;

ALTER TABLE "Payment"
ADD CONSTRAINT "Payment_paidByContactId_fkey"
FOREIGN KEY ("paidByContactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "Payment_paidByContactId_idx" ON "Payment"("paidByContactId");

-- Au plus un des deux payeurs explicites sur un paiement.
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_paidBy_one_target"
CHECK (
  NOT ("paidByMemberId" IS NOT NULL AND "paidByContactId" IS NOT NULL)
);
