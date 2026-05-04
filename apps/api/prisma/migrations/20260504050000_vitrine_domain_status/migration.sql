-- VitrineDomainStatus enum + tracking colonnes sur Club
-- (cf. ADR-0007 Caddy admin API + Phase 3 multi-tenant)

CREATE TYPE "VitrineDomainStatus" AS ENUM ('PENDING_DNS', 'VERIFIED', 'ACTIVE', 'ERROR');

ALTER TABLE "Club"
  ADD COLUMN "customDomainStatus" "VitrineDomainStatus" NOT NULL DEFAULT 'PENDING_DNS',
  ADD COLUMN "customDomainCheckedAt" TIMESTAMP(3),
  ADD COLUMN "customDomainErrorMessage" TEXT;

-- Pour les clubs qui ont déjà un customDomain configuré (ex: SKSR avec sksr.re),
-- considérer l'état comme ACTIVE — le vhost Caddy est déjà en place manuellement.
UPDATE "Club"
SET "customDomainStatus" = 'ACTIVE'
WHERE "customDomain" IS NOT NULL;
