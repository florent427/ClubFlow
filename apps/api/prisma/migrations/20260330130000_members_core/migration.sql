-- CreateEnum
CREATE TYPE "MemberStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "MemberClubRole" AS ENUM ('STUDENT', 'COACH', 'BOARD');

-- CreateTable
CREATE TABLE "GradeLevel" (
    "id" TEXT NOT NULL,
    "clubId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GradeLevel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Member" (
    "id" TEXT NOT NULL,
    "clubId" TEXT NOT NULL,
    "userId" TEXT,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "addressLine" TEXT,
    "postalCode" TEXT,
    "city" TEXT,
    "birthDate" TIMESTAMP(3),
    "photoUrl" TEXT,
    "medicalCertExpiresAt" TIMESTAMP(3),
    "status" "MemberStatus" NOT NULL DEFAULT 'ACTIVE',
    "gradeLevelId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Member_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MemberRoleAssignment" (
    "id" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "role" "MemberClubRole" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MemberRoleAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DynamicGroup" (
    "id" TEXT NOT NULL,
    "clubId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "minAge" INTEGER,
    "maxAge" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DynamicGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DynamicGroupGradeLevel" (
    "dynamicGroupId" TEXT NOT NULL,
    "gradeLevelId" TEXT NOT NULL,

    CONSTRAINT "DynamicGroupGradeLevel_pkey" PRIMARY KEY ("dynamicGroupId","gradeLevelId")
);

-- CreateIndex
CREATE INDEX "GradeLevel_clubId_idx" ON "GradeLevel"("clubId");

-- CreateIndex
CREATE INDEX "Member_clubId_idx" ON "Member"("clubId");

-- CreateIndex
CREATE INDEX "Member_clubId_status_idx" ON "Member"("clubId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Member_clubId_userId_key" ON "Member"("clubId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "MemberRoleAssignment_memberId_role_key" ON "MemberRoleAssignment"("memberId", "role");

-- CreateIndex
CREATE INDEX "DynamicGroup_clubId_idx" ON "DynamicGroup"("clubId");

-- AddForeignKey
ALTER TABLE "GradeLevel" ADD CONSTRAINT "GradeLevel_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Member" ADD CONSTRAINT "Member_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Member" ADD CONSTRAINT "Member_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Member" ADD CONSTRAINT "Member_gradeLevelId_fkey" FOREIGN KEY ("gradeLevelId") REFERENCES "GradeLevel"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemberRoleAssignment" ADD CONSTRAINT "MemberRoleAssignment_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DynamicGroup" ADD CONSTRAINT "DynamicGroup_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DynamicGroupGradeLevel" ADD CONSTRAINT "DynamicGroupGradeLevel_dynamicGroupId_fkey" FOREIGN KEY ("dynamicGroupId") REFERENCES "DynamicGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DynamicGroupGradeLevel" ADD CONSTRAINT "DynamicGroupGradeLevel_gradeLevelId_fkey" FOREIGN KEY ("gradeLevelId") REFERENCES "GradeLevel"("id") ON DELETE CASCADE ON UPDATE CASCADE;
