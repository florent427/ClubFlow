-- CreateEnum
CREATE TYPE "BlogPostStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- CreateTable
CREATE TABLE "BlogPost" (
    "id" TEXT NOT NULL,
    "clubId" TEXT NOT NULL,
    "authorUserId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "excerpt" VARCHAR(500),
    "body" TEXT NOT NULL,
    "coverImageUrl" TEXT,
    "status" "BlogPostStatus" NOT NULL DEFAULT 'DRAFT',
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BlogPost_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BlogPost_clubId_slug_key" ON "BlogPost"("clubId", "slug");

-- CreateIndex
CREATE INDEX "BlogPost_clubId_status_publishedAt_idx" ON "BlogPost"("clubId", "status", "publishedAt");
