-- Branding vitrine par club : kanji tagline + footer JSON
ALTER TABLE "Club" ADD COLUMN "vitrineKanjiTagline" TEXT;
ALTER TABLE "Club" ADD COLUMN "vitrineFooterJson" JSONB;
