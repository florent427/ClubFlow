-- Migration : pièces jointes (image/vidéo/audio/document) sur les
-- messages de chat. Permet l'envoi de photos, vocaux, vidéos courtes
-- et documents PDF dans la messagerie.
--
-- Côté upload, le pipeline `MediaAssetsService` est étendu pour :
--  - whitelist audio (m4a, mp3, ogg)
--  - vérification magic-byte (file-type) en plus de l'extension
--  - limites par kind (image 5Mo, doc 10Mo, video 50Mo, audio 10Mo)
--
-- Cf. PR "Pipeline upload sécurisé pièces jointes messagerie".

-- ─── Enum MediaAssetKind : ajouter VIDEO et AUDIO ─────────────────
ALTER TYPE "MediaAssetKind" ADD VALUE IF NOT EXISTS 'VIDEO';
ALTER TYPE "MediaAssetKind" ADD VALUE IF NOT EXISTS 'AUDIO';

-- ─── Nouvelle enum dédiée aux attachments chat ────────────────────
CREATE TYPE "ChatMessageAttachmentKind" AS ENUM (
  'IMAGE', 'VIDEO', 'AUDIO', 'DOCUMENT'
);

-- ─── ChatMessage.body devient nullable ────────────────────────────
-- Un message peut être 100 % vocal/photo sans texte. Le service
-- vérifie qu'au moins l'un de body/attachments est présent.
-- Aucun backfill nécessaire : tous les messages existants ont un body.
ALTER TABLE "ChatMessage"
  ALTER COLUMN "body" DROP NOT NULL;

-- ─── Table ChatMessageAttachment ───────────────────────────────────
CREATE TABLE "ChatMessageAttachment" (
  "id" TEXT NOT NULL,
  "messageId" TEXT NOT NULL,
  "mediaAssetId" TEXT NOT NULL,
  "kind" "ChatMessageAttachmentKind" NOT NULL,
  "durationMs" INTEGER,
  "thumbnailAssetId" TEXT,
  "position" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ChatMessageAttachment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ChatMessageAttachment_messageId_idx"
  ON "ChatMessageAttachment" ("messageId");
CREATE INDEX "ChatMessageAttachment_mediaAssetId_idx"
  ON "ChatMessageAttachment" ("mediaAssetId");

ALTER TABLE "ChatMessageAttachment"
  ADD CONSTRAINT "ChatMessageAttachment_messageId_fkey"
  FOREIGN KEY ("messageId") REFERENCES "ChatMessage" ("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- ON DELETE RESTRICT sur mediaAsset : on évite qu'une suppression
-- accidentelle de MediaAsset orpheline les messages. Le cleanup des
-- assets orphelins est géré par un job séparé (futur).
ALTER TABLE "ChatMessageAttachment"
  ADD CONSTRAINT "ChatMessageAttachment_mediaAssetId_fkey"
  FOREIGN KEY ("mediaAssetId") REFERENCES "MediaAsset" ("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ChatMessageAttachment"
  ADD CONSTRAINT "ChatMessageAttachment_thumbnailAssetId_fkey"
  FOREIGN KEY ("thumbnailAssetId") REFERENCES "MediaAsset" ("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
