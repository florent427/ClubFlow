-- CreateEnum
CREATE TYPE "MemberCatalogFieldKey" AS ENUM ('EMAIL', 'PHONE', 'ADDRESS_LINE', 'POSTAL_CODE', 'CITY', 'BIRTH_DATE', 'PHOTO_URL', 'MEDICAL_CERT_EXPIRES_AT', 'GRADE_LEVEL');

-- CreateEnum
CREATE TYPE "MemberCustomFieldType" AS ENUM ('TEXT', 'TEXT_LONG', 'NUMBER', 'DATE', 'BOOLEAN', 'SELECT');

-- CreateTable
CREATE TABLE "ClubMemberFieldCatalogSetting" (
    "id" TEXT NOT NULL,
    "clubId" TEXT NOT NULL,
    "fieldKey" "MemberCatalogFieldKey" NOT NULL,
    "showOnForm" BOOLEAN NOT NULL DEFAULT true,
    "required" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClubMemberFieldCatalogSetting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MemberCustomFieldDefinition" (
    "id" TEXT NOT NULL,
    "clubId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "type" "MemberCustomFieldType" NOT NULL,
    "required" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "visibleToMember" BOOLEAN NOT NULL DEFAULT false,
    "optionsJson" TEXT,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MemberCustomFieldDefinition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MemberCustomFieldValue" (
    "id" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "definitionId" TEXT NOT NULL,
    "valueText" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MemberCustomFieldValue_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ClubMemberFieldCatalogSetting_clubId_fieldKey_key" ON "ClubMemberFieldCatalogSetting"("clubId", "fieldKey");

CREATE INDEX "ClubMemberFieldCatalogSetting_clubId_idx" ON "ClubMemberFieldCatalogSetting"("clubId");

CREATE UNIQUE INDEX "MemberCustomFieldDefinition_clubId_code_key" ON "MemberCustomFieldDefinition"("clubId", "code");

CREATE INDEX "MemberCustomFieldDefinition_clubId_idx" ON "MemberCustomFieldDefinition"("clubId");

CREATE UNIQUE INDEX "MemberCustomFieldValue_memberId_definitionId_key" ON "MemberCustomFieldValue"("memberId", "definitionId");

CREATE INDEX "MemberCustomFieldValue_memberId_idx" ON "MemberCustomFieldValue"("memberId");

CREATE INDEX "MemberCustomFieldValue_definitionId_idx" ON "MemberCustomFieldValue"("definitionId");

ALTER TABLE "ClubMemberFieldCatalogSetting" ADD CONSTRAINT "ClubMemberFieldCatalogSetting_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MemberCustomFieldDefinition" ADD CONSTRAINT "MemberCustomFieldDefinition_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MemberCustomFieldValue" ADD CONSTRAINT "MemberCustomFieldValue_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MemberCustomFieldValue" ADD CONSTRAINT "MemberCustomFieldValue_definitionId_fkey" FOREIGN KEY ("definitionId") REFERENCES "MemberCustomFieldDefinition"("id") ON DELETE CASCADE ON UPDATE CASCADE;
