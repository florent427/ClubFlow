-- Module PROJETS v1 (cf. plan glowing-bubbling-llama.md).
-- Migration non-destructive : 9 nouvelles tables + 4 FK nullables sur
-- modèles existants (ClubEvent, AccountingEntry, MessageCampaign,
-- AgentConversation). Rollback sûr : droppables indépendamment.

-- ---------------------------------------------------------------------------
-- 1. Nouvelles valeurs d'enums existants
-- ---------------------------------------------------------------------------
ALTER TYPE "MembershipRole" ADD VALUE IF NOT EXISTS 'PROJECT_MANAGER';
ALTER TYPE "AiUsageFeature" ADD VALUE IF NOT EXISTS 'PROJECT_MODERATION';
ALTER TYPE "AiUsageFeature" ADD VALUE IF NOT EXISTS 'PROJECT_REPORT';

-- ---------------------------------------------------------------------------
-- 2. Nouveaux enums
-- ---------------------------------------------------------------------------
CREATE TYPE "ProjectStatus" AS ENUM ('PLANNED', 'ACTIVE', 'CLOSED', 'ARCHIVED');
CREATE TYPE "ProjectLivePhaseState" AS ENUM ('UPCOMING', 'LIVE', 'CLOSED');
CREATE TYPE "ProjectSectionKind" AS ENUM ('VOLUNTEERS', 'ADMIN', 'COMMUNICATION', 'LIVE', 'ACCOUNTING', 'CUSTOM');
CREATE TYPE "ProjectContributorRole" AS ENUM ('CONTRIBUTOR');
CREATE TYPE "ProjectLiveItemKind" AS ENUM ('PHOTO', 'VIDEO');
CREATE TYPE "ProjectLiveItemAiDecision" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'ERROR');
CREATE TYPE "ProjectLiveItemHumanDecision" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');
CREATE TYPE "ProjectLiveItemPublication" AS ENUM ('NONE', 'VITRINE_NEWS', 'VITRINE_BLOG', 'MEMBER_ANNOUNCEMENT');
CREATE TYPE "ProjectReportTemplate" AS ENUM ('COMPETITIF', 'FESTIF', 'BILAN');
CREATE TYPE "ProjectReportStatus" AS ENUM ('DRAFT', 'PUBLISHED');
CREATE TYPE "DistributionMailStatus" AS ENUM ('DRAFT', 'SENT', 'FAILED', 'UNSUBSCRIBED');

-- ---------------------------------------------------------------------------
-- 3. ClubProject (cœur du module)
-- ---------------------------------------------------------------------------
CREATE TABLE "ClubProject" (
    "id" TEXT NOT NULL,
    "clubId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT,
    "description" TEXT,
    "status" "ProjectStatus" NOT NULL DEFAULT 'PLANNED',
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "posterAssetId" TEXT,
    "coverImageId" TEXT,
    "budgetPlannedCents" INTEGER,
    "maxPhotosPerContributorPerPhase" INTEGER NOT NULL DEFAULT 10,
    "maxVideosPerContributorPerPhase" INTEGER NOT NULL DEFAULT 3,
    "showContributorCredits" BOOLEAN NOT NULL DEFAULT true,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClubProject_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ClubProject_clubId_slug_key" ON "ClubProject"("clubId", "slug");
CREATE INDEX "ClubProject_clubId_status_idx" ON "ClubProject"("clubId", "status");

ALTER TABLE "ClubProject"
  ADD CONSTRAINT "ClubProject_clubId_fkey"
  FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ClubProject"
  ADD CONSTRAINT "ClubProject_posterAssetId_fkey"
  FOREIGN KEY ("posterAssetId") REFERENCES "MediaAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ClubProject"
  ADD CONSTRAINT "ClubProject_coverImageId_fkey"
  FOREIGN KEY ("coverImageId") REFERENCES "MediaAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- 4. ProjectSection
-- ---------------------------------------------------------------------------
CREATE TABLE "ProjectSection" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "kind" "ProjectSectionKind" NOT NULL,
    "label" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "bodyJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectSection_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ProjectSection_projectId_sortOrder_idx" ON "ProjectSection"("projectId", "sortOrder");
ALTER TABLE "ProjectSection"
  ADD CONSTRAINT "ProjectSection_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "ClubProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- 5. ProjectLivePhase
-- ---------------------------------------------------------------------------
CREATE TABLE "ProjectLivePhase" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "state" "ProjectLivePhaseState" NOT NULL DEFAULT 'UPCOMING',
    "openedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectLivePhase_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ProjectLivePhase_projectId_startsAt_idx" ON "ProjectLivePhase"("projectId", "startsAt");
ALTER TABLE "ProjectLivePhase"
  ADD CONSTRAINT "ProjectLivePhase_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "ClubProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- 6. ProjectContributor (polymorphe Member|Contact)
-- ---------------------------------------------------------------------------
CREATE TABLE "ProjectContributor" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "memberId" TEXT,
    "contactId" TEXT,
    "role" "ProjectContributorRole" NOT NULL DEFAULT 'CONTRIBUTOR',
    "addedByUserId" TEXT NOT NULL,
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),
    "revokedReason" TEXT,

    CONSTRAINT "ProjectContributor_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ProjectContributor_projectId_revokedAt_idx" ON "ProjectContributor"("projectId", "revokedAt");
CREATE INDEX "ProjectContributor_memberId_idx" ON "ProjectContributor"("memberId");
CREATE INDEX "ProjectContributor_contactId_idx" ON "ProjectContributor"("contactId");

ALTER TABLE "ProjectContributor"
  ADD CONSTRAINT "ProjectContributor_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "ClubProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProjectContributor"
  ADD CONSTRAINT "ProjectContributor_memberId_fkey"
  FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProjectContributor"
  ADD CONSTRAINT "ProjectContributor_contactId_fkey"
  FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- 7. ProjectLiveItem
-- ---------------------------------------------------------------------------
CREATE TABLE "ProjectLiveItem" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "phaseId" TEXT,
    "contributorId" TEXT NOT NULL,
    "kind" "ProjectLiveItemKind" NOT NULL,
    "mediaAssetId" TEXT NOT NULL,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "submittedDuringLive" BOOLEAN NOT NULL DEFAULT true,
    "aiDecision" "ProjectLiveItemAiDecision" NOT NULL DEFAULT 'PENDING',
    "aiReason" TEXT,
    "aiScore" DOUBLE PRECISION,
    "aiCheckedAt" TIMESTAMP(3),
    "humanDecision" "ProjectLiveItemHumanDecision" NOT NULL DEFAULT 'PENDING',
    "humanDecidedBy" TEXT,
    "humanDecidedAt" TIMESTAMP(3),
    "publishedTo" "ProjectLiveItemPublication" NOT NULL DEFAULT 'NONE',
    "publishedRefId" TEXT,

    CONSTRAINT "ProjectLiveItem_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ProjectLiveItem_projectId_submittedAt_idx" ON "ProjectLiveItem"("projectId", "submittedAt");
CREATE INDEX "ProjectLiveItem_projectId_aiDecision_humanDecision_idx" ON "ProjectLiveItem"("projectId", "aiDecision", "humanDecision");
CREATE INDEX "ProjectLiveItem_contributorId_phaseId_kind_idx" ON "ProjectLiveItem"("contributorId", "phaseId", "kind");

ALTER TABLE "ProjectLiveItem"
  ADD CONSTRAINT "ProjectLiveItem_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "ClubProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProjectLiveItem"
  ADD CONSTRAINT "ProjectLiveItem_phaseId_fkey"
  FOREIGN KEY ("phaseId") REFERENCES "ProjectLivePhase"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ProjectLiveItem"
  ADD CONSTRAINT "ProjectLiveItem_contributorId_fkey"
  FOREIGN KEY ("contributorId") REFERENCES "ProjectContributor"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProjectLiveItem"
  ADD CONSTRAINT "ProjectLiveItem_mediaAssetId_fkey"
  FOREIGN KEY ("mediaAssetId") REFERENCES "MediaAsset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- 8. ProjectReport
-- ---------------------------------------------------------------------------
CREATE TABLE "ProjectReport" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "template" "ProjectReportTemplate" NOT NULL,
    "status" "ProjectReportStatus" NOT NULL DEFAULT 'DRAFT',
    "title" TEXT NOT NULL,
    "bodyJson" JSONB NOT NULL,
    "sourceLiveItemIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "sourceContributorMemberIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "sourceContributorContactIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "publishedTo" "ProjectLiveItemPublication" NOT NULL DEFAULT 'NONE',
    "publishedRefId" TEXT,
    "generatedByAgentConversationId" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "publishedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectReport_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ProjectReport_projectId_status_idx" ON "ProjectReport"("projectId", "status");
ALTER TABLE "ProjectReport"
  ADD CONSTRAINT "ProjectReport_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "ClubProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- 9. DistributionList + DistributionContact + ProjectDistribution + Send
-- ---------------------------------------------------------------------------
CREATE TABLE "DistributionList" (
    "id" TEXT NOT NULL,
    "clubId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DistributionList_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "DistributionList_clubId_name_key" ON "DistributionList"("clubId", "name");
ALTER TABLE "DistributionList"
  ADD CONSTRAINT "DistributionList_clubId_fkey"
  FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "DistributionContact" (
    "id" TEXT NOT NULL,
    "listId" TEXT NOT NULL,
    "firstName" TEXT,
    "lastName" TEXT,
    "organization" TEXT,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "consentGivenAt" TIMESTAMP(3) NOT NULL,
    "consentSource" TEXT NOT NULL,
    "consentRevokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DistributionContact_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "DistributionContact_listId_email_key" ON "DistributionContact"("listId", "email");
CREATE INDEX "DistributionContact_email_idx" ON "DistributionContact"("email");
ALTER TABLE "DistributionContact"
  ADD CONSTRAINT "DistributionContact_listId_fkey"
  FOREIGN KEY ("listId") REFERENCES "DistributionList"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "ProjectDistribution" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "listId" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "bodyHtml" TEXT NOT NULL,
    "bodyText" TEXT,
    "attachedMediaAssetIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "aiDraftedAt" TIMESTAMP(3),
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMP(3),

    CONSTRAINT "ProjectDistribution_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ProjectDistribution_projectId_idx" ON "ProjectDistribution"("projectId");
CREATE INDEX "ProjectDistribution_listId_idx" ON "ProjectDistribution"("listId");
ALTER TABLE "ProjectDistribution"
  ADD CONSTRAINT "ProjectDistribution_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "ClubProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProjectDistribution"
  ADD CONSTRAINT "ProjectDistribution_listId_fkey"
  FOREIGN KEY ("listId") REFERENCES "DistributionList"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "DistributionSend" (
    "id" TEXT NOT NULL,
    "distributionId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "status" "DistributionMailStatus" NOT NULL DEFAULT 'DRAFT',
    "unsubscribeToken" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "openedAt" TIMESTAMP(3),
    "errorMessage" TEXT,

    CONSTRAINT "DistributionSend_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "DistributionSend_unsubscribeToken_key" ON "DistributionSend"("unsubscribeToken");
CREATE INDEX "DistributionSend_distributionId_status_idx" ON "DistributionSend"("distributionId", "status");
ALTER TABLE "DistributionSend"
  ADD CONSTRAINT "DistributionSend_distributionId_fkey"
  FOREIGN KEY ("distributionId") REFERENCES "ProjectDistribution"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DistributionSend"
  ADD CONSTRAINT "DistributionSend_contactId_fkey"
  FOREIGN KEY ("contactId") REFERENCES "DistributionContact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- 10. FK ajoutées sur modèles existants (toutes nullables, rollback sûr)
-- ---------------------------------------------------------------------------
ALTER TABLE "ClubEvent" ADD COLUMN "projectId" TEXT;
CREATE INDEX "ClubEvent_projectId_idx" ON "ClubEvent"("projectId");
ALTER TABLE "ClubEvent"
  ADD CONSTRAINT "ClubEvent_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "ClubProject"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "AccountingEntry" ADD COLUMN "projectId" TEXT;
CREATE INDEX "AccountingEntry_clubId_projectId_idx" ON "AccountingEntry"("clubId", "projectId");
ALTER TABLE "AccountingEntry"
  ADD CONSTRAINT "AccountingEntry_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "ClubProject"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "MessageCampaign" ADD COLUMN "projectId" TEXT;
CREATE INDEX "MessageCampaign_projectId_idx" ON "MessageCampaign"("projectId");
ALTER TABLE "MessageCampaign"
  ADD CONSTRAINT "MessageCampaign_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "ClubProject"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "AgentConversation" ADD COLUMN "projectId" TEXT;
CREATE INDEX "AgentConversation_projectId_idx" ON "AgentConversation"("projectId");
ALTER TABLE "AgentConversation"
  ADD CONSTRAINT "AgentConversation_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "ClubProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- 11. Seed ModuleDefinition PROJECTS (idempotent)
-- ---------------------------------------------------------------------------
INSERT INTO "ModuleDefinition" ("code", "label", "isRequired", "description")
VALUES ('PROJECTS', 'Événements / Projets', false, 'Projets long-terme avec sections, contributeurs, phases LIVE, comptes-rendus IA et listes de diffusion.')
ON CONFLICT ("code") DO UPDATE SET
  "label" = EXCLUDED."label",
  "description" = EXCLUDED."description";
