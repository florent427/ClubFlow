-- Module COMPTABILITÉ ANALYTIQUE IA — Partie 2/2 (cf. plan
-- glowing-bubbling-llama.md). Les ALTER TYPE sont dans la migration
-- 20260501100000_accounting_analytic_enums (contrainte Postgres : nouvelle
-- valeur d'enum non utilisable dans la même transaction que sa création).
-- Cette migration : nouveaux enums + 18 tables + colonnes additives +
-- UPDATE des legacy values + backfill entries existantes + seed plan
-- comptable curated + cohortes defaults + mappings par défaut.

-- ---------------------------------------------------------------------------
-- 1. Migration de données : SUBMITTED -> REQUESTED (valeur legacy remplacée
--    par la nouvelle terminologie du workflow complet). Les ALTER TYPE ont
--    été committés dans la migration précédente donc REQUESTED est utilisable.
-- ---------------------------------------------------------------------------
UPDATE "GrantApplication" SET "status" = 'REQUESTED' WHERE "status" = 'SUBMITTED';

-- ---------------------------------------------------------------------------
-- 2. Nouveaux enums
-- ---------------------------------------------------------------------------
CREATE TYPE "Gender" AS ENUM ('MALE', 'FEMALE', 'OTHER', 'UNSPECIFIED');
CREATE TYPE "VatMode" AS ENUM ('NONE', 'MIXED', 'FULL');
CREATE TYPE "AccountingEntryStatus" AS ENUM ('DRAFT', 'NEEDS_REVIEW', 'POSTED', 'LOCKED', 'CANCELLED');
CREATE TYPE "AccountingEntrySource" AS ENUM (
  'MANUAL', 'OCR_AI', 'AUTO_MEMBER_PAYMENT', 'AUTO_SUBSIDY',
  'AUTO_SPONSORSHIP', 'AUTO_SHOP', 'AUTO_REFUND', 'AUTO_STRIPE_FEES'
);
CREATE TYPE "AccountingLineSide" AS ENUM ('AUTO', 'DEBIT', 'CREDIT');
CREATE TYPE "AccountingAccountKind" AS ENUM ('INCOME', 'EXPENSE', 'ASSET', 'LIABILITY', 'NEUTRAL_IN_KIND');
CREATE TYPE "AccountingDocumentKind" AS ENUM ('RECEIPT', 'INVOICE', 'QUOTE', 'CONTRACT', 'REPORT', 'OTHER');
CREATE TYPE "AccountingAuditAction" AS ENUM (
  'CREATE', 'UPDATE', 'LOCK', 'UNLOCK', 'CANCEL', 'CONTRAPASS', 'EXPORT', 'FISCAL_YEAR_CLOSE'
);
CREATE TYPE "GrantDocumentKind" AS ENUM ('APPLICATION', 'DECISION', 'INVOICE', 'REPORT', 'OTHER');
CREATE TYPE "SponsorshipKind" AS ENUM ('CASH', 'IN_KIND');
CREATE TYPE "SponsorshipDocumentKind" AS ENUM ('CONTRACT', 'INVOICE', 'RECEIPT', 'OTHER');

-- ---------------------------------------------------------------------------
-- 3. Extensions de modèles existants
-- ---------------------------------------------------------------------------

-- Club : vatMode + budget IA mensuel
ALTER TABLE "Club"
  ADD COLUMN "vatMode" "VatMode" NOT NULL DEFAULT 'NONE',
  ADD COLUMN "aiMonthlyBudgetCents" INTEGER,
  ADD COLUMN "aiMonthlyBudgetOverrideCents" INTEGER;

-- Member : gender
ALTER TABLE "Member"
  ADD COLUMN "gender" "Gender" NOT NULL DEFAULT 'UNSPECIFIED';

-- MembershipProduct : disciplineCode
ALTER TABLE "MembershipProduct"
  ADD COLUMN "disciplineCode" TEXT;

-- MediaAsset : sha256 pour déduplication
ALTER TABLE "MediaAsset"
  ADD COLUMN "sha256" TEXT;

CREATE INDEX "MediaAsset_clubId_sha256_idx" ON "MediaAsset"("clubId", "sha256");

-- AccountingEntry : extensions non-breaking (status + source + nouvelles FK
-- + contrepassation + cancellation + audit fields)
ALTER TABLE "AccountingEntry"
  ADD COLUMN "status" "AccountingEntryStatus" NOT NULL DEFAULT 'POSTED',
  ADD COLUMN "source" "AccountingEntrySource" NOT NULL DEFAULT 'MANUAL',
  ADD COLUMN "vatTotalCents" INTEGER,
  ADD COLUMN "subsidyId" TEXT,
  ADD COLUMN "sponsorshipDealId" TEXT,
  ADD COLUMN "extractionId" TEXT,
  ADD COLUMN "contraEntryId" TEXT,
  ADD COLUMN "lockedAt" TIMESTAMP(3),
  ADD COLUMN "cancelledAt" TIMESTAMP(3),
  ADD COLUMN "cancelledByUserId" TEXT,
  ADD COLUMN "createdByUserId" TEXT,
  ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Backfill entries existantes : AUTO_MEMBER_PAYMENT si paymentId non null.
UPDATE "AccountingEntry" SET "source" = 'AUTO_MEMBER_PAYMENT' WHERE "paymentId" IS NOT NULL;

CREATE INDEX "AccountingEntry_clubId_status_idx" ON "AccountingEntry"("clubId", "status");
CREATE INDEX "AccountingEntry_clubId_source_idx" ON "AccountingEntry"("clubId", "source");

-- GrantApplication : extensions workflow complet
ALTER TABLE "GrantApplication"
  ADD COLUMN "fundingBody" TEXT,
  ADD COLUMN "requestedAmountCents" INTEGER,
  ADD COLUMN "grantedAmountCents" INTEGER,
  ADD COLUMN "projectId" TEXT,
  ADD COLUMN "startsAt" TIMESTAMP(3),
  ADD COLUMN "endsAt" TIMESTAMP(3),
  ADD COLUMN "reportDueAt" TIMESTAMP(3),
  ADD COLUMN "reportSubmittedAt" TIMESTAMP(3),
  ADD COLUMN "createdByUserId" TEXT;

CREATE INDEX "GrantApplication_clubId_status_idx" ON "GrantApplication"("clubId", "status");
CREATE INDEX "GrantApplication_clubId_reportDueAt_idx" ON "GrantApplication"("clubId", "reportDueAt");

-- SponsorshipDeal : extensions cash + nature
ALTER TABLE "SponsorshipDeal"
  ADD COLUMN "kind" "SponsorshipKind" NOT NULL DEFAULT 'CASH',
  ADD COLUMN "valueCents" INTEGER,
  ADD COLUMN "inKindDescription" TEXT,
  ADD COLUMN "projectId" TEXT,
  ADD COLUMN "contactId" TEXT,
  ADD COLUMN "startsAt" TIMESTAMP(3),
  ADD COLUMN "endsAt" TIMESTAMP(3),
  ADD COLUMN "createdByUserId" TEXT;

CREATE INDEX "SponsorshipDeal_clubId_status_idx" ON "SponsorshipDeal"("clubId", "status");

-- ---------------------------------------------------------------------------
-- 4. Nouvelles tables : référentiel
-- ---------------------------------------------------------------------------
CREATE TABLE "AccountingAccount" (
  "id" TEXT NOT NULL,
  "clubId" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "kind" "AccountingAccountKind" NOT NULL,
  "isDefault" BOOLEAN NOT NULL DEFAULT false,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AccountingAccount_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "AccountingAccount_clubId_code_key" ON "AccountingAccount"("clubId", "code");
CREATE INDEX "AccountingAccount_clubId_kind_idx" ON "AccountingAccount"("clubId", "kind");
CREATE INDEX "AccountingAccount_clubId_isActive_idx" ON "AccountingAccount"("clubId", "isActive");

CREATE TABLE "AccountingAccountMapping" (
  "id" TEXT NOT NULL,
  "clubId" TEXT NOT NULL,
  "sourceType" TEXT NOT NULL,
  "sourceId" TEXT,
  "accountId" TEXT NOT NULL,
  "accountCode" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AccountingAccountMapping_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "AccountingAccountMapping_clubId_sourceType_sourceId_key" ON "AccountingAccountMapping"("clubId", "sourceType", "sourceId");
CREATE INDEX "AccountingAccountMapping_clubId_sourceType_idx" ON "AccountingAccountMapping"("clubId", "sourceType");

CREATE TABLE "AccountingCohort" (
  "id" TEXT NOT NULL,
  "clubId" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "minAge" INTEGER,
  "maxAge" INTEGER,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "isDefault" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AccountingCohort_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "AccountingCohort_clubId_code_key" ON "AccountingCohort"("clubId", "code");
CREATE INDEX "AccountingCohort_clubId_idx" ON "AccountingCohort"("clubId");

-- ---------------------------------------------------------------------------
-- 5. Nouvelles tables : lignes + allocations
-- ---------------------------------------------------------------------------
CREATE TABLE "AccountingEntryLine" (
  "id" TEXT NOT NULL,
  "entryId" TEXT NOT NULL,
  "clubId" TEXT NOT NULL,
  "accountCode" TEXT NOT NULL,
  "accountLabel" TEXT NOT NULL,
  "label" TEXT,
  "side" "AccountingLineSide" NOT NULL DEFAULT 'AUTO',
  "debitCents" INTEGER NOT NULL DEFAULT 0,
  "creditCents" INTEGER NOT NULL DEFAULT 0,
  "vatRate" DECIMAL(5, 2),
  "vatAmountCents" INTEGER,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "bankReconciledAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AccountingEntryLine_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "AccountingEntryLine_entryId_idx" ON "AccountingEntryLine"("entryId");
CREATE INDEX "AccountingEntryLine_clubId_accountCode_idx" ON "AccountingEntryLine"("clubId", "accountCode");

-- Check constraint : exactement un côté > 0 (partie double).
ALTER TABLE "AccountingEntryLine"
  ADD CONSTRAINT "AccountingEntryLine_side_xor_check"
  CHECK (
    ("debitCents" > 0 AND "creditCents" = 0)
    OR ("creditCents" > 0 AND "debitCents" = 0)
    OR ("debitCents" = 0 AND "creditCents" = 0) -- cas transitoire création
  );

CREATE TABLE "AccountingAllocation" (
  "id" TEXT NOT NULL,
  "lineId" TEXT NOT NULL,
  "clubId" TEXT NOT NULL,
  "amountCents" INTEGER NOT NULL,
  "projectId" TEXT,
  "cohortCode" TEXT,
  "gender" "Gender",
  "disciplineCode" TEXT,
  "memberId" TEXT,
  "memberIdAnonymized" BOOLEAN NOT NULL DEFAULT false,
  "dynamicGroupIdsSnapshot" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "dynamicGroupLabelsSnapshot" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "freeformTags" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AccountingAllocation_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "AccountingAllocation_clubId_projectId_idx" ON "AccountingAllocation"("clubId", "projectId");
CREATE INDEX "AccountingAllocation_clubId_cohortCode_idx" ON "AccountingAllocation"("clubId", "cohortCode");
CREATE INDEX "AccountingAllocation_clubId_disciplineCode_idx" ON "AccountingAllocation"("clubId", "disciplineCode");
CREATE INDEX "AccountingAllocation_memberId_idx" ON "AccountingAllocation"("memberId");
CREATE INDEX "AccountingAllocation_lineId_idx" ON "AccountingAllocation"("lineId");

CREATE TABLE "AccountingAllocationGroupTag" (
  "id" TEXT NOT NULL,
  "allocationId" TEXT NOT NULL,
  "clubId" TEXT NOT NULL,
  "groupId" TEXT NOT NULL,
  "groupLabel" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AccountingAllocationGroupTag_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "AccountingAllocationGroupTag_allocationId_groupId_key" ON "AccountingAllocationGroupTag"("allocationId", "groupId");
CREATE INDEX "AccountingAllocationGroupTag_clubId_groupId_idx" ON "AccountingAllocationGroupTag"("clubId", "groupId");

-- ---------------------------------------------------------------------------
-- 6. Nouvelles tables : verrouillage
-- ---------------------------------------------------------------------------
CREATE TABLE "AccountingPeriodLock" (
  "id" TEXT NOT NULL,
  "clubId" TEXT NOT NULL,
  "month" TEXT NOT NULL,
  "lockedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lockedByUserId" TEXT NOT NULL,
  CONSTRAINT "AccountingPeriodLock_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "AccountingPeriodLock_clubId_month_key" ON "AccountingPeriodLock"("clubId", "month");
CREATE INDEX "AccountingPeriodLock_clubId_idx" ON "AccountingPeriodLock"("clubId");

CREATE TABLE "AccountingFiscalYearClose" (
  "id" TEXT NOT NULL,
  "clubId" TEXT NOT NULL,
  "year" INTEGER NOT NULL,
  "closedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "closedByUserId" TEXT NOT NULL,
  "snapshotJson" JSONB,
  CONSTRAINT "AccountingFiscalYearClose_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "AccountingFiscalYearClose_clubId_year_key" ON "AccountingFiscalYearClose"("clubId", "year");
CREATE INDEX "AccountingFiscalYearClose_clubId_idx" ON "AccountingFiscalYearClose"("clubId");

-- ---------------------------------------------------------------------------
-- 7. Nouvelles tables : IA / OCR + budget
-- ---------------------------------------------------------------------------
CREATE TABLE "AccountingExtraction" (
  "id" TEXT NOT NULL,
  "clubId" TEXT NOT NULL,
  "mediaAssetId" TEXT NOT NULL,
  "rawJson" JSONB NOT NULL,
  "confidencePerField" JSONB NOT NULL,
  "extractedTotalCents" INTEGER,
  "extractedVatCents" INTEGER,
  "extractedDate" TIMESTAMP(3),
  "extractedVendor" TEXT,
  "extractedAccountCode" TEXT,
  "model" TEXT NOT NULL,
  "inputTokens" INTEGER NOT NULL DEFAULT 0,
  "outputTokens" INTEGER NOT NULL DEFAULT 0,
  "costCents" INTEGER NOT NULL DEFAULT 0,
  "pageCount" INTEGER NOT NULL DEFAULT 1,
  "error" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AccountingExtraction_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "AccountingExtraction_clubId_createdAt_idx" ON "AccountingExtraction"("clubId", "createdAt");

CREATE TABLE "AiMonthlyUsage" (
  "id" TEXT NOT NULL,
  "clubId" TEXT NOT NULL,
  "yearMonth" TEXT NOT NULL,
  "totalCostCents" INTEGER NOT NULL DEFAULT 0,
  "inputTokens" BIGINT NOT NULL DEFAULT 0,
  "outputTokens" BIGINT NOT NULL DEFAULT 0,
  "imagesGenerated" INTEGER NOT NULL DEFAULT 0,
  "featureBreakdown" JSONB NOT NULL DEFAULT '{}',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AiMonthlyUsage_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "AiMonthlyUsage_clubId_yearMonth_key" ON "AiMonthlyUsage"("clubId", "yearMonth");
CREATE INDEX "AiMonthlyUsage_clubId_idx" ON "AiMonthlyUsage"("clubId");

-- ---------------------------------------------------------------------------
-- 8. Nouvelles tables : audit + documents
-- ---------------------------------------------------------------------------
CREATE TABLE "AccountingAuditLog" (
  "id" TEXT NOT NULL,
  "clubId" TEXT NOT NULL,
  "entryId" TEXT,
  "userId" TEXT NOT NULL,
  "action" "AccountingAuditAction" NOT NULL,
  "diffJson" JSONB,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AccountingAuditLog_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "AccountingAuditLog_clubId_createdAt_idx" ON "AccountingAuditLog"("clubId", "createdAt");
CREATE INDEX "AccountingAuditLog_entryId_idx" ON "AccountingAuditLog"("entryId");

CREATE TABLE "AccountingDocument" (
  "id" TEXT NOT NULL,
  "clubId" TEXT NOT NULL,
  "entryId" TEXT NOT NULL,
  "mediaAssetId" TEXT NOT NULL,
  "kind" "AccountingDocumentKind" NOT NULL DEFAULT 'RECEIPT',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AccountingDocument_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "AccountingDocument_entryId_mediaAssetId_key" ON "AccountingDocument"("entryId", "mediaAssetId");
CREATE INDEX "AccountingDocument_clubId_idx" ON "AccountingDocument"("clubId");

-- ---------------------------------------------------------------------------
-- 9. Nouvelles tables : subventions étendues
-- ---------------------------------------------------------------------------
CREATE TABLE "GrantInstallment" (
  "id" TEXT NOT NULL,
  "grantId" TEXT NOT NULL,
  "clubId" TEXT NOT NULL,
  "expectedAmountCents" INTEGER NOT NULL,
  "receivedAmountCents" INTEGER,
  "expectedAt" TIMESTAMP(3),
  "receivedAt" TIMESTAMP(3),
  "paymentId" TEXT,
  "accountingEntryId" TEXT,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "GrantInstallment_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "GrantInstallment_grantId_idx" ON "GrantInstallment"("grantId");
CREATE INDEX "GrantInstallment_clubId_idx" ON "GrantInstallment"("clubId");

CREATE TABLE "GrantDocument" (
  "id" TEXT NOT NULL,
  "grantId" TEXT NOT NULL,
  "clubId" TEXT NOT NULL,
  "mediaAssetId" TEXT NOT NULL,
  "kind" "GrantDocumentKind" NOT NULL DEFAULT 'OTHER',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "GrantDocument_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "GrantDocument_grantId_mediaAssetId_key" ON "GrantDocument"("grantId", "mediaAssetId");
CREATE INDEX "GrantDocument_clubId_idx" ON "GrantDocument"("clubId");

-- ---------------------------------------------------------------------------
-- 10. Nouvelles tables : sponsoring étendu
-- ---------------------------------------------------------------------------
CREATE TABLE "SponsorshipInstallment" (
  "id" TEXT NOT NULL,
  "dealId" TEXT NOT NULL,
  "clubId" TEXT NOT NULL,
  "expectedAmountCents" INTEGER NOT NULL,
  "receivedAmountCents" INTEGER,
  "expectedAt" TIMESTAMP(3),
  "receivedAt" TIMESTAMP(3),
  "paymentId" TEXT,
  "accountingEntryId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SponsorshipInstallment_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "SponsorshipInstallment_dealId_idx" ON "SponsorshipInstallment"("dealId");
CREATE INDEX "SponsorshipInstallment_clubId_idx" ON "SponsorshipInstallment"("clubId");

CREATE TABLE "SponsorshipDocument" (
  "id" TEXT NOT NULL,
  "dealId" TEXT NOT NULL,
  "clubId" TEXT NOT NULL,
  "mediaAssetId" TEXT NOT NULL,
  "kind" "SponsorshipDocumentKind" NOT NULL DEFAULT 'OTHER',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SponsorshipDocument_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "SponsorshipDocument_dealId_mediaAssetId_key" ON "SponsorshipDocument"("dealId", "mediaAssetId");
CREATE INDEX "SponsorshipDocument_clubId_idx" ON "SponsorshipDocument"("clubId");

-- ---------------------------------------------------------------------------
-- 11. Foreign keys
-- ---------------------------------------------------------------------------
-- AccountingEntry new FKs
ALTER TABLE "AccountingEntry"
  ADD CONSTRAINT "AccountingEntry_subsidyId_fkey" FOREIGN KEY ("subsidyId") REFERENCES "GrantApplication"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "AccountingEntry_sponsorshipDealId_fkey" FOREIGN KEY ("sponsorshipDealId") REFERENCES "SponsorshipDeal"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "AccountingEntry_extractionId_fkey" FOREIGN KEY ("extractionId") REFERENCES "AccountingExtraction"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "AccountingEntry_contraEntryId_fkey" FOREIGN KEY ("contraEntryId") REFERENCES "AccountingEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AccountingEntryLine
ALTER TABLE "AccountingEntryLine"
  ADD CONSTRAINT "AccountingEntryLine_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "AccountingEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AccountingAllocation
ALTER TABLE "AccountingAllocation"
  ADD CONSTRAINT "AccountingAllocation_lineId_fkey" FOREIGN KEY ("lineId") REFERENCES "AccountingEntryLine"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "AccountingAllocation_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "ClubProject"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "AccountingAllocation_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "AccountingAllocation_cohort_fkey" FOREIGN KEY ("clubId", "cohortCode") REFERENCES "AccountingCohort"("clubId", "code") ON DELETE SET NULL ON UPDATE CASCADE;

-- AccountingAllocationGroupTag
ALTER TABLE "AccountingAllocationGroupTag"
  ADD CONSTRAINT "AccountingAllocationGroupTag_allocationId_fkey" FOREIGN KEY ("allocationId") REFERENCES "AccountingAllocation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AccountingAccount
ALTER TABLE "AccountingAccount"
  ADD CONSTRAINT "AccountingAccount_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AccountingAccountMapping
ALTER TABLE "AccountingAccountMapping"
  ADD CONSTRAINT "AccountingAccountMapping_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "AccountingAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AccountingCohort
ALTER TABLE "AccountingCohort"
  ADD CONSTRAINT "AccountingCohort_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AccountingPeriodLock
ALTER TABLE "AccountingPeriodLock"
  ADD CONSTRAINT "AccountingPeriodLock_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AccountingFiscalYearClose
ALTER TABLE "AccountingFiscalYearClose"
  ADD CONSTRAINT "AccountingFiscalYearClose_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AccountingExtraction
ALTER TABLE "AccountingExtraction"
  ADD CONSTRAINT "AccountingExtraction_mediaAssetId_fkey" FOREIGN KEY ("mediaAssetId") REFERENCES "MediaAsset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AiMonthlyUsage
ALTER TABLE "AiMonthlyUsage"
  ADD CONSTRAINT "AiMonthlyUsage_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AccountingAuditLog
ALTER TABLE "AccountingAuditLog"
  ADD CONSTRAINT "AccountingAuditLog_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "AccountingAuditLog_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "AccountingEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AccountingDocument
ALTER TABLE "AccountingDocument"
  ADD CONSTRAINT "AccountingDocument_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "AccountingEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "AccountingDocument_mediaAssetId_fkey" FOREIGN KEY ("mediaAssetId") REFERENCES "MediaAsset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- GrantApplication
ALTER TABLE "GrantApplication"
  ADD CONSTRAINT "GrantApplication_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "ClubProject"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- GrantInstallment
ALTER TABLE "GrantInstallment"
  ADD CONSTRAINT "GrantInstallment_grantId_fkey" FOREIGN KEY ("grantId") REFERENCES "GrantApplication"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "GrantInstallment_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "GrantInstallment_accountingEntryId_fkey" FOREIGN KEY ("accountingEntryId") REFERENCES "AccountingEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- GrantDocument
ALTER TABLE "GrantDocument"
  ADD CONSTRAINT "GrantDocument_grantId_fkey" FOREIGN KEY ("grantId") REFERENCES "GrantApplication"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "GrantDocument_mediaAssetId_fkey" FOREIGN KEY ("mediaAssetId") REFERENCES "MediaAsset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- SponsorshipDeal
ALTER TABLE "SponsorshipDeal"
  ADD CONSTRAINT "SponsorshipDeal_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "ClubProject"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "SponsorshipDeal_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- SponsorshipInstallment
ALTER TABLE "SponsorshipInstallment"
  ADD CONSTRAINT "SponsorshipInstallment_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "SponsorshipDeal"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "SponsorshipInstallment_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "SponsorshipInstallment_accountingEntryId_fkey" FOREIGN KEY ("accountingEntryId") REFERENCES "AccountingEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- SponsorshipDocument
ALTER TABLE "SponsorshipDocument"
  ADD CONSTRAINT "SponsorshipDocument_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "SponsorshipDeal"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "SponsorshipDocument_mediaAssetId_fkey" FOREIGN KEY ("mediaAssetId") REFERENCES "MediaAsset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- 12. Backfill : créer les cohortes defaults, le plan comptable et les
--     mappings pour chaque club qui a le module ACCOUNTING activé.
--     Seedé automatiquement par `ClubModulesService.enable(ACCOUNTING)`,
--     mais on initialise rétroactivement les clubs existants ici.
-- ---------------------------------------------------------------------------

-- Cohortes defaults pour tous les clubs existants
INSERT INTO "AccountingCohort" ("id", "clubId", "code", "label", "minAge", "maxAge", "sortOrder", "isDefault", "createdAt", "updatedAt")
SELECT
  gen_random_uuid()::text,
  c."id",
  v.code,
  v.label,
  v.min_age,
  v.max_age,
  v.sort_order,
  true,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "Club" c
CROSS JOIN (VALUES
  ('BABY',   'Baby (0-5 ans)',   0,   5,   1),
  ('ENFANT', 'Enfants (6-11 ans)', 6,  11,  2),
  ('ADO',    'Ados (12-17 ans)', 12,  17,  3),
  ('ADULTE', 'Adultes (18-59 ans)', 18, 59, 4),
  ('SENIOR', 'Seniors (60+ ans)', 60,  NULL, 5)
) AS v(code, label, min_age, max_age, sort_order)
ON CONFLICT ("clubId", "code") DO NOTHING;

-- Plan comptable curated : ~30 comptes PCG associatif essentiels
INSERT INTO "AccountingAccount" ("id", "clubId", "code", "label", "kind", "isDefault", "sortOrder", "createdAt", "updatedAt")
SELECT
  gen_random_uuid()::text,
  c."id",
  v.code,
  v.label,
  v.kind::"AccountingAccountKind",
  true,
  v.sort_order,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "Club" c
CROSS JOIN (VALUES
  -- Charges (dépenses)
  ('606100', 'Fournitures non stockables (eau, énergie)', 'EXPENSE', 10),
  ('606300', 'Petit équipement',                           'EXPENSE', 11),
  ('606400', 'Fournitures administratives',                'EXPENSE', 12),
  ('606800', 'Autres matières et fournitures',             'EXPENSE', 13),
  ('611000', 'Sous-traitance générale',                    'EXPENSE', 20),
  ('613200', 'Locations immobilières',                     'EXPENSE', 21),
  ('613500', 'Locations mobilières (matériel sportif)',    'EXPENSE', 22),
  ('615000', 'Entretien et réparations',                   'EXPENSE', 23),
  ('616000', 'Primes d''assurances',                       'EXPENSE', 24),
  ('618000', 'Documentation, cotisations fédérales',       'EXPENSE', 25),
  ('622600', 'Honoraires',                                 'EXPENSE', 30),
  ('623000', 'Publicité, communication',                   'EXPENSE', 31),
  ('624000', 'Transports et déplacements',                 'EXPENSE', 32),
  ('625100', 'Frais de déplacement bénévoles',             'EXPENSE', 33),
  ('626000', 'Frais postaux et télécommunications',        'EXPENSE', 34),
  ('627000', 'Services bancaires (frais Stripe, virements)', 'EXPENSE', 35),
  ('641000', 'Rémunérations du personnel',                 'EXPENSE', 40),
  ('645000', 'Charges sociales',                           'EXPENSE', 41),
  -- Produits (recettes)
  ('706100', 'Cotisations membres (adhésions)',            'INCOME',  50),
  ('708000', 'Produits des activités annexes (licences, stages)', 'INCOME', 51),
  ('740000', 'Subventions d''exploitation',                'INCOME',  60),
  ('741000', 'Subventions État / ANS',                     'INCOME',  61),
  ('742000', 'Subventions Collectivités territoriales',    'INCOME',  62),
  ('743000', 'Subventions organismes privés (FDVA, fondations)', 'INCOME', 63),
  ('754000', 'Sponsoring / Mécénat',                       'INCOME',  70),
  ('756000', 'Dons manuels',                               'INCOME',  71),
  ('758000', 'Produits divers de gestion courante',        'INCOME',  72),
  -- Actif / passif / trésorerie
  ('411000', 'Clients / Cotisants',                        'ASSET',   80),
  ('512000', 'Banque',                                     'ASSET',   81),
  ('530000', 'Caisse',                                     'ASSET',   82),
  -- Contributions en nature (contre-passation neutre)
  ('860000', 'Secours en nature, prestations',             'NEUTRAL_IN_KIND', 90),
  ('861000', 'Mise à disposition gratuite de biens',       'NEUTRAL_IN_KIND', 91),
  ('864000', 'Personnel bénévole',                         'NEUTRAL_IN_KIND', 92),
  ('870000', 'Bénévolat (contrepartie)',                   'NEUTRAL_IN_KIND', 93),
  ('871000', 'Prestations en nature (contrepartie)',       'NEUTRAL_IN_KIND', 94),
  ('875000', 'Dons en nature (contrepartie)',              'NEUTRAL_IN_KIND', 95)
) AS v(code, label, kind, sort_order)
ON CONFLICT ("clubId", "code") DO NOTHING;

-- Mappings par défaut : quel compte utiliser pour chaque type de source auto
INSERT INTO "AccountingAccountMapping" ("id", "clubId", "sourceType", "sourceId", "accountId", "accountCode", "createdAt", "updatedAt")
SELECT
  gen_random_uuid()::text,
  a."clubId",
  v.source_type,
  NULL,
  a."id",
  a."code",
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "AccountingAccount" a
INNER JOIN (VALUES
  ('MEMBERSHIP_PRODUCT',       '706100'),
  ('MEMBERSHIP_ONE_TIME_FEE',  '708000'),
  ('SHOP_PRODUCT',             '708000'),
  ('SUBSIDY',                  '740000'),
  ('SPONSORSHIP_CASH',         '754000'),
  ('SPONSORSHIP_IN_KIND',      '871000'),
  ('STRIPE_FEE',               '627000'),
  ('BANK_ACCOUNT',             '512000'),
  ('REFUND',                   '706100')
) AS v(source_type, account_code) ON a."code" = v.account_code
WHERE a."isDefault" = true
ON CONFLICT ("clubId", "sourceType", "sourceId") DO NOTHING;

-- Backfill AccountingEntry existantes : générer 1 ligne + 1 allocation par entry
-- afin que la vue "partie double" fonctionne rétroactivement sans cracher l'UI.
-- Chaque entry existante INCOME → ligne compte 706100 crédit, EXPENSE → ligne
-- compte 606800 débit (fallback générique ; le trésorier reclassifiera si besoin).
INSERT INTO "AccountingEntryLine" ("id", "entryId", "clubId", "accountCode", "accountLabel", "side", "debitCents", "creditCents", "sortOrder", "createdAt")
SELECT
  gen_random_uuid()::text,
  e."id",
  e."clubId",
  CASE WHEN e."kind" = 'INCOME' THEN '706100' ELSE '606800' END,
  CASE WHEN e."kind" = 'INCOME' THEN 'Cotisations membres (adhésions)' ELSE 'Autres matières et fournitures' END,
  CASE WHEN e."kind" = 'INCOME' THEN 'CREDIT' ELSE 'DEBIT' END::"AccountingLineSide",
  CASE WHEN e."kind" = 'INCOME' THEN 0 ELSE e."amountCents" END,
  CASE WHEN e."kind" = 'INCOME' THEN e."amountCents" ELSE 0 END,
  0,
  e."createdAt"
FROM "AccountingEntry" e
WHERE NOT EXISTS (SELECT 1 FROM "AccountingEntryLine" l WHERE l."entryId" = e."id");

-- Allocation orpheline (pas de projet / cohorte) pour les entries backfill
INSERT INTO "AccountingAllocation" ("id", "lineId", "clubId", "amountCents", "createdAt")
SELECT
  gen_random_uuid()::text,
  l."id",
  l."clubId",
  l."debitCents" + l."creditCents",
  l."createdAt"
FROM "AccountingEntryLine" l
INNER JOIN "AccountingEntry" e ON e."id" = l."entryId"
WHERE NOT EXISTS (SELECT 1 FROM "AccountingAllocation" a WHERE a."lineId" = l."id");
