-- CreateEnum
CREATE TYPE "FamilyMemberLinkRole" AS ENUM ('PAYER', 'MEMBER');

-- CreateTable
CREATE TABLE "Family" (
    "id" TEXT NOT NULL,
    "clubId" TEXT NOT NULL,
    "label" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Family_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FamilyMember" (
    "id" TEXT NOT NULL,
    "familyId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "linkRole" "FamilyMemberLinkRole" NOT NULL DEFAULT 'MEMBER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FamilyMember_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Family_clubId_idx" ON "Family"("clubId");

-- CreateIndex
CREATE UNIQUE INDEX "FamilyMember_familyId_memberId_key" ON "FamilyMember"("familyId", "memberId");

-- CreateIndex
CREATE INDEX "FamilyMember_memberId_idx" ON "FamilyMember"("memberId");

-- AddForeignKey
ALTER TABLE "Family" ADD CONSTRAINT "Family_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FamilyMember" ADD CONSTRAINT "FamilyMember_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "Family"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FamilyMember" ADD CONSTRAINT "FamilyMember_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Un seul payeur par foyer (contrainte PostgreSQL)
CREATE UNIQUE INDEX "FamilyMember_one_payer_per_family" ON "FamilyMember" ("familyId") WHERE "linkRole" = 'PAYER';
