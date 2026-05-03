-- ============================================================================
-- Migration : Club.membershipFullPriceFirstMonths
--
-- Ajoute un seuil "X premiers mois de la saison à plein tarif" avant que
-- le prorata ne commence à s'appliquer. Les nouveaux adhérents arrivant
-- dans cette fenêtre paient le tarif annuel complet, pas de remise
-- prorata. Default = 3 (3 premiers mois plein tarif).
--
-- Migration NON destructive : nouvelle colonne avec default = 3 sur
-- tous les clubs existants.
-- ============================================================================

ALTER TABLE "Club"
  ADD COLUMN "membershipFullPriceFirstMonths" INTEGER NOT NULL DEFAULT 3;
