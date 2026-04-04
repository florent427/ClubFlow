-- Custom club roles (labels) complementary to MemberClubRole enum on MemberRoleAssignment

CREATE TABLE "ClubRoleDefinition" (
    "id" TEXT NOT NULL,
    "clubId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClubRoleDefinition_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MemberCustomRoleAssignment" (
    "id" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "roleDefinitionId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MemberCustomRoleAssignment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ClubRoleDefinition_clubId_idx" ON "ClubRoleDefinition"("clubId");

CREATE INDEX "MemberCustomRoleAssignment_roleDefinitionId_idx" ON "MemberCustomRoleAssignment"("roleDefinitionId");

CREATE UNIQUE INDEX "MemberCustomRoleAssignment_memberId_roleDefinitionId_key" ON "MemberCustomRoleAssignment"("memberId", "roleDefinitionId");

ALTER TABLE "ClubRoleDefinition" ADD CONSTRAINT "ClubRoleDefinition_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MemberCustomRoleAssignment" ADD CONSTRAINT "MemberCustomRoleAssignment_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MemberCustomRoleAssignment" ADD CONSTRAINT "MemberCustomRoleAssignment_roleDefinitionId_fkey" FOREIGN KEY ("roleDefinitionId") REFERENCES "ClubRoleDefinition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
