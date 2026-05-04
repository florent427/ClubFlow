# Piège — `ClubMembership` n'a PAS de `updatedAt` (contrairement aux autres modèles)

## Symptôme

SQL d'update échoue :
```
ERROR:  column "updatedAt" of relation "ClubMembership" does not exist
LINE 4:    VALUES (..., NOW(), NOW())
```

Ou côté Prisma :
```
Unknown field `updatedAt` on type `ClubMembership`
```

## Contexte

La plupart des modèles Prisma de ClubFlow ont :
```prisma
createdAt DateTime @default(now())
updatedAt DateTime @updatedAt
```

Mais **`ClubMembership` n'a QUE `createdAt`**, pas de `updatedAt`. Cf.
`apps/api/prisma/schema.prisma` :

```prisma
model ClubMembership {
  id        String         @id @default(uuid())
  userId    String
  clubId    String
  role      MembershipRole @default(STAFF)
  createdAt DateTime       @default(now())   // seul timestamp
  // pas d'updatedAt
  ...
}
```

## Cause root

Le pattern est volontaire : `ClubMembership` est conceptuellement une
relation N:N immutable une fois créée (le rôle peut changer mais on s'en
fout du quand). Pas de besoin de tracker `updatedAt`.

## Solution

### Dans les migrations SQL manuelles

```sql
-- Ne pas faire :
INSERT INTO "ClubMembership" (id, "userId", "clubId", role, "createdAt", "updatedAt")
VALUES (...)
ON CONFLICT DO UPDATE SET role = ..., "updatedAt" = NOW();

-- Faire plutôt :
INSERT INTO "ClubMembership" (id, "userId", "clubId", role, "createdAt")
VALUES (...)
ON CONFLICT DO UPDATE SET role = ...;
```

### Dans le code Prisma

```typescript
// Ne pas faire :
await prisma.clubMembership.upsert({
  where: { userId_clubId: { userId, clubId } },
  create: { userId, clubId, role, updatedAt: new Date() }, // erreur
  update: { role, updatedAt: new Date() },                  // erreur
});

// Faire plutôt :
await prisma.clubMembership.upsert({
  where: { userId_clubId: { userId, clubId } },
  create: { userId, clubId, role },
  update: { role },
});
```

## Détection rapide

Avant d'écrire SQL ou Prisma sur ClubMembership, vérifier le schema :
```bash
grep -A 10 'model ClubMembership' apps/api/prisma/schema.prisma
```

Si pas de `updatedAt`, ne pas l'utiliser.

## Cas observés

- 2026-05-04 (bootstrap multi-tenant Phase 1) : `bin/migrate-sksr-and-superadmin.sql`
  v1 incluait `updatedAt` → erreur PostgreSQL. Fix v2 : retiré.

## Pourquoi NE PAS faire

- ❌ Ajouter `updatedAt` au modèle "par homogénéité" → break les
  migrations existantes ; il n'y a pas de raison fonctionnelle de
  tracker quand le rôle a changé pour cette table

## Lié

- [apps/api/prisma/schema.prisma](../../../apps/api/prisma/schema.prisma) — model ClubMembership
- [bin/migrate-sksr-and-superadmin.sql](../../../bin/migrate-sksr-and-superadmin.sql)
