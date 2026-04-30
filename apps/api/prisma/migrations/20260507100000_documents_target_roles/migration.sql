-- Ciblage par rôles (système + custom) pour ClubDocument
ALTER TABLE "ClubDocument"
  ADD COLUMN "targetSystemRoles" "MembershipRole"[] NOT NULL DEFAULT ARRAY[]::"MembershipRole"[];

ALTER TABLE "ClubDocument"
  ADD COLUMN "targetCustomRoleIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
