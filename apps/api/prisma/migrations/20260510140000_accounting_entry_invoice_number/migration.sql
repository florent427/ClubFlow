-- Antidoublon : (clubId, invoiceNumber, amountCents) doit être quasi-unique
-- (cas légitime de collision = factures multiples du même fournisseur avec
-- exactement le même n° et le même montant — extrêmement rare). Pas de
-- contrainte UNIQUE hard, mais un index composite pour le check rapide à
-- chaque création/confirmation.
--
-- `duplicateOfEntryId` est un soft-link vers l'entry détectée comme
-- doublon. Le client affiche un bandeau d'avertissement et l'utilisateur
-- choisit (valider quand même ou annuler).

ALTER TABLE "AccountingEntry"
  ADD COLUMN "invoiceNumber"      TEXT,
  ADD COLUMN "duplicateOfEntryId" TEXT;

CREATE INDEX "AccountingEntry_clubId_invoiceNumber_amountCents_idx"
  ON "AccountingEntry"("clubId", "invoiceNumber", "amountCents");
