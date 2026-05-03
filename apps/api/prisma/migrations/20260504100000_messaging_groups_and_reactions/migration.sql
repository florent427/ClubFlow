-- ============================================================
-- Messagerie : groupes administrés, permissions, threads,
-- réactions emoji, canal de diffusion MESSAGING.
-- Migration non-destructive : nouvelles colonnes nullable + tables.
-- ============================================================

-- 1. Nouveaux enums.
CREATE TYPE "ChatRoomChannelMode" AS ENUM ('OPEN', 'RESTRICTED', 'READ_ONLY');
CREATE TYPE "ChatRoomPermissionTarget" AS ENUM ('SYSTEM_ROLE', 'MEMBER_ROLE', 'CUSTOM_ROLE', 'CONTACT');

-- 2. Étendre CommunicationChannel avec MESSAGING (ALTER TYPE non-réversible).
ALTER TYPE "CommunicationChannel" ADD VALUE IF NOT EXISTS 'MESSAGING';

-- 3. Étendre ChatRoom.
ALTER TABLE "ChatRoom"
  ADD COLUMN "description" TEXT,
  ADD COLUMN "coverImageUrl" TEXT,
  ADD COLUMN "channelMode" "ChatRoomChannelMode" NOT NULL DEFAULT 'OPEN',
  ADD COLUMN "isBroadcastChannel" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "archivedAt" TIMESTAMP(3);

CREATE INDEX "ChatRoom_clubId_isBroadcastChannel_idx" ON "ChatRoom"("clubId", "isBroadcastChannel");

-- 4. Étendre ChatMessage avec threading + audit admin-as-member.
ALTER TABLE "ChatMessage"
  ADD COLUMN "parentMessageId" TEXT,
  ADD COLUMN "replyCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "lastReplyAt" TIMESTAMP(3),
  ADD COLUMN "postedAsAdminUserId" TEXT;

ALTER TABLE "ChatMessage"
  ADD CONSTRAINT "ChatMessage_parentMessageId_fkey"
  FOREIGN KEY ("parentMessageId") REFERENCES "ChatMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "ChatMessage_parentMessageId_createdAt_idx" ON "ChatMessage"("parentMessageId", "createdAt");

-- 5. ChatRoomWritePermission : qui peut poster un message racine quand
--    le salon est en mode RESTRICTED. Vide => tous les membres du salon.
CREATE TABLE "ChatRoomWritePermission" (
  "id"          TEXT NOT NULL,
  "roomId"      TEXT NOT NULL,
  "clubId"      TEXT NOT NULL,
  "targetKind"  "ChatRoomPermissionTarget" NOT NULL,
  "targetValue" TEXT,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ChatRoomWritePermission_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ChatRoomWritePermission_roomId_targetKind_targetValue_key"
  ON "ChatRoomWritePermission"("roomId", "targetKind", "targetValue");

CREATE INDEX "ChatRoomWritePermission_clubId_roomId_idx"
  ON "ChatRoomWritePermission"("clubId", "roomId");

ALTER TABLE "ChatRoomWritePermission"
  ADD CONSTRAINT "ChatRoomWritePermission_roomId_fkey"
  FOREIGN KEY ("roomId") REFERENCES "ChatRoom"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 6. ChatRoomMembershipScope : portée du salon (qui est inscrit).
CREATE TABLE "ChatRoomMembershipScope" (
  "id"             TEXT NOT NULL,
  "roomId"         TEXT NOT NULL,
  "clubId"         TEXT NOT NULL,
  "targetKind"     "ChatRoomPermissionTarget" NOT NULL,
  "targetValue"    TEXT,
  "dynamicGroupId" TEXT,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ChatRoomMembershipScope_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ChatRoomMembershipScope_clubId_roomId_idx"
  ON "ChatRoomMembershipScope"("clubId", "roomId");

CREATE INDEX "ChatRoomMembershipScope_dynamicGroupId_idx"
  ON "ChatRoomMembershipScope"("dynamicGroupId");

ALTER TABLE "ChatRoomMembershipScope"
  ADD CONSTRAINT "ChatRoomMembershipScope_roomId_fkey"
  FOREIGN KEY ("roomId") REFERENCES "ChatRoom"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ChatRoomMembershipScope"
  ADD CONSTRAINT "ChatRoomMembershipScope_dynamicGroupId_fkey"
  FOREIGN KEY ("dynamicGroupId") REFERENCES "DynamicGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 7. ChatMessageReaction : 1 emoji par membre par message.
CREATE TABLE "ChatMessageReaction" (
  "id"        TEXT NOT NULL,
  "messageId" TEXT NOT NULL,
  "memberId"  TEXT NOT NULL,
  "clubId"    TEXT NOT NULL,
  "emoji"     VARCHAR(16) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ChatMessageReaction_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ChatMessageReaction_messageId_memberId_emoji_key"
  ON "ChatMessageReaction"("messageId", "memberId", "emoji");

CREATE INDEX "ChatMessageReaction_messageId_idx" ON "ChatMessageReaction"("messageId");
CREATE INDEX "ChatMessageReaction_clubId_memberId_idx" ON "ChatMessageReaction"("clubId", "memberId");

ALTER TABLE "ChatMessageReaction"
  ADD CONSTRAINT "ChatMessageReaction_messageId_fkey"
  FOREIGN KEY ("messageId") REFERENCES "ChatMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ChatMessageReaction"
  ADD CONSTRAINT "ChatMessageReaction_memberId_fkey"
  FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;
