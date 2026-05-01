-- Marqueur "OCR IA en cours" pour permettre la création immédiate d'une
-- entry stub dès le upload du justificatif, et le pipeline IA tourne
-- en background. L'utilisateur peut quitter l'écran et continuer à
-- scanner d'autres factures pendant que la précédente est analysée.

ALTER TABLE "AccountingEntry"
  ADD COLUMN "aiProcessingStartedAt" TIMESTAMP(3);
