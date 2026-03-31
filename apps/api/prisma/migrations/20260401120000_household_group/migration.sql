-- CreateTable
CREATE TABLE "HouseholdGroup" (
    "id" TEXT NOT NULL,
    "clubId" TEXT NOT NULL,
    "label" TEXT,
    "carrierFamilyId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HouseholdGroup_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "HouseholdGroup_carrierFamilyId_key" ON "HouseholdGroup"("carrierFamilyId");

-- CreateIndex
CREATE INDEX "HouseholdGroup_clubId_idx" ON "HouseholdGroup"("clubId");

-- AddForeignKey
ALTER TABLE "HouseholdGroup" ADD CONSTRAINT "HouseholdGroup_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "HouseholdGroup" ADD CONSTRAINT "HouseholdGroup_carrierFamilyId_fkey" FOREIGN KEY ("carrierFamilyId") REFERENCES "Family"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "Family" ADD COLUMN "householdGroupId" TEXT;

-- CreateIndex
CREATE INDEX "Family_householdGroupId_idx" ON "Family"("householdGroupId");

-- AddForeignKey
ALTER TABLE "Family" ADD CONSTRAINT "Family_householdGroupId_fkey" FOREIGN KEY ("householdGroupId") REFERENCES "HouseholdGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN "householdGroupId" TEXT;

-- CreateIndex
CREATE INDEX "Invoice_clubId_householdGroupId_status_idx" ON "Invoice"("clubId", "householdGroupId", "status");

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_householdGroupId_fkey" FOREIGN KEY ("householdGroupId") REFERENCES "HouseholdGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN "paidByMemberId" TEXT;

-- CreateIndex
CREATE INDEX "Payment_paidByMemberId_idx" ON "Payment"("paidByMemberId");

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_paidByMemberId_fkey" FOREIGN KEY ("paidByMemberId") REFERENCES "Member"("id") ON DELETE SET NULL ON UPDATE CASCADE;
