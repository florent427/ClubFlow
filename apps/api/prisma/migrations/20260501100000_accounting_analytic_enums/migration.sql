-- Module COMPTABILITÉ ANALYTIQUE IA — Partie 1/2 : extensions d'enums.
-- Postgres interdit l'utilisation d'une nouvelle valeur d'enum dans la même
-- transaction que son ajout. On isole donc les ALTER TYPE dans une migration
-- dédiée, puis la migration suivante (20260501100100_accounting_analytic)
-- peut librement UPDATE les rows et créer tables + backfill.

ALTER TYPE "AiUsageFeature" ADD VALUE IF NOT EXISTS 'RECEIPT_OCR';

ALTER TYPE "AccountingEntryKind" ADD VALUE IF NOT EXISTS 'IN_KIND';
ALTER TYPE "AccountingEntryKind" ADD VALUE IF NOT EXISTS 'TRANSFER';

ALTER TYPE "GrantApplicationStatus" ADD VALUE IF NOT EXISTS 'REQUESTED';
ALTER TYPE "GrantApplicationStatus" ADD VALUE IF NOT EXISTS 'GRANTED';
ALTER TYPE "GrantApplicationStatus" ADD VALUE IF NOT EXISTS 'PARTIALLY_PAID';
ALTER TYPE "GrantApplicationStatus" ADD VALUE IF NOT EXISTS 'PAID';
ALTER TYPE "GrantApplicationStatus" ADD VALUE IF NOT EXISTS 'REPORTED';
ALTER TYPE "GrantApplicationStatus" ADD VALUE IF NOT EXISTS 'SETTLED';
ALTER TYPE "GrantApplicationStatus" ADD VALUE IF NOT EXISTS 'REJECTED';

ALTER TYPE "SponsorshipDealStatus" ADD VALUE IF NOT EXISTS 'DRAFT';
ALTER TYPE "SponsorshipDealStatus" ADD VALUE IF NOT EXISTS 'CANCELLED';
