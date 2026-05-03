-- ============================================================
-- Rôle système global sur User (SUPER_ADMIN / ADMIN)
-- Migration non-destructive : nouvelle colonne nullable + backfill
-- du super admin sur l'email seed admin@clubflow.local.
-- ============================================================

-- 1. Enum SystemRole.
CREATE TYPE "SystemRole" AS ENUM ('ADMIN', 'SUPER_ADMIN');

-- 2. Colonne sur User (nullable, default null = pas de droits système).
ALTER TABLE "User"
  ADD COLUMN "systemRole" "SystemRole";

-- 3. Backfill : promouvoir l'utilisateur seed admin@clubflow.local en
--    SUPER_ADMIN s'il existe déjà. Pas d'erreur si la table est vide
--    (seed pas encore lancé).
UPDATE "User"
   SET "systemRole" = 'SUPER_ADMIN'
 WHERE LOWER("email") = 'admin@clubflow.local';
