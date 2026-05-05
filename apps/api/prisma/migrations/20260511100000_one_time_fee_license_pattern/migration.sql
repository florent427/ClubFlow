-- Ajoute la possibilité de valider le format d'un numéro de licence
-- existante (regex JS-compatible) au niveau du club, par fee de type
-- LICENSE. Ex FFKDA : `^\d{8}[A-Z]$` ; hint humain : "8 chiffres + 1
-- lettre majuscule (12345678A)".

ALTER TABLE "MembershipOneTimeFee"
  ADD COLUMN "licenseNumberPattern"    TEXT,
  ADD COLUMN "licenseNumberFormatHint" TEXT;

-- Permet au payeur de déclarer une licence existante + sélectionner
-- des frais OPTIONAL DIRECTEMENT sur l'inscription en attente (avant
-- validation du panier — sinon il valide à l'aveugle puis corrige).
ALTER TABLE "MembershipCartPendingItem"
  ADD COLUMN "hasExistingLicense"      BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "existingLicenseNumber"   TEXT,
  ADD COLUMN "oneTimeFeeOverrideIdsCsv" TEXT;
