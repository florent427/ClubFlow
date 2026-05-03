-- CreateEnum
CREATE TYPE "ClubEventStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ClubEventRegistrationStatus" AS ENUM ('REGISTERED', 'WAITLISTED', 'CANCELLED');

-- CreateTable
CREATE TABLE "ClubEvent" (
    "id" TEXT NOT NULL,
    "clubId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "location" TEXT,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "capacity" INTEGER,
    "registrationOpensAt" TIMESTAMP(3),
    "registrationClosesAt" TIMESTAMP(3),
    "priceCents" INTEGER,
    "status" "ClubEventStatus" NOT NULL DEFAULT 'DRAFT',
    "publishedAt" TIMESTAMP(3),
    "allowContactRegistration" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClubEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ClubEvent_clubId_startsAt_idx" ON "ClubEvent"("clubId", "startsAt");

-- CreateIndex
CREATE INDEX "ClubEvent_clubId_status_idx" ON "ClubEvent"("clubId", "status");

-- CreateTable
CREATE TABLE "ClubEventRegistration" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "memberId" TEXT,
    "contactId" TEXT,
    "status" "ClubEventRegistrationStatus" NOT NULL DEFAULT 'REGISTERED',
    "registeredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cancelledAt" TIMESTAMP(3),
    "note" TEXT,

    CONSTRAINT "ClubEventRegistration_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ClubEventRegistration_eventId_memberId_key" ON "ClubEventRegistration"("eventId", "memberId");

-- CreateIndex
CREATE UNIQUE INDEX "ClubEventRegistration_eventId_contactId_key" ON "ClubEventRegistration"("eventId", "contactId");

-- CreateIndex
CREATE INDEX "ClubEventRegistration_eventId_status_idx" ON "ClubEventRegistration"("eventId", "status");

-- AddForeignKey
ALTER TABLE "ClubEventRegistration" ADD CONSTRAINT "ClubEventRegistration_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "ClubEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
