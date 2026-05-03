-- CreateEnum
CREATE TYPE "ClubSurveyStatus" AS ENUM ('DRAFT', 'OPEN', 'CLOSED');

-- CreateTable
CREATE TABLE "ClubAnnouncement" (
    "id" TEXT NOT NULL,
    "clubId" TEXT NOT NULL,
    "authorUserId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "pinned" BOOLEAN NOT NULL DEFAULT false,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClubAnnouncement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ClubAnnouncement_clubId_publishedAt_idx" ON "ClubAnnouncement"("clubId", "publishedAt");

-- CreateIndex
CREATE INDEX "ClubAnnouncement_clubId_pinned_idx" ON "ClubAnnouncement"("clubId", "pinned");

-- CreateTable
CREATE TABLE "ClubSurvey" (
    "id" TEXT NOT NULL,
    "clubId" TEXT NOT NULL,
    "authorUserId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" "ClubSurveyStatus" NOT NULL DEFAULT 'DRAFT',
    "multipleChoice" BOOLEAN NOT NULL DEFAULT false,
    "allowAnonymous" BOOLEAN NOT NULL DEFAULT false,
    "publishedAt" TIMESTAMP(3),
    "closesAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClubSurvey_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ClubSurvey_clubId_status_idx" ON "ClubSurvey"("clubId", "status");

-- CreateTable
CREATE TABLE "ClubSurveyOption" (
    "id" TEXT NOT NULL,
    "surveyId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClubSurveyOption_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ClubSurveyOption_surveyId_idx" ON "ClubSurveyOption"("surveyId");

-- CreateTable
CREATE TABLE "ClubSurveyResponse" (
    "id" TEXT NOT NULL,
    "surveyId" TEXT NOT NULL,
    "optionId" TEXT NOT NULL,
    "memberId" TEXT,
    "contactId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClubSurveyResponse_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ClubSurveyResponse_surveyId_idx" ON "ClubSurveyResponse"("surveyId");

-- CreateIndex
CREATE UNIQUE INDEX "ClubSurveyResponse_surveyId_memberId_optionId_key" ON "ClubSurveyResponse"("surveyId", "memberId", "optionId");

-- CreateIndex
CREATE UNIQUE INDEX "ClubSurveyResponse_surveyId_contactId_optionId_key" ON "ClubSurveyResponse"("surveyId", "contactId", "optionId");

-- AddForeignKey
ALTER TABLE "ClubSurveyOption" ADD CONSTRAINT "ClubSurveyOption_surveyId_fkey" FOREIGN KEY ("surveyId") REFERENCES "ClubSurvey"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClubSurveyResponse" ADD CONSTRAINT "ClubSurveyResponse_surveyId_fkey" FOREIGN KEY ("surveyId") REFERENCES "ClubSurvey"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClubSurveyResponse" ADD CONSTRAINT "ClubSurveyResponse_optionId_fkey" FOREIGN KEY ("optionId") REFERENCES "ClubSurveyOption"("id") ON DELETE CASCADE ON UPDATE CASCADE;
