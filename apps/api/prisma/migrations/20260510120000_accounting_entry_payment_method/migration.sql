-- Mode de paiement détecté par l'IA OCR + saisi manuellement.
-- Valeurs string libres pour souplesse (CASH, CHECK, TRANSFER, CARD,
-- DIRECT_DEBIT, OTHER, null). Permet la traçabilité par moyen de
-- paiement pour la compta analytique.

ALTER TABLE "AccountingEntry"
  ADD COLUMN "paymentMethod"    TEXT,
  ADD COLUMN "paymentReference" TEXT;
