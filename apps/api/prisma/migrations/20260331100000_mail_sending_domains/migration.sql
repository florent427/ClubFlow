-- CreateEnum
CREATE TYPE "ClubSendingDomainPurpose" AS ENUM ('TRANSACTIONAL', 'CAMPAIGN', 'BOTH');

-- CreateEnum
CREATE TYPE "ClubSendingDomainVerificationStatus" AS ENUM ('PENDING', 'VERIFIED', 'FAILED');

-- CreateTable
CREATE TABLE "ClubSendingDomain" (
    "id" TEXT NOT NULL,
    "clubId" TEXT NOT NULL,
    "fqdn" TEXT NOT NULL,
    "purpose" "ClubSendingDomainPurpose" NOT NULL,
    "verificationStatus" "ClubSendingDomainVerificationStatus" NOT NULL DEFAULT 'PENDING',
    "providerDomainId" TEXT,
    "dnsRecordsJson" TEXT,
    "lastCheckedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClubSendingDomain_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailSuppression" (
    "id" TEXT NOT NULL,
    "clubId" TEXT NOT NULL,
    "emailNormalized" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailSuppression_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ClubSendingDomain_clubId_fqdn_key" ON "ClubSendingDomain"("clubId", "fqdn");

-- CreateIndex
CREATE INDEX "ClubSendingDomain_clubId_idx" ON "ClubSendingDomain"("clubId");

-- CreateIndex
CREATE UNIQUE INDEX "EmailSuppression_clubId_emailNormalized_key" ON "EmailSuppression"("clubId", "emailNormalized");

-- CreateIndex
CREATE INDEX "EmailSuppression_clubId_idx" ON "EmailSuppression"("clubId");

-- AddForeignKey
ALTER TABLE "ClubSendingDomain" ADD CONSTRAINT "ClubSendingDomain_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailSuppression" ADD CONSTRAINT "EmailSuppression_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;
