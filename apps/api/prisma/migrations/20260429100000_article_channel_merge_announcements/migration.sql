-- Fusion actualités / blog dans une seule table VitrineArticle, distinguées
-- par `channel = NEWS | BLOG`. Les VitrineAnnouncement existants sont
-- convertis en articles publiés de canal NEWS, avec bodyJson HTML-paragraphé
-- et slug dérivé du titre. La table VitrineAnnouncement est ensuite vidée
-- (on garde la table pour compat schema, elle sera supprimée dans une
-- migration ultérieure quand on sera sûr que plus rien ne s'y appuie).

-- 1. Nouvel enum.
CREATE TYPE "VitrineArticleChannel" AS ENUM ('NEWS', 'BLOG');

-- 2. Colonne sur VitrineArticle (défaut BLOG, les articles existants
--    restent donc des articles de blog).
ALTER TABLE "VitrineArticle"
  ADD COLUMN IF NOT EXISTS "channel" "VitrineArticleChannel"
  NOT NULL DEFAULT 'BLOG';

-- 3. Index composite utile pour les listes filtrées.
CREATE INDEX IF NOT EXISTS "VitrineArticle_clubId_channel_status_publishedAt_idx"
  ON "VitrineArticle" ("clubId", "channel", "status", "publishedAt");

-- 4. Fonction utilitaire locale pour slugify + dédoublonner (ré-utilisable
--    le temps de la migration). Minuscule + sans accents + "-" puis suffixe
--    numérique si collision.
CREATE OR REPLACE FUNCTION pg_temp.__vitrine_slugify(src TEXT)
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  base TEXT;
BEGIN
  base := LOWER(TRIM(COALESCE(src, '')));
  base := TRANSLATE(
    base,
    'àáâãäåçèéêëìíîïñòóôõöùúûüýÿœæ',
    'aaaaaaceeeeiiiinooooouuuuyyoe'
  );
  base := REGEXP_REPLACE(base, '[^a-z0-9]+', '-', 'g');
  base := REGEXP_REPLACE(base, '^-+|-+$', '', 'g');
  IF LENGTH(base) = 0 THEN base := 'actualite'; END IF;
  RETURN LEFT(base, 160);
END;
$$;

-- 5. Migration des annonces existantes en articles NEWS.
--    ROW_NUMBER() nous donne un suffixe déterministe en cas de slugs
--    collision sur le même club.
INSERT INTO "VitrineArticle" (
  "id",
  "clubId",
  "slug",
  "title",
  "excerpt",
  "bodyJson",
  "status",
  "channel",
  "publishedAt",
  "pinned",
  "sortOrder",
  "createdAt",
  "updatedAt"
)
SELECT
  gen_random_uuid(),
  a."clubId",
  -- Slug unique : on concatène le slugify du titre à l'id si collision
  CASE
    WHEN EXISTS (
      SELECT 1 FROM "VitrineArticle" va
      WHERE va."clubId" = a."clubId"
        AND va."slug" = pg_temp.__vitrine_slugify(a."title")
    )
    THEN pg_temp.__vitrine_slugify(a."title") || '-' || SUBSTR(a."id", 1, 8)
    ELSE pg_temp.__vitrine_slugify(a."title")
  END,
  a."title",
  NULL,
  -- bodyJson : { format: 'html', html: '<p>...</p>' } avec chaque paragraphe
  -- séparé par \n\n, échappé minimalement.
  jsonb_build_object(
    'format', 'html',
    'html',
    (
      SELECT string_agg(
        '<p>' ||
          REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(
            TRIM(part),
            '&', '&amp;'),
            '<', '&lt;'),
            '>', '&gt;'),
            '"', '&quot;'),
            '''', '&#039;'
          ) ||
        '</p>',
        E'\n'
      )
      FROM regexp_split_to_table(COALESCE(a."body", ''), E'\n{2,}') AS part
      WHERE TRIM(part) <> ''
    )
  ),
  'PUBLISHED'::"VitrineArticleStatus",
  'NEWS'::"VitrineArticleChannel",
  COALESCE(a."publishedAt", a."createdAt"),
  a."pinned",
  a."sortOrder",
  a."createdAt",
  a."updatedAt"
FROM "VitrineAnnouncement" a;

-- 6. Vidage de la table source (on garde la table pour éviter de casser
--    les foreign keys / modules pas encore recompilés). Une future migration
--    supprimera complètement le modèle quand il n'est plus référencé.
DELETE FROM "VitrineAnnouncement";
