-- Migration non destructive : ajoute le kind TEXT aux items live projets.
--
-- 1) Nouvelle valeur enum
ALTER TYPE "ProjectLiveItemKind" ADD VALUE IF NOT EXISTS 'TEXT';

-- 2) Quota texte par contributeur par phase (20 par défaut)
ALTER TABLE "ClubProject"
  ADD COLUMN IF NOT EXISTS "maxTextsPerContributorPerPhase" INTEGER NOT NULL DEFAULT 20;

-- 3) Rendre mediaAssetId nullable (items TEXT n'ont pas de média)
ALTER TABLE "ProjectLiveItem"
  ALTER COLUMN "mediaAssetId" DROP NOT NULL;

-- 4) Colonne textContent pour le contenu brut (max 4000 chars)
ALTER TABLE "ProjectLiveItem"
  ADD COLUMN IF NOT EXISTS "textContent" TEXT;
