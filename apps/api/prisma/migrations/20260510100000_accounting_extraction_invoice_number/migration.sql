-- Ajoute le numéro de facture extrait par l'OCR sur AccountingExtraction.
-- Optionnel (nullable) car tous les reçus n'ont pas de n° de facture
-- (ex. tickets de caisse).

ALTER TABLE "AccountingExtraction"
  ADD COLUMN "extractedInvoiceNumber" TEXT;
