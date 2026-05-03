-- ============================================================================
-- Migration : multi-comptes financiers (banques, caisses, transit Stripe)
-- + champs consolidation des écritures
--
-- Non destructive : toutes les colonnes ajoutées sont nullable, FKs SET NULL
-- ou RESTRICT pour préserver l'historique. Backfill idempotent en fin.
-- ============================================================================

-- 1) Nouvel enum
CREATE TYPE "ClubFinancialAccountKind" AS ENUM ('BANK', 'CASH', 'STRIPE_TRANSIT', 'OTHER_TRANSIT');

-- 2) Nouvelles tables
CREATE TABLE "ClubFinancialAccount" (
    "id" TEXT NOT NULL,
    "clubId" TEXT NOT NULL,
    "kind" "ClubFinancialAccountKind" NOT NULL,
    "label" TEXT NOT NULL,
    "accountingAccountId" TEXT NOT NULL,
    "iban" TEXT,
    "bic" TEXT,
    "stripeAccountId" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClubFinancialAccount_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ClubPaymentRoute" (
    "id" TEXT NOT NULL,
    "clubId" TEXT NOT NULL,
    "method" "ClubPaymentMethod" NOT NULL,
    "financialAccountId" TEXT NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClubPaymentRoute_pkey" PRIMARY KEY ("id")
);

-- 3) Indexes des nouvelles tables
CREATE INDEX "ClubFinancialAccount_clubId_kind_isActive_idx" ON "ClubFinancialAccount"("clubId", "kind", "isActive");
CREATE UNIQUE INDEX "ClubFinancialAccount_clubId_accountingAccountId_key" ON "ClubFinancialAccount"("clubId", "accountingAccountId");
CREATE INDEX "ClubPaymentRoute_clubId_method_idx" ON "ClubPaymentRoute"("clubId", "method");
CREATE UNIQUE INDEX "ClubPaymentRoute_clubId_method_key" ON "ClubPaymentRoute"("clubId", "method");

-- 4) Foreign keys des nouvelles tables
ALTER TABLE "ClubFinancialAccount" ADD CONSTRAINT "ClubFinancialAccount_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ClubFinancialAccount" ADD CONSTRAINT "ClubFinancialAccount_accountingAccountId_fkey" FOREIGN KEY ("accountingAccountId") REFERENCES "AccountingAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ClubPaymentRoute" ADD CONSTRAINT "ClubPaymentRoute_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ClubPaymentRoute" ADD CONSTRAINT "ClubPaymentRoute_financialAccountId_fkey" FOREIGN KEY ("financialAccountId") REFERENCES "ClubFinancialAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 5) Colonnes additionnelles sur tables existantes
ALTER TABLE "AccountingEntry"
  ADD COLUMN "financialAccountId" TEXT,
  ADD COLUMN "consolidatedAt" TIMESTAMP(3),
  ADD COLUMN "preConsolidationSnapshot" JSONB;

ALTER TABLE "AccountingEntryLine"
  ADD COLUMN "mergedFromArticleLabels" TEXT[] DEFAULT ARRAY[]::TEXT[];

ALTER TABLE "Payment"
  ADD COLUMN "financialAccountId" TEXT;

-- 6) Indexes additionnels
CREATE INDEX "AccountingEntry_clubId_financialAccountId_idx" ON "AccountingEntry"("clubId", "financialAccountId");
CREATE INDEX "Payment_clubId_financialAccountId_idx" ON "Payment"("clubId", "financialAccountId");

-- 7) Foreign keys additionnels
ALTER TABLE "AccountingEntry" ADD CONSTRAINT "AccountingEntry_financialAccountId_fkey" FOREIGN KEY ("financialAccountId") REFERENCES "ClubFinancialAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_financialAccountId_fkey" FOREIGN KEY ("financialAccountId") REFERENCES "ClubFinancialAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ============================================================================
-- 8) Backfill : créer les ClubFinancialAccount + ClubPaymentRoute par défaut
--    pour chaque club ayant le module ACCOUNTING actif (donc disposant déjà
--    d'un AccountingAccount 512000 et 530000 seedés).
--    Idempotent via WHERE NOT EXISTS.
-- ============================================================================

-- Banque principale par défaut (code 512000)
INSERT INTO "ClubFinancialAccount" ("id", "clubId", "kind", "label", "accountingAccountId", "isDefault", "isActive", "sortOrder", "createdAt", "updatedAt")
SELECT
  gen_random_uuid()::text,
  aa."clubId",
  'BANK'::"ClubFinancialAccountKind",
  'Banque principale',
  aa."id",
  true,
  true,
  0,
  NOW(),
  NOW()
FROM "AccountingAccount" aa
WHERE aa."code" = '512000'
  AND NOT EXISTS (
    SELECT 1 FROM "ClubFinancialAccount" cfa
    WHERE cfa."clubId" = aa."clubId" AND cfa."accountingAccountId" = aa."id"
  );

-- Caisse principale par défaut (code 530000)
INSERT INTO "ClubFinancialAccount" ("id", "clubId", "kind", "label", "accountingAccountId", "isDefault", "isActive", "sortOrder", "createdAt", "updatedAt")
SELECT
  gen_random_uuid()::text,
  aa."clubId",
  'CASH'::"ClubFinancialAccountKind",
  'Caisse principale',
  aa."id",
  true,
  true,
  10,
  NOW(),
  NOW()
FROM "AccountingAccount" aa
WHERE aa."code" = '530000'
  AND NOT EXISTS (
    SELECT 1 FROM "ClubFinancialAccount" cfa
    WHERE cfa."clubId" = aa."clubId" AND cfa."accountingAccountId" = aa."id"
  );

-- Routes par défaut : MANUAL_CASH → Caisse, autres méthodes → Banque
-- (STRIPE_CARD provisoirement → Banque, l'admin doit créer son STRIPE_TRANSIT
--  pour reroute manuel via UI)
INSERT INTO "ClubPaymentRoute" ("id", "clubId", "method", "financialAccountId", "isDefault", "createdAt", "updatedAt")
SELECT
  gen_random_uuid()::text,
  cfa."clubId",
  'MANUAL_CASH'::"ClubPaymentMethod",
  cfa."id",
  true,
  NOW(),
  NOW()
FROM "ClubFinancialAccount" cfa
WHERE cfa."kind" = 'CASH' AND cfa."isDefault" = true
  AND NOT EXISTS (
    SELECT 1 FROM "ClubPaymentRoute" cpr
    WHERE cpr."clubId" = cfa."clubId" AND cpr."method" = 'MANUAL_CASH'
  );

INSERT INTO "ClubPaymentRoute" ("id", "clubId", "method", "financialAccountId", "isDefault", "createdAt", "updatedAt")
SELECT
  gen_random_uuid()::text,
  cfa."clubId",
  m."method",
  cfa."id",
  true,
  NOW(),
  NOW()
FROM "ClubFinancialAccount" cfa
CROSS JOIN (VALUES ('STRIPE_CARD'::"ClubPaymentMethod"), ('MANUAL_CHECK'::"ClubPaymentMethod"), ('MANUAL_TRANSFER'::"ClubPaymentMethod")) AS m("method")
WHERE cfa."kind" = 'BANK' AND cfa."isDefault" = true
  AND NOT EXISTS (
    SELECT 1 FROM "ClubPaymentRoute" cpr
    WHERE cpr."clubId" = cfa."clubId" AND cpr."method" = m."method"
  );

-- 9) Backfill rétroactif : Payment.financialAccountId = compte BANK par défaut
--    si method != CASH, sinon compte CASH par défaut. Ne touche que les
--    paiements existants au moment de la migration.
UPDATE "Payment" p
SET "financialAccountId" = (
  SELECT cfa."id"
  FROM "ClubFinancialAccount" cfa
  WHERE cfa."clubId" = p."clubId"
    AND cfa."isDefault" = true
    AND cfa."kind" = CASE WHEN p."method" = 'MANUAL_CASH' THEN 'CASH'::"ClubFinancialAccountKind"
                          ELSE 'BANK'::"ClubFinancialAccountKind"
                     END
  LIMIT 1
)
WHERE p."financialAccountId" IS NULL;

-- 10) Backfill rétroactif : AccountingEntry.financialAccountId
--     - si paymentId non null, hérite du financialAccountId du paiement
--     - sinon, BANK par défaut du club
UPDATE "AccountingEntry" ae
SET "financialAccountId" = (
  SELECT p."financialAccountId" FROM "Payment" p WHERE p."id" = ae."paymentId"
)
WHERE ae."financialAccountId" IS NULL AND ae."paymentId" IS NOT NULL;

UPDATE "AccountingEntry" ae
SET "financialAccountId" = (
  SELECT cfa."id"
  FROM "ClubFinancialAccount" cfa
  WHERE cfa."clubId" = ae."clubId"
    AND cfa."isDefault" = true
    AND cfa."kind" = 'BANK'::"ClubFinancialAccountKind"
  LIMIT 1
)
WHERE ae."financialAccountId" IS NULL;
