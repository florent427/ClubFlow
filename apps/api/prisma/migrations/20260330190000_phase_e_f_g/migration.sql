-- Phase E — Paiement, F — Communication, G — Comptabilité + stubs finance externe

CREATE TYPE "InvoiceStatus" AS ENUM ('OPEN', 'PAID', 'VOID');

CREATE TYPE "ClubPaymentMethod" AS ENUM ('STRIPE_CARD', 'MANUAL_CASH', 'MANUAL_CHECK', 'MANUAL_TRANSFER');

CREATE TYPE "PricingAdjustmentType" AS ENUM ('NONE', 'PERCENT_BP', 'FIXED_CENTS');

CREATE TYPE "CommunicationChannel" AS ENUM ('EMAIL', 'TELEGRAM', 'PUSH');

CREATE TYPE "MessageCampaignStatus" AS ENUM ('DRAFT', 'SENT');

CREATE TYPE "AccountingEntryKind" AS ENUM ('INCOME', 'EXPENSE');

CREATE TYPE "GrantApplicationStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'ARCHIVED');

CREATE TYPE "SponsorshipDealStatus" AS ENUM ('ACTIVE', 'CLOSED');

CREATE TABLE "ClubPricingRule" (
    "id" TEXT NOT NULL,
    "clubId" TEXT NOT NULL,
    "method" "ClubPaymentMethod" NOT NULL,
    "adjustmentType" "PricingAdjustmentType" NOT NULL DEFAULT 'NONE',
    "adjustmentValue" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClubPricingRule_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Invoice" (
    "id" TEXT NOT NULL,
    "clubId" TEXT NOT NULL,
    "familyId" TEXT,
    "label" TEXT NOT NULL,
    "baseAmountCents" INTEGER NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "status" "InvoiceStatus" NOT NULL DEFAULT 'OPEN',
    "dueAt" TIMESTAMP(3),
    "stripePaymentIntentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "clubId" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "method" "ClubPaymentMethod" NOT NULL,
    "externalRef" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "StripeWebhookEvent" (
    "id" TEXT NOT NULL,
    "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StripeWebhookEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MessageCampaign" (
    "id" TEXT NOT NULL,
    "clubId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "channel" "CommunicationChannel" NOT NULL,
    "dynamicGroupId" TEXT,
    "status" "MessageCampaignStatus" NOT NULL DEFAULT 'DRAFT',
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MessageCampaign_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MessageCampaignRecipient" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MessageCampaignRecipient_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AccountingEntry" (
    "id" TEXT NOT NULL,
    "clubId" TEXT NOT NULL,
    "kind" "AccountingEntryKind" NOT NULL,
    "label" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "paymentId" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccountingEntry_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "GrantApplication" (
    "id" TEXT NOT NULL,
    "clubId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "status" "GrantApplicationStatus" NOT NULL DEFAULT 'DRAFT',
    "amountCents" INTEGER,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GrantApplication_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SponsorshipDeal" (
    "id" TEXT NOT NULL,
    "clubId" TEXT NOT NULL,
    "sponsorName" TEXT NOT NULL,
    "amountCents" INTEGER,
    "status" "SponsorshipDealStatus" NOT NULL DEFAULT 'ACTIVE',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SponsorshipDeal_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ClubPricingRule_clubId_method_key" ON "ClubPricingRule"("clubId", "method");

CREATE INDEX "ClubPricingRule_clubId_idx" ON "ClubPricingRule"("clubId");

CREATE UNIQUE INDEX "Invoice_stripePaymentIntentId_key" ON "Invoice"("stripePaymentIntentId");

CREATE INDEX "Invoice_clubId_status_idx" ON "Invoice"("clubId", "status");

CREATE INDEX "Payment_clubId_createdAt_idx" ON "Payment"("clubId", "createdAt");

CREATE INDEX "Payment_invoiceId_idx" ON "Payment"("invoiceId");

CREATE INDEX "MessageCampaign_clubId_idx" ON "MessageCampaign"("clubId");

CREATE UNIQUE INDEX "MessageCampaignRecipient_campaignId_memberId_key" ON "MessageCampaignRecipient"("campaignId", "memberId");

CREATE INDEX "MessageCampaignRecipient_memberId_idx" ON "MessageCampaignRecipient"("memberId");

CREATE INDEX "AccountingEntry_clubId_occurredAt_idx" ON "AccountingEntry"("clubId", "occurredAt");

CREATE INDEX "GrantApplication_clubId_idx" ON "GrantApplication"("clubId");

CREATE INDEX "SponsorshipDeal_clubId_idx" ON "SponsorshipDeal"("clubId");

ALTER TABLE "ClubPricingRule" ADD CONSTRAINT "ClubPricingRule_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "Family"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Payment" ADD CONSTRAINT "Payment_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Payment" ADD CONSTRAINT "Payment_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "MessageCampaign" ADD CONSTRAINT "MessageCampaign_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MessageCampaign" ADD CONSTRAINT "MessageCampaign_dynamicGroupId_fkey" FOREIGN KEY ("dynamicGroupId") REFERENCES "DynamicGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "MessageCampaignRecipient" ADD CONSTRAINT "MessageCampaignRecipient_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "MessageCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MessageCampaignRecipient" ADD CONSTRAINT "MessageCampaignRecipient_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AccountingEntry" ADD CONSTRAINT "AccountingEntry_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AccountingEntry" ADD CONSTRAINT "AccountingEntry_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "GrantApplication" ADD CONSTRAINT "GrantApplication_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SponsorshipDeal" ADD CONSTRAINT "SponsorshipDeal_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;
