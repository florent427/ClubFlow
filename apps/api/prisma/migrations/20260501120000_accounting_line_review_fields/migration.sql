-- Validation par ligne : chaque ligne article peut être validée
-- indépendamment, l'entry globale passe POSTED auto quand toutes les
-- lignes "article" (hors 512000/530000 contreparties) sont validées.
ALTER TABLE "AccountingEntryLine"
  ADD COLUMN "validatedAt" TIMESTAMP(3),
  ADD COLUMN "validatedByUserId" TEXT,
  ADD COLUMN "iaSuggestedAccountCode" TEXT,
  ADD COLUMN "iaReasoning" TEXT,
  ADD COLUMN "iaConfidencePct" INTEGER;
