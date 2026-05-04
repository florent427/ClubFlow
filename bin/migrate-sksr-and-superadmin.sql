-- migrate-sksr-and-superadmin.sql
--
-- Phase 1 du plan multi-tenant ClubFlow.
-- À exécuter UNE FOIS sur la prod :
--
--   sudo -u postgres psql clubflow -f /tmp/migrate-sksr-and-superadmin.sql
--
-- Ce script est idempotent : toutes les opérations sont guarded.
--
-- Ce qu'il fait :
--  1. Renomme le club existant en "SKSR" (slug=sksr) — suppose qu'il n'y en a qu'un seul jusqu'ici
--  2. S'assure que customDomain='sksr.re' + customDomainStatus='ACTIVE' (déjà live)
--  3. Garantit que florent.morel427@gmail.com existe ET a systemRole=SUPER_ADMIN
--  4. Garantit que Florent garde un ClubMembership(role=CLUB_ADMIN) sur SKSR (dogfooding)
--

\set ON_ERROR_STOP on

BEGIN;

-- =============================================================
-- 1. Rename club (s'il n'a pas déjà le bon slug)
-- =============================================================
DO $$
DECLARE
  club_count INT;
BEGIN
  SELECT COUNT(*) INTO club_count FROM "Club";
  IF club_count = 0 THEN
    RAISE NOTICE '0 club en DB — rien à renommer.';
    RETURN;
  ELSIF club_count > 1 THEN
    RAISE WARNING 'Plus d''un club en DB (count=%) — script suppose 1 seul club historique. Skip rename auto.', club_count;
    RETURN;
  END IF;

  UPDATE "Club"
     SET name             = 'SKSR',
         slug             = 'sksr',
         "customDomain"   = COALESCE("customDomain", 'sksr.re')
   WHERE slug <> 'sksr';

  -- Si déjà sksr, juste s'assurer du customDomain
  UPDATE "Club"
     SET "customDomain"   = 'sksr.re',
         "customDomainStatus" = 'ACTIVE'
   WHERE slug = 'sksr'
     AND ("customDomain" IS DISTINCT FROM 'sksr.re' OR "customDomainStatus" <> 'ACTIVE');

  RAISE NOTICE '✅ Club SKSR : slug=sksr, customDomain=sksr.re, status=ACTIVE';
END $$;

-- =============================================================
-- 2. Florent SUPER_ADMIN (création si manquant)
-- =============================================================
DO $$
DECLARE
  florent_id TEXT;
  sksr_id TEXT;
BEGIN
  SELECT id INTO florent_id FROM "User" WHERE email = 'florent.morel427@gmail.com';
  SELECT id INTO sksr_id FROM "Club" WHERE slug = 'sksr';

  IF florent_id IS NULL THEN
    RAISE NOTICE 'User florent.morel427@gmail.com n''existe pas — création SUPER_ADMIN sans password (login OAuth/magic link uniquement).';
    INSERT INTO "User" (id, email, "displayName", "systemRole", "createdAt", "updatedAt", "emailVerifiedAt")
    VALUES (gen_random_uuid()::text, 'florent.morel427@gmail.com', 'Florent Morel', 'SUPER_ADMIN', NOW(), NOW(), NOW())
    RETURNING id INTO florent_id;
    RAISE NOTICE '✅ User Florent créé (id=%)', florent_id;
  ELSE
    UPDATE "User"
       SET "systemRole" = 'SUPER_ADMIN',
           "emailVerifiedAt" = COALESCE("emailVerifiedAt", NOW())
     WHERE id = florent_id
       AND ("systemRole" IS DISTINCT FROM 'SUPER_ADMIN' OR "emailVerifiedAt" IS NULL);
    RAISE NOTICE '✅ User Florent (id=%) → systemRole=SUPER_ADMIN', florent_id;
  END IF;

  -- Garantir membership CLUB_ADMIN sur SKSR (dogfooding)
  -- Note: ClubMembership n'a pas de updatedAt dans le schema (cf. schema.prisma)
  IF sksr_id IS NOT NULL THEN
    INSERT INTO "ClubMembership" (id, "userId", "clubId", role, "createdAt")
    VALUES (gen_random_uuid()::text, florent_id, sksr_id, 'CLUB_ADMIN', NOW())
    ON CONFLICT ("userId", "clubId") DO UPDATE
      SET role = 'CLUB_ADMIN';
    RAISE NOTICE '✅ Florent ClubMembership(SKSR, CLUB_ADMIN) garanti';
  END IF;
END $$;

-- =============================================================
-- 3. Récap final
-- =============================================================
SELECT
  c.id AS club_id,
  c.name,
  c.slug,
  c."customDomain",
  c."customDomainStatus"
FROM "Club" c;

SELECT
  u.email,
  u."displayName",
  u."systemRole",
  u."emailVerifiedAt" IS NOT NULL AS verified,
  COUNT(m.id) AS memberships_count
FROM "User" u
LEFT JOIN "ClubMembership" m ON m."userId" = u.id
WHERE u."systemRole" = 'SUPER_ADMIN'
   OR u.email = 'florent.morel427@gmail.com'
GROUP BY u.id, u.email, u."displayName", u."systemRole", u."emailVerifiedAt";

COMMIT;

-- =============================================================
-- 🟢 Done. Vérifier que le récap montre :
--    - Club SKSR avec customDomain=sksr.re et status=ACTIVE
--    - User florent.morel427@gmail.com avec systemRole=SUPER_ADMIN, verified=true
-- =============================================================
