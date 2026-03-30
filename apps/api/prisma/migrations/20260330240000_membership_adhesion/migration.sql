-- Adhésion : DRAFT, saisons, liaisons membre-groupe, formules, lignes de facture

ALTER TYPE "InvoiceStatus" ADD VALUE IF NOT EXISTS 'DRAFT' BEFORE 'OPEN';

CREATE TYPE "InvoiceLineKind" AS ENUM ('MEMBERSHIP');

CREATE TYPE "InvoiceLineAdjustmentType" AS ENUM ('PRORATA_SEASON', 'FAMILY', 'PUBLIC_AID', 'EXCEPTIONAL');

ALTER TABLE "Club" ADD COLUMN "membershipFamilyDiscountFromNth" INTEGER,
ADD COLUMN "membershipFamilyAdjustmentType" "PricingAdjustmentType" NOT NULL DEFAULT 'NONE',
ADD COLUMN "membershipFamilyAdjustmentValue" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE "ClubSeason" (
    "id" TEXT NOT NULL,
    "clubId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "startsOn" DATE NOT NULL,
    "endsOn" DATE NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClubSeason_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MemberDynamicGroup" (
    "id" TEXT NOT NULL,
    "clubId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "dynamicGroupId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MemberDynamicGroup_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MembershipProduct" (
    "id" TEXT NOT NULL,
    "clubId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "baseAmountCents" INTEGER NOT NULL,
    "dynamicGroupId" TEXT NOT NULL,
    "allowProrata" BOOLEAN NOT NULL DEFAULT true,
    "allowFamily" BOOLEAN NOT NULL DEFAULT true,
    "allowPublicAid" BOOLEAN NOT NULL DEFAULT true,
    "allowExceptional" BOOLEAN NOT NULL DEFAULT true,
    "exceptionalCapPercentBp" INTEGER,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MembershipProduct_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "InvoiceLine" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "kind" "InvoiceLineKind" NOT NULL DEFAULT 'MEMBERSHIP',
    "memberId" TEXT NOT NULL,
    "membershipProductId" TEXT,
    "dynamicGroupId" TEXT,
    "baseAmountCents" INTEGER NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "InvoiceLine_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "InvoiceLineAdjustment" (
    "id" TEXT NOT NULL,
    "lineId" TEXT NOT NULL,
    "stepOrder" INTEGER NOT NULL,
    "type" "InvoiceLineAdjustmentType" NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "percentAppliedBp" INTEGER,
    "metadataJson" TEXT,
    "reason" TEXT,
    "createdByUserId" TEXT,

    CONSTRAINT "InvoiceLineAdjustment_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Invoice" ADD COLUMN "clubSeasonId" TEXT,
ADD COLUMN "lockedPaymentMethod" "ClubPaymentMethod";

CREATE INDEX "ClubSeason_clubId_idx" ON "ClubSeason"("clubId");

CREATE UNIQUE INDEX "MemberDynamicGroup_memberId_dynamicGroupId_key" ON "MemberDynamicGroup"("memberId", "dynamicGroupId");

CREATE INDEX "MemberDynamicGroup_clubId_memberId_idx" ON "MemberDynamicGroup"("clubId", "memberId");

CREATE INDEX "MembershipProduct_clubId_idx" ON "MembershipProduct"("clubId");

CREATE INDEX "InvoiceLine_invoiceId_idx" ON "InvoiceLine"("invoiceId");

CREATE INDEX "InvoiceLine_memberId_idx" ON "InvoiceLine"("memberId");

CREATE INDEX "InvoiceLineAdjustment_lineId_idx" ON "InvoiceLineAdjustment"("lineId");

CREATE INDEX "Invoice_clubSeasonId_idx" ON "Invoice"("clubSeasonId");

ALTER TABLE "ClubSeason" ADD CONSTRAINT "ClubSeason_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MemberDynamicGroup" ADD CONSTRAINT "MemberDynamicGroup_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MemberDynamicGroup" ADD CONSTRAINT "MemberDynamicGroup_dynamicGroupId_fkey" FOREIGN KEY ("dynamicGroupId") REFERENCES "DynamicGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MembershipProduct" ADD CONSTRAINT "MembershipProduct_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MembershipProduct" ADD CONSTRAINT "MembershipProduct_dynamicGroupId_fkey" FOREIGN KEY ("dynamicGroupId") REFERENCES "DynamicGroup"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_clubSeasonId_fkey" FOREIGN KEY ("clubSeasonId") REFERENCES "ClubSeason"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "InvoiceLine" ADD CONSTRAINT "InvoiceLine_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "InvoiceLine" ADD CONSTRAINT "InvoiceLine_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "InvoiceLine" ADD CONSTRAINT "InvoiceLine_membershipProductId_fkey" FOREIGN KEY ("membershipProductId") REFERENCES "MembershipProduct"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "InvoiceLine" ADD CONSTRAINT "InvoiceLine_dynamicGroupId_fkey" FOREIGN KEY ("dynamicGroupId") REFERENCES "DynamicGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "InvoiceLineAdjustment" ADD CONSTRAINT "InvoiceLineAdjustment_lineId_fkey" FOREIGN KEY ("lineId") REFERENCES "InvoiceLine"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE UNIQUE INDEX "ClubSeason_one_active_per_club" ON "ClubSeason"("clubId") WHERE "isActive" = true;
