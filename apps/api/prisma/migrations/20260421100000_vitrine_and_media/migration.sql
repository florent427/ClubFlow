-- Vitrine publique : pages, articles, annonces, galerie, médias
-- Corresponds à la migration "vitrine_and_media".

-- 1) Enums
CREATE TYPE "VitrinePageStatus" AS ENUM ('DRAFT', 'PUBLISHED');
CREATE TYPE "VitrineArticleStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');
CREATE TYPE "MediaAssetKind" AS ENUM ('IMAGE', 'DOCUMENT', 'OTHER');

-- 2) Colonnes additionnelles sur Club
ALTER TABLE "Club" ADD COLUMN "customDomain" TEXT;
ALTER TABLE "Club" ADD COLUMN "vitrinePublished" BOOLEAN NOT NULL DEFAULT false;
CREATE UNIQUE INDEX "Club_customDomain_key" ON "Club"("customDomain");

-- 3) MediaAsset (créé en premier car référencé par les autres)
CREATE TABLE "MediaAsset" (
  "id" TEXT NOT NULL,
  "clubId" TEXT NOT NULL,
  "kind" "MediaAssetKind" NOT NULL DEFAULT 'IMAGE',
  "ownerKind" TEXT,
  "ownerId" TEXT,
  "fileName" TEXT NOT NULL,
  "mimeType" TEXT NOT NULL,
  "sizeBytes" INTEGER NOT NULL,
  "storagePath" TEXT NOT NULL,
  "publicUrl" TEXT NOT NULL,
  "widthPx" INTEGER,
  "heightPx" INTEGER,
  "uploadedByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MediaAsset_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "MediaAsset_clubId_ownerKind_ownerId_idx"
  ON "MediaAsset"("clubId", "ownerKind", "ownerId");
ALTER TABLE "MediaAsset"
  ADD CONSTRAINT "MediaAsset_clubId_fkey"
  FOREIGN KEY ("clubId") REFERENCES "Club"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- 4) VitrinePage
CREATE TABLE "VitrinePage" (
  "id" TEXT NOT NULL,
  "clubId" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "templateKey" TEXT NOT NULL DEFAULT 'sksr-v1',
  "status" "VitrinePageStatus" NOT NULL DEFAULT 'PUBLISHED',
  "seoTitle" TEXT,
  "seoDescription" TEXT,
  "seoOgImageId" TEXT,
  "sectionsJson" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "VitrinePage_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "VitrinePage_clubId_slug_key" ON "VitrinePage"("clubId", "slug");
CREATE INDEX "VitrinePage_clubId_status_idx" ON "VitrinePage"("clubId", "status");
ALTER TABLE "VitrinePage"
  ADD CONSTRAINT "VitrinePage_clubId_fkey"
  FOREIGN KEY ("clubId") REFERENCES "Club"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "VitrinePage"
  ADD CONSTRAINT "VitrinePage_seoOgImageId_fkey"
  FOREIGN KEY ("seoOgImageId") REFERENCES "MediaAsset"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- 5) VitrinePageRevision
CREATE TABLE "VitrinePageRevision" (
  "id" TEXT NOT NULL,
  "pageId" TEXT NOT NULL,
  "sectionsJson" JSONB NOT NULL,
  "seoTitle" TEXT,
  "seoDescription" TEXT,
  "authorUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "VitrinePageRevision_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "VitrinePageRevision_pageId_createdAt_idx"
  ON "VitrinePageRevision"("pageId", "createdAt");
ALTER TABLE "VitrinePageRevision"
  ADD CONSTRAINT "VitrinePageRevision_pageId_fkey"
  FOREIGN KEY ("pageId") REFERENCES "VitrinePage"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- 6) VitrineArticle
CREATE TABLE "VitrineArticle" (
  "id" TEXT NOT NULL,
  "clubId" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "excerpt" TEXT,
  "bodyJson" JSONB NOT NULL,
  "coverImageId" TEXT,
  "status" "VitrineArticleStatus" NOT NULL DEFAULT 'DRAFT',
  "publishedAt" TIMESTAMP(3),
  "authorUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "VitrineArticle_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "VitrineArticle_clubId_slug_key"
  ON "VitrineArticle"("clubId", "slug");
CREATE INDEX "VitrineArticle_clubId_status_publishedAt_idx"
  ON "VitrineArticle"("clubId", "status", "publishedAt");
ALTER TABLE "VitrineArticle"
  ADD CONSTRAINT "VitrineArticle_clubId_fkey"
  FOREIGN KEY ("clubId") REFERENCES "Club"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "VitrineArticle"
  ADD CONSTRAINT "VitrineArticle_coverImageId_fkey"
  FOREIGN KEY ("coverImageId") REFERENCES "MediaAsset"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- 7) VitrineAnnouncement
CREATE TABLE "VitrineAnnouncement" (
  "id" TEXT NOT NULL,
  "clubId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "pinned" BOOLEAN NOT NULL DEFAULT false,
  "publishedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "VitrineAnnouncement_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "VitrineAnnouncement_clubId_publishedAt_idx"
  ON "VitrineAnnouncement"("clubId", "publishedAt");
ALTER TABLE "VitrineAnnouncement"
  ADD CONSTRAINT "VitrineAnnouncement_clubId_fkey"
  FOREIGN KEY ("clubId") REFERENCES "Club"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- 8) VitrineGalleryPhoto
CREATE TABLE "VitrineGalleryPhoto" (
  "id" TEXT NOT NULL,
  "clubId" TEXT NOT NULL,
  "mediaAssetId" TEXT NOT NULL,
  "caption" TEXT,
  "category" TEXT,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "VitrineGalleryPhoto_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "VitrineGalleryPhoto_clubId_category_sortOrder_idx"
  ON "VitrineGalleryPhoto"("clubId", "category", "sortOrder");
ALTER TABLE "VitrineGalleryPhoto"
  ADD CONSTRAINT "VitrineGalleryPhoto_clubId_fkey"
  FOREIGN KEY ("clubId") REFERENCES "Club"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "VitrineGalleryPhoto"
  ADD CONSTRAINT "VitrineGalleryPhoto_mediaAssetId_fkey"
  FOREIGN KEY ("mediaAssetId") REFERENCES "MediaAsset"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
