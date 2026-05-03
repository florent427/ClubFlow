-- Backfill : propage `Invoice.householdGroupId` depuis la famille rattachée
-- pour toutes les factures historiques créées avant le correctif.
-- Sans cela, les factures de foyers non-porteurs dans un groupe foyer étendu
-- restaient invisibles dans l'espace partagé côté portail.
UPDATE "Invoice" i
SET "householdGroupId" = f."householdGroupId"
FROM "Family" f
WHERE i."familyId" = f."id"
  AND f."householdGroupId" IS NOT NULL
  AND i."householdGroupId" IS NULL;
