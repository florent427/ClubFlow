-- PIN à 4 chiffres (hashé bcrypt) qui protège l'accès aux pages
-- /factures + /famille du portail. Optionnel — null = accès libre.
ALTER TABLE "User" ADD COLUMN "payerSpacePinHash" TEXT;
