-- AlterTable
ALTER TABLE "Member" ADD COLUMN "telegram_chat_id" TEXT,
ADD COLUMN "telegram_linked_at" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "TelegramLinkToken" (
    "id" TEXT NOT NULL,
    "clubId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "token" VARCHAR(64) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TelegramLinkToken_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TelegramLinkToken_token_key" ON "TelegramLinkToken"("token");
CREATE INDEX "TelegramLinkToken_memberId_idx" ON "TelegramLinkToken"("memberId");
CREATE INDEX "TelegramLinkToken_token_idx" ON "TelegramLinkToken"("token");

ALTER TABLE "TelegramLinkToken" ADD CONSTRAINT "TelegramLinkToken_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;
