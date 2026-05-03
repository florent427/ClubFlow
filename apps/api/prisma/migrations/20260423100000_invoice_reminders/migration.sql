-- Relances factures : date du dernier envoi
ALTER TABLE "Invoice" ADD COLUMN "lastRemindedAt" TIMESTAMP(3);
