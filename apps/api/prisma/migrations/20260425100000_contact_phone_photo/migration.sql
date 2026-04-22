-- Ajoute les coordonnées éditables d'un profil contact portail :
-- téléphone et URL de photo / avatar. Ces champs étaient jusqu'ici absents,
-- ce qui empêchait un contact (sans fiche adhérent) de saisir ses
-- coordonnées depuis l'espace membre (Paramètres → Mon compte).
ALTER TABLE "Contact" ADD COLUMN IF NOT EXISTS "phone" TEXT;
ALTER TABLE "Contact" ADD COLUMN IF NOT EXISTS "photoUrl" TEXT;
