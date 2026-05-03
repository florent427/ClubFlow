-- Ajoute le template CUSTOM et la colonne customPrompt pour les
-- comptes-rendus IA avec prompt libre.

ALTER TYPE "ProjectReportTemplate" ADD VALUE IF NOT EXISTS 'CUSTOM';

ALTER TABLE "ProjectReport"
  ADD COLUMN IF NOT EXISTS "customPrompt" TEXT;
