-- Ajoute téléphone et e-mail de contact au club. Ces coordonnées sont
-- saisies via "Admin → Paramètres → Identité du club" et imprimées dans
-- l'en-tête des factures PDF à côté de l'adresse et du SIRET.
ALTER TABLE "Club" ADD COLUMN IF NOT EXISTS "contactPhone" TEXT;
ALTER TABLE "Club" ADD COLUMN IF NOT EXISTS "contactEmail" TEXT;
