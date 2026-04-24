-- Ajoute pinned + sortOrder sur VitrineArticle et sortOrder sur
-- VitrineAnnouncement : permet d'épingler en tête et de réordonner
-- manuellement les listes (drag-and-drop côté admin).
ALTER TABLE "VitrineArticle"
  ADD COLUMN IF NOT EXISTS "pinned" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "sortOrder" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "VitrineAnnouncement"
  ADD COLUMN IF NOT EXISTS "sortOrder" INTEGER NOT NULL DEFAULT 0;

-- Initialise un sortOrder cohérent (décroissant sur publishedAt, ordre de
-- création pour les brouillons) pour éviter une collision 0 partout.
UPDATE "VitrineArticle" va
SET "sortOrder" = sub.rn * 10
FROM (
  SELECT id, ROW_NUMBER() OVER (
    PARTITION BY "clubId"
    ORDER BY COALESCE("publishedAt", "createdAt") DESC
  ) AS rn
  FROM "VitrineArticle"
) sub
WHERE va.id = sub.id;

UPDATE "VitrineAnnouncement" vn
SET "sortOrder" = sub.rn * 10
FROM (
  SELECT id, ROW_NUMBER() OVER (
    PARTITION BY "clubId"
    ORDER BY COALESCE("publishedAt", "createdAt") DESC
  ) AS rn
  FROM "VitrineAnnouncement"
) sub
WHERE vn.id = sub.id;

CREATE INDEX IF NOT EXISTS "VitrineArticle_clubId_pinned_sortOrder_idx"
  ON "VitrineArticle" ("clubId", "pinned" DESC, "sortOrder" ASC);
CREATE INDEX IF NOT EXISTS "VitrineAnnouncement_clubId_pinned_sortOrder_idx"
  ON "VitrineAnnouncement" ("clubId", "pinned" DESC, "sortOrder" ASC);
