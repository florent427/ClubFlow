-- CreateTable
CREATE TABLE "ClubEventAttachment" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "storagePath" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClubEventAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ClubEventAttachment_eventId_createdAt_idx" ON "ClubEventAttachment"("eventId", "createdAt");

-- AddForeignKey
ALTER TABLE "ClubEventAttachment" ADD CONSTRAINT "ClubEventAttachment_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "ClubEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
