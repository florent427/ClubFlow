-- Ajout du champ resetAnnually : si true, le cron annuel (1er septembre)
-- bump la version du document et invalide toutes les signatures existantes
-- pour forcer une re-signature à chaque saison sportive.

ALTER TABLE "ClubDocument"
  ADD COLUMN "resetAnnually" BOOLEAN NOT NULL DEFAULT false;
