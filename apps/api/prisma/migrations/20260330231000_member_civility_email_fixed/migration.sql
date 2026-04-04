-- Remove EMAIL from configurable catalog (fixed identity field like first/last name).
DELETE FROM "ClubMemberFieldCatalogSetting" WHERE "fieldKey" = 'EMAIL';

CREATE TYPE "MemberCatalogFieldKey_new" AS ENUM ('PHONE', 'ADDRESS_LINE', 'POSTAL_CODE', 'CITY', 'BIRTH_DATE', 'PHOTO_URL', 'MEDICAL_CERT_EXPIRES_AT', 'GRADE_LEVEL');

ALTER TABLE "ClubMemberFieldCatalogSetting"
  ALTER COLUMN "fieldKey" TYPE "MemberCatalogFieldKey_new"
  USING ("fieldKey"::text::"MemberCatalogFieldKey_new");

DROP TYPE "MemberCatalogFieldKey";
ALTER TYPE "MemberCatalogFieldKey_new" RENAME TO "MemberCatalogFieldKey";

-- Civilité (M./Mme)
CREATE TYPE "MemberCivility" AS ENUM ('MR', 'MME');

ALTER TABLE "Member" ADD COLUMN "civility" "MemberCivility";
