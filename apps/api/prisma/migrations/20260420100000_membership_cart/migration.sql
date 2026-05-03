-- CreateEnum
CREATE TYPE "MembershipOneTimeFeeKind" AS ENUM ('LICENSE', 'MANDATORY', 'OPTIONAL');

-- CreateEnum
CREATE TYPE "MembershipCartStatus" AS ENUM ('OPEN', 'VALIDATED', 'CANCELLED');

-- AlterTable
ALTER TABLE "Member" ADD COLUMN     "licenseNumber" TEXT;

-- AlterTable
ALTER TABLE "MembershipOneTimeFee" ADD COLUMN     "autoApply" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "kind" "MembershipOneTimeFeeKind" NOT NULL DEFAULT 'OPTIONAL';

-- CreateTable
CREATE TABLE "MembershipCart" (
    "id" TEXT NOT NULL,
    "clubId" TEXT NOT NULL,
    "familyId" TEXT NOT NULL,
    "clubSeasonId" TEXT NOT NULL,
    "payerContactId" TEXT,
    "payerMemberId" TEXT,
    "status" "MembershipCartStatus" NOT NULL DEFAULT 'OPEN',
    "validatedAt" TIMESTAMP(3),
    "invoiceId" TEXT,
    "cancelledReason" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MembershipCart_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MembershipCartItem" (
    "id" TEXT NOT NULL,
    "cartId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "membershipProductId" TEXT,
    "billingRhythm" "SubscriptionBillingRhythm" NOT NULL DEFAULT 'ANNUAL',
    "hasExistingLicense" BOOLEAN NOT NULL DEFAULT false,
    "existingLicenseNumber" TEXT,
    "exceptionalDiscountCents" INTEGER NOT NULL DEFAULT 0,
    "exceptionalDiscountReason" TEXT,
    "requiresManualAssignment" BOOLEAN NOT NULL DEFAULT false,
    "oneTimeFeeOverrideIdsCsv" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MembershipCartItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MembershipCart_invoiceId_key" ON "MembershipCart"("invoiceId");

-- CreateIndex
CREATE INDEX "MembershipCart_clubId_status_idx" ON "MembershipCart"("clubId", "status");

-- CreateIndex
CREATE INDEX "MembershipCart_familyId_clubSeasonId_status_idx" ON "MembershipCart"("familyId", "clubSeasonId", "status");

-- CreateIndex (partial unique index: only one OPEN cart per family × season)
CREATE UNIQUE INDEX "cart_open_per_family_season"
  ON "MembershipCart"("familyId", "clubSeasonId")
  WHERE "status" = 'OPEN';

-- CreateIndex
CREATE INDEX "MembershipCartItem_cartId_idx" ON "MembershipCartItem"("cartId");

-- CreateIndex
CREATE INDEX "MembershipCartItem_memberId_idx" ON "MembershipCartItem"("memberId");

-- CreateIndex
CREATE UNIQUE INDEX "MembershipCartItem_cartId_memberId_key" ON "MembershipCartItem"("cartId", "memberId");

-- AddForeignKey
ALTER TABLE "MembershipCart" ADD CONSTRAINT "MembershipCart_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MembershipCart" ADD CONSTRAINT "MembershipCart_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "Family"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MembershipCart" ADD CONSTRAINT "MembershipCart_clubSeasonId_fkey" FOREIGN KEY ("clubSeasonId") REFERENCES "ClubSeason"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MembershipCart" ADD CONSTRAINT "MembershipCart_payerContactId_fkey" FOREIGN KEY ("payerContactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MembershipCart" ADD CONSTRAINT "MembershipCart_payerMemberId_fkey" FOREIGN KEY ("payerMemberId") REFERENCES "Member"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MembershipCart" ADD CONSTRAINT "MembershipCart_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MembershipCartItem" ADD CONSTRAINT "MembershipCartItem_cartId_fkey" FOREIGN KEY ("cartId") REFERENCES "MembershipCart"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MembershipCartItem" ADD CONSTRAINT "MembershipCartItem_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MembershipCartItem" ADD CONSTRAINT "MembershipCartItem_membershipProductId_fkey" FOREIGN KEY ("membershipProductId") REFERENCES "MembershipProduct"("id") ON DELETE SET NULL ON UPDATE CASCADE;
