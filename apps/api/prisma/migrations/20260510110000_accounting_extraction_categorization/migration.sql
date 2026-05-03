-- Stocke le résultat du 2e appel IA "réflexion structurée" :
-- ventilation catégorisée par compte avec reasoning et confiance par
-- ligne. Format JSON :
--   { globalConfidencePct: int, globalReasoning: string,
--     lines: [{ accountCode, amountCents, label, reasoning,
--               confidencePct, projectId? }],
--     agreement: { vendor: bool, total: bool, lines: bool } }
-- Null si l'étape a échoué (timeout, parse JSON, budget IA).

ALTER TABLE "AccountingExtraction"
  ADD COLUMN "categorizationJson" JSONB;
