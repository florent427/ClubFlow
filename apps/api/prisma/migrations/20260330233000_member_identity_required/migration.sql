-- Civilité et e-mail obligatoires (prénom/nom l'étaient déjà).
UPDATE "Member" SET "civility" = 'MR' WHERE "civility" IS NULL;

UPDATE "Member"
SET "email" = 'a-renseigner+' || "id" || '@invalid.clubflow'
WHERE "email" IS NULL OR TRIM("email") = '';

ALTER TABLE "Member" ALTER COLUMN "civility" SET NOT NULL;
ALTER TABLE "Member" ALTER COLUMN "email" SET NOT NULL;
