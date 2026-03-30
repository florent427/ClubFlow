-- Cotisation : tarifs annuel/mensuel, critères formule, frais uniques ; lignes subscription vs one-time

CREATE TYPE "SubscriptionBillingRhythm" AS ENUM ('ANNUAL', 'MONTHLY');

-- Nouveau kind puis renommer l'ancien (valeur PostgreSQL existante : MEMBERSHIP)
ALTER TABLE "InvoiceLine" ALTER COLUMN "kind" DROP DEFAULT;
ALTER TYPE "InvoiceLineKind" ADD VALUE 'MEMBERSHIP_ONE_TIME';
ALTER TYPE "InvoiceLineKind" RENAME VALUE 'MEMBERSHIP' TO 'MEMBERSHIP_SUBSCRIPTION';
ALTER TABLE "InvoiceLine" ALTER COLUMN "kind" SET DEFAULT 'MEMBERSHIP_SUBSCRIPTION'::"InvoiceLineKind";

ALTER TABLE "InvoiceLine" ADD COLUMN "subscriptionBillingRhythm" "SubscriptionBillingRhythm",
ADD COLUMN "membershipOneTimeFeeId" TEXT;

UPDATE "InvoiceLine"
SET "subscriptionBillingRhythm" = 'ANNUAL'
WHERE "kind" = 'MEMBERSHIP_SUBSCRIPTION';

CREATE TABLE "MembershipOneTimeFee" (
    "id" TEXT NOT NULL,
    "clubId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MembershipOneTimeFee_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "MembershipOneTimeFee_clubId_idx" ON "MembershipOneTimeFee"("clubId");

ALTER TABLE "MembershipOneTimeFee" ADD CONSTRAINT "MembershipOneTimeFee_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "InvoiceLine" ADD CONSTRAINT "InvoiceLine_membershipOneTimeFeeId_fkey" FOREIGN KEY ("membershipOneTimeFeeId") REFERENCES "MembershipOneTimeFee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "InvoiceLine_membershipOneTimeFeeId_idx" ON "InvoiceLine"("membershipOneTimeFeeId");

ALTER TABLE "MembershipProduct" ADD COLUMN "annualAmountCents" INTEGER,
ADD COLUMN "monthlyAmountCents" INTEGER,
ADD COLUMN "minAge" INTEGER,
ADD COLUMN "maxAge" INTEGER;

UPDATE "MembershipProduct"
SET "annualAmountCents" = "baseAmountCents",
    "monthlyAmountCents" = "baseAmountCents";

ALTER TABLE "MembershipProduct" ALTER COLUMN "annualAmountCents" SET NOT NULL,
ALTER COLUMN "monthlyAmountCents" SET NOT NULL;

ALTER TABLE "MembershipProduct" DROP CONSTRAINT "MembershipProduct_dynamicGroupId_fkey";

ALTER TABLE "MembershipProduct" DROP COLUMN "baseAmountCents",
DROP COLUMN "dynamicGroupId";

CREATE TABLE "MembershipProductGradeLevel" (
    "membershipProductId" TEXT NOT NULL,
    "gradeLevelId" TEXT NOT NULL,

    CONSTRAINT "MembershipProductGradeLevel_pkey" PRIMARY KEY ("membershipProductId","gradeLevelId")
);

ALTER TABLE "MembershipProductGradeLevel" ADD CONSTRAINT "MembershipProductGradeLevel_membershipProductId_fkey" FOREIGN KEY ("membershipProductId") REFERENCES "MembershipProduct"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MembershipProductGradeLevel" ADD CONSTRAINT "MembershipProductGradeLevel_gradeLevelId_fkey" FOREIGN KEY ("gradeLevelId") REFERENCES "GradeLevel"("id") ON DELETE CASCADE ON UPDATE CASCADE;
