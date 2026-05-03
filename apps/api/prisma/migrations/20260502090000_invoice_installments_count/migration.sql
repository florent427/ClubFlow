-- Échéancier 1×/3× choisi par le payeur sur une facture d'adhésion.
-- Backfill : toutes les factures existantes en `1` (paiement complet).
ALTER TABLE "Invoice"
  ADD COLUMN "installmentsCount" INTEGER NOT NULL DEFAULT 1;
