# Socle back-end général ClubFlow — Plan d’implémentation

> **Pour agents :** SOUS-COMPÉTENCE REQUISE : utiliser @superpowers/subagent-driven-development (recommandé) ou @superpowers/executing-plans pour implémenter ce plan tâche par tâche. Les étapes utilisent la syntaxe `- [ ]` pour le suivi.

**Objectif :** Livrer le **module back-end général** (socle technique) : API GraphQL multi-club, authentification JWT de base, registre des modules avec validation des dépendances (selon la conception v0.2), et agrégations « tableau de bord » alignées sur l’écran Stitch *ClubFlow Back-end Dashboard*.

**Architecture :** API **NestJS** (TypeScript) avec **GraphQL (code-first)** et **Prisma** sur **PostgreSQL**. Un « club » est le tenant logique ; le contexte GraphQL résout `clubId` (header `X-Club-Id` en développement, extensible plus tard en sous-domaine). Les règles d’activation des modules sont codées à partir du tableau de dépendances du document de conception. L’UI admin Stitch (« The Athletic Editorial », tokens indigo / bleu / orange, Inter) n’est **pas** implémentée dans ce périmètre : seuls les **schémas GraphQL et données** nécessaires au dashboard sont fournis.

**Stack technique :** Node.js 20+, NestJS 11, `@nestjs/graphql` + Apollo, Prisma 6, PostgreSQL 16, Jest, Supertest, Docker Compose (DB locale).

**Références :**

- Spéc fonctionnelle : `ClubFlow_Conception_Provisoire.md` (sections 3.1, 5, 6).
- Design Stitch : projet **ClubFlow** (`projects/12279937440428373673`), écran **ClubFlow Back-end Dashboard** (`screens/d4d8f41286de400296101698cdd3b037`) — design system *Athletic Editorial* (primary `#000666` / `#1A237E`, secondary `#0056c5`, surfaces `surface` / `surface-container-*`, Inter).

---

## Structure des fichiers (cible)

| Chemin | Rôle |
|--------|------|
| `docker-compose.yml` | PostgreSQL 16 pour le développement local |
| `apps/api/package.json` | Dépendances et scripts de l’API |
| `apps/api/tsconfig.json` | Config TypeScript stricte |
| `apps/api/nest-cli.json` | Génération NestJS |
| `apps/api/src/main.ts` | Bootstrap HTTP + CORS + validation pipe global |
| `apps/api/src/app.module.ts` | Modules racine |
| `apps/api/src/prisma/prisma.module.ts` | Client Prisma injectable |
| `apps/api/src/prisma/prisma.service.ts` | Connexion / lifecycle |
| `apps/api/prisma/schema.prisma` | Modèle données (Club, User, ClubMembership, ModuleDefinition, ClubModule, RefreshToken) |
| `apps/api/prisma/migrations/*` | Migrations versionnées |
| `apps/api/src/domain/module-registry/module-codes.ts` | Enum / liste des codes modules alignés conception |
| `apps/api/src/domain/module-registry/module-dependencies.ts` | Graphe de dépendances (MVP en dur) |
| `apps/api/src/domain/module-registry/module-registry.service.ts` | Activer / désactiver avec validation |
| `apps/api/src/domain/module-registry/module-registry.service.spec.ts` | Tests unitaires du moteur de dépendances |
| `apps/api/src/auth/auth.module.ts` | JWT + stratégie |
| `apps/api/src/auth/jwt.strategy.ts` | Validation payload |
| `apps/api/src/auth/auth.service.ts` | Login email/mot de passe (MVP) |
| `apps/api/src/auth/auth.resolver.ts` | Mutations `login` |
| `apps/api/src/graphql/graphql.module.ts` | Config GraphQL |
| `apps/api/src/common/guards/club-context.guard.ts` | Exige `X-Club-Id` pour resolvers « back-office » |
| `apps/api/src/common/decorators/current-user.decorator.ts` | Utilisateur depuis JWT |
| `apps/api/src/common/decorators/current-club.decorator.ts` | Club courant |
| `apps/api/src/modules/catalog/module-definition.seeder.ts` | Seed des définitions de modules |
| `apps/api/src/dashboard/dashboard.resolver.ts` | Query `adminDashboardSummary` |
| `apps/api/src/dashboard/dashboard.service.ts` | Agrégations (stubs + requêtes réelles minimales) |
| `apps/api/src/clubs/clubs.resolver.ts` | Queries `club`, `myMembership` |
| `apps/api/src/modules/club-modules.resolver.ts` | Queries / mutations modules par club |
| `apps/api/test/app.e2e-spec.ts` | Tests e2e GraphQL (login, dashboard, toggle module) |
| `.env.example` | `DATABASE_URL`, `JWT_SECRET` |

**Hors périmètre explicite de ce plan (YAGNI) :** OAuth social (Google, etc.), profils Netflix, GraphQL mobile avancé, notifications, paiement Stripe, RGPD complet — prévus dans la conception mais reportés après le socle.

---

### Task 1 : Initialiser le dépôt applicatif et la base locale

**Fichiers :**

- Créer : `docker-compose.yml`
- Créer : `apps/api/package.json`
- Créer : `apps/api/tsconfig.json`
- Créer : `apps/api/nest-cli.json`
- Créer : `apps/api/jest.config.js` (ou `jest-e2e.json` + preset `ts-jest`)
- Créer : `.env.example`
- Créer : `apps/api/src/main.ts`
- Créer : `apps/api/src/app.module.ts`

**Préalable Git :** si la racine `ClubFlow` n’est pas encore un dépôt Git, exécuter une fois `git init` à la racine avant tout `git commit` du plan.

**Note shell (Windows) :** les exemples `DATABASE_URL` utilisent la syntaxe **PowerShell** : `$env:DATABASE_URL="..." ; npx prisma ...`. Sous **cmd.exe**, utiliser `set DATABASE_URL=...`.

- [ ] **Étape 1.1 : Créer `docker-compose.yml` (PostgreSQL)**

```yaml
services:
  db:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: clubflow
      POSTGRES_PASSWORD: clubflow
      POSTGRES_DB: clubflow
    ports:
      - "5432:5432"
    volumes:
      - clubflow_pg:/var/lib/postgresql/data
volumes:
  clubflow_pg:
```

- [ ] **Étape 1.2 : Initialiser NestJS dans `apps/api`**

Recommandé : `npx @nestjs/cli@latest new api --package-manager npm --skip-git` dans un dossier temporaire, puis déplacer le contenu vers `apps/api`, **ou** équivalent manuel en s’assurant que `package.json` contient au minimum les scripts suivants (à adapter si `nest new` les a déjà générés) :

```json
{
  "scripts": {
    "start": "nest start",
    "start:dev": "nest start --watch",
    "build": "nest build",
    "test": "jest",
    "test:e2e": "jest --config ./test/jest-e2e.json --runInBand"
  }
}
```

Installer les paquets socle (GraphQL, auth, prisma, tests) :

```bash
cd apps/api
npm install @nestjs/common @nestjs/core @nestjs/platform-express reflect-metadata rxjs graphql @nestjs/graphql @nestjs/apollo @apollo/server graphql-scalars bcryptjs @nestjs/jwt @nestjs/passport passport passport-jwt class-validator class-transformer
npm install -D prisma @prisma/client jest @types/jest ts-jest supertest @types/supertest
npx prisma init
```

Générer **deux** configs Jest si absentes du template Nest : `jest.config.js` (unit) et `test/jest-e2e.json` (e2e) avec `preset: ts-jest`, `rootDir: ..`, `testRegex: .e2e-spec.ts$`, `moduleFileExtensions: js,json,ts` — comme le scaffold officiel Nest (`nest new`).

- [ ] **Étape 1.3 : Démarrer Postgres et vérifier le port**

```bash
docker compose up -d
docker compose ps
```

Attendu : service `db` état `running`, port `5432` exposé.

- [ ] **Étape 1.4 : Commit**

```bash
git add docker-compose.yml apps/api/package.json apps/api/package-lock.json apps/api/tsconfig.json apps/api/nest-cli.json .env.example apps/api/src/main.ts apps/api/src/app.module.ts apps/api/prisma/schema.prisma
git commit -m "chore(api): bootstrap NestJS, Docker Postgres, Prisma init"
```

---

### Task 2 : Schéma Prisma et migration initiale

**Fichiers :**

- Modifier : `apps/api/prisma/schema.prisma`
- Créer : `apps/api/src/prisma/prisma.service.ts`
- Créer : `apps/api/src/prisma/prisma.module.ts`
- Modifier : `apps/api/src/app.module.ts`

- [ ] **Étape 2.1 : Écrire le test e2e minimal qui échoue (pas de tables)**

Créer : `apps/api/test/app.e2e-spec.ts`

```typescript
import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';

describe('DB schema (placeholder)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('placeholder — remplacé après Task 6 par requête GraphQL réelle', async () => {
    expect(app).toBeDefined();
  });
});
```

Run : `cd apps/api && npx jest test/app.e2e-spec.ts`
Attendu : PASS (placeholder) — ce test documente l’emplacement e2e ; les vrais tests GraphQL arrivent en Task 6.

- [ ] **Étape 2.2 : Remplir `schema.prisma`**

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model Club {
  id        String   @id @default(uuid())
  name      String
  slug      String   @unique
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  memberships ClubMembership[]
  modules     ClubModule[]
}

enum MembershipRole {
  CLUB_ADMIN
  BOARD
  COACH
  TREASURER
  SECRETARY
  STAFF
}

model User {
  id           String   @id @default(uuid())
  email        String   @unique
  passwordHash String
  displayName  String
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  memberships ClubMembership[]
  tokens      RefreshToken[]
}

model ClubMembership {
  id        String         @id @default(uuid())
  userId    String
  clubId    String
  role      MembershipRole @default(STAFF)
  createdAt DateTime       @default(now())

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)
  club Club @relation(fields: [clubId], references: [id], onDelete: Cascade)

  @@unique([userId, clubId])
}

model ModuleDefinition {
  code        String   @id
  label       String
  isRequired  Boolean  @default(false)
  description String?
  clubModules ClubModule[]
}

model ClubModule {
  id        String   @id @default(uuid())
  clubId  String
  moduleCode String
  enabled   Boolean  @default(false)
  enabledAt DateTime?
  disabledAt DateTime?

  club   Club             @relation(fields: [clubId], references: [id], onDelete: Cascade)
  module ModuleDefinition @relation(fields: [moduleCode], references: [code], onDelete: Restrict)

  @@unique([clubId, moduleCode])
}

// RefreshToken : phase ultérieure (refresh / rotation). MVP = JWT access seul.
// Retirer ce modèle du schéma si YAGNI strict sur la première migration.
model RefreshToken {
  id        String   @id @default(uuid())
  userId    String
  tokenHash String   @unique
  expiresAt DateTime
  createdAt DateTime @default(now())

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)
}
```

- [ ] **Étape 2.3 : Migrer**

PowerShell :

```powershell
cd apps/api
$env:DATABASE_URL = "postgresql://clubflow:clubflow@localhost:5432/clubflow"
npx prisma migrate dev --name init_socle
```

Attendu : migration appliquée, client Prisma généré.

- [ ] **Étape 2.4 : Commit**

```bash
git add apps/api/prisma apps/api/src/prisma apps/api/src/app.module.ts
git commit -m "feat(db): prisma schema club, user, modules, refresh tokens"
```

---

### Task 3 : Moteur de registre des modules et dépendances (TDD)

**Fichiers :**

- Créer : `apps/api/src/domain/module-registry/module-codes.ts`
- Créer : `apps/api/src/domain/module-registry/module-dependencies.ts`
- Créer : `apps/api/src/domain/module-registry/module-registry.service.ts`
- Créer : `apps/api/src/domain/module-registry/module-registry.service.spec.ts`

- [ ] **Étape 3.1 : Écrire le test qui échoue — Blog sans Site Web**

```typescript
// apps/api/src/domain/module-registry/module-registry.service.spec.ts
import { ModuleRegistryService } from './module-registry.service';
import { ModuleCode } from './module-codes';

describe('ModuleRegistryService', () => {
  const svc = new ModuleRegistryService();

  it('rejette l’activation de BLOG sans WEBSITE', () => {
    const enabled = new Set<ModuleCode>([ModuleCode.MEMBERS]);
    expect(() =>
      svc.assertCanEnable(ModuleCode.BLOG, enabled),
    ).toThrow(/WEBSITE/);
  });

  it('autorise BLOG lorsque WEBSITE est actif', () => {
    const enabled = new Set<ModuleCode>([ModuleCode.MEMBERS, ModuleCode.WEBSITE]);
    expect(() => svc.assertCanEnable(ModuleCode.BLOG, enabled)).not.toThrow();
  });

  it('rejette SHOP sans WEBSITE ou sans PAYMENT', () => {
    expect(() =>
      svc.assertCanEnable(
        ModuleCode.SHOP,
        new Set([ModuleCode.MEMBERS, ModuleCode.PAYMENT]),
      ),
    ).toThrow(/WEBSITE/);
    expect(() =>
      svc.assertCanEnable(
        ModuleCode.SHOP,
        new Set([ModuleCode.MEMBERS, ModuleCode.WEBSITE]),
      ),
    ).toThrow(/PAYMENT/);
  });
});
```

Run : `cd apps/api && npx jest src/domain/module-registry/module-registry.service.spec.ts`
Attendu : **FAIL** (service ou méthode absente).

- [ ] **Étape 3.2 : Implémentation minimale**

```typescript
// apps/api/src/domain/module-registry/module-codes.ts
export enum ModuleCode {
  MEMBERS = 'MEMBERS',
  PAYMENT = 'PAYMENT',
  PLANNING = 'PLANNING',
  COMMUNICATION = 'COMMUNICATION',
  ACCOUNTING = 'ACCOUNTING',
  SUBSIDIES = 'SUBSIDIES', // spec « Subventions » — code technique court
  SPONSORING = 'SPONSORING',
  WEBSITE = 'WEBSITE',
  BLOG = 'BLOG',
  SHOP = 'SHOP',
  CLUB_LIFE = 'CLUB_LIFE',
  EVENTS = 'EVENTS',
  BOOKING = 'BOOKING',
}
```

```typescript
// apps/api/src/domain/module-registry/module-dependencies.ts
import { ModuleCode } from './module-codes';

/** Prérequis pour *activer* un module (selon section 5.2 du doc de conception). */
export const ENABLE_REQUIRES: Record<ModuleCode, ModuleCode[]> = {
  [ModuleCode.MEMBERS]: [],
  [ModuleCode.PAYMENT]: [ModuleCode.MEMBERS],
  [ModuleCode.PLANNING]: [ModuleCode.MEMBERS],
  [ModuleCode.COMMUNICATION]: [ModuleCode.MEMBERS],
  [ModuleCode.ACCOUNTING]: [ModuleCode.PAYMENT],
  [ModuleCode.SUBSIDIES]: [ModuleCode.ACCOUNTING],
  [ModuleCode.SPONSORING]: [ModuleCode.ACCOUNTING],
  [ModuleCode.WEBSITE]: [],
  [ModuleCode.BLOG]: [ModuleCode.WEBSITE],
  [ModuleCode.SHOP]: [ModuleCode.WEBSITE, ModuleCode.PAYMENT],
  [ModuleCode.CLUB_LIFE]: [ModuleCode.MEMBERS],
  [ModuleCode.EVENTS]: [ModuleCode.MEMBERS],
  [ModuleCode.BOOKING]: [ModuleCode.MEMBERS],
};
```

```typescript
// apps/api/src/domain/module-registry/module-registry.service.ts
import { BadRequestException, Injectable } from '@nestjs/common';
import { ModuleCode } from './module-codes';
import { ENABLE_REQUIRES } from './module-dependencies';

@Injectable()
export class ModuleRegistryService {
  assertCanEnable(target: ModuleCode, enabled: Set<ModuleCode>): void {
    const missing = (ENABLE_REQUIRES[target] ?? []).filter(
      (code) => !enabled.has(code),
    );
    if (missing.length) {
      throw new BadRequestException(
        `Cannot enable ${target}: missing ${missing.join(', ')}`,
      );
    }
  }

  assertCanDisable(target: ModuleCode, enabled: Set<ModuleCode>): void {
    const dependents = Object.entries(ENABLE_REQUIRES)
      .filter(([, reqs]) => reqs.includes(target))
      .map(([code]) => code as ModuleCode)
      .filter((code) => enabled.has(code));
    if (dependents.length) {
      throw new BadRequestException(
        `Cannot disable ${target}: required by ${dependents.join(', ')}`,
      );
    }
  }
}
```

- [ ] **Étape 3.3 : Relancer les tests unitaires**

Run : `npx jest src/domain/module-registry/module-registry.service.spec.ts`
Attendu : **PASS**

- [ ] **Étape 3.4 : Commit**

```bash
git add apps/api/src/domain/module-registry
git commit -m "feat(modules): dependency validation for module activation"
```

---

### Task 4 : GraphQL — contexte club, auth JWT (Gql), guards, seed des définitions

**Fichiers :**

- Créer : `apps/api/src/common/guards/club-context.guard.ts`
- Créer : `apps/api/src/common/guards/gql-jwt-auth.guard.ts` (étend `AuthGuard('jwt')`, lit le bearer via `GqlExecutionContext`)
- Créer : `apps/api/src/common/decorators/current-club.decorator.ts`
- Créer : `apps/api/src/common/decorators/current-user.decorator.ts`
- Créer : `apps/api/src/modules/catalog/module-definition.seeder.ts`
- Créer : `apps/api/src/graphql/graphql.module.ts`
- Modifier : `apps/api/src/app.module.ts`

**RBAC MVP :** documenter explicitement que seuls `MembershipRole.CLUB_ADMIN` (et optionnellement `BOARD`) peuvent appeler `setClubModuleEnabled` et `adminDashboardSummary`. Les autres rôles reçoivent `ForbiddenException`. La granularité complète (section 3.1 conception) est hors MVP.

- [ ] **Étape 4.1 : Brancher Passport JWT pour GraphQL**

Dans `jwt.strategy.ts`, `validate` retourne `{ userId, email }`. `GqlJwtAuthGuard` récupère `req` via `GqlExecutionContext.create(context).getContext().req` (Apollo configuré avec `context: ({ req }) => ({ req })`).

- [ ] **Étape 4.2 : Implémenter guard club + decorateur + seeder**

Le guard lit `req.headers['x-club-id']`, vérifie l’existence du club via Prisma, attache `req.club`.

Le seeder upsert toutes les entrées `ModuleDefinition` avec `MEMBERS.isRequired = true` (aligné section 3.1 / 4.1).

- [ ] **Étape 4.3 : Commit**

```bash
git add apps/api/src/common apps/api/src/modules/catalog apps/api/src/graphql apps/api/src/app.module.ts
git commit -m "feat(graphql): club context, gql jwt guard, module definition seed"
```

---

### Task 5 : Authentification MVP (email / mot de passe + JWT)

**Fichiers :**

- Créer : `apps/api/src/auth/auth.module.ts`
- Créer : `apps/api/src/auth/auth.service.ts`
- Créer : `apps/api/src/auth/auth.resolver.ts`
- Créer : `apps/api/src/auth/dto/login.input.ts`
- Créer : `apps/api/src/auth/jwt.strategy.ts`
- Créer : `apps/api/src/auth/auth.service.spec.ts`

- [ ] **Étape 5.1 : Test unitaire `auth.service` — mot de passe invalide**

```typescript
// apps/api/src/auth/auth.service.spec.ts
import { AuthService } from './auth.service';
import { UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';

describe('AuthService', () => {
  it('lance Unauthorized si mot de passe incorrect', async () => {
    const prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'u1',
          email: 'a@b.c',
          passwordHash: await bcrypt.hash('good', 8),
        }),
      },
    } as unknown as PrismaService;
    const jwt = { sign: jest.fn() } as unknown as JwtService;
    const svc = new AuthService(prisma, jwt);
    await expect(
      svc.login({ email: 'a@b.c', password: 'bad' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
```

Run : `npx jest src/auth/auth.service.spec.ts`
Attendu : **FAIL** puis **PASS** après implémentation de `login`.

- [ ] **Étape 5.2 : Implémenter `login`**

`bcrypt.compare`, payload JWT minimal `{ sub: userId, email }`, durée courte (ex. 15m), `JWT_SECRET` depuis env.

- [ ] **Étape 5.3 : Mutation GraphQL**

```graphql
mutation {
  login(input: { email: "admin@clubflow.local", password: "ChangeMe!" }) {
    accessToken
  }
}
```

- [ ] **Étape 5.4 : Commit**

```bash
git add apps/api/src/auth
git commit -m "feat(auth): email password login and JWT"
```

---

### Task 6 : Resolvers — modules club, dashboard admin, adhésion

**Fichiers :**

- Créer : `apps/api/src/clubs/clubs.resolver.ts`
- Créer : `apps/api/src/modules/club-modules.resolver.ts`
- Créer : `apps/api/src/modules/club-modules.service.ts`
- Créer : `apps/api/src/dashboard/dashboard.resolver.ts`
- Créer : `apps/api/src/dashboard/dashboard.service.ts`
- Créer : `apps/api/src/dashboard/models/admin-dashboard.model.ts`

- [ ] **Étape 6.1 : Contrat GraphQL aligné dashboard Stitch (KPIs éditoriaux)**

Exposer une query `adminDashboardSummary` retournant des champs adaptés aux cartes type *Stat-Wing* :

- `activeMembersCount` (count `ClubMembership` pour le club)
- `activeModulesCount` (count `ClubModule` avec `enabled`)
- `upcomingSessionsCount` — **stub `0`** jusqu’au module Planning
- `outstandingPaymentsCount` — **stub `0`** jusqu’au module Paiement
- `revenueCentsMonth` — **stub `0`**

Les libellés côté front pourront reprendre la hiérarchie typographique Inter du design Stitch.

- [ ] **Étape 6.2 : Mutation `setClubModuleEnabled`**

Utilise `ModuleRegistryService` + transaction Prisma pour créer/mettre à jour `ClubModule`.

- [ ] **Étape 6.3 : Tests e2e complets** (réécrire / compléter `apps/api/test/app.e2e-spec.ts` à ce stade : resolvers et Apollo sont en place)

```bash
cd apps/api && npm run test:e2e
```

Scénarios minimaux :

1. Seed : un club, un user admin, **`MEMBERS` toujours activé** (aligné sections 3.1 et 4.1 — non désactivable dans le MVP ou retour d’erreur si tentative).
2. `login` retourne un token.
3. `adminDashboardSummary` **sans** `X-Club-Id` → erreur HTTP / GraphQL attendue (guard club).
4. `adminDashboardSummary` avec `Authorization: Bearer …` et `X-Club-Id` → entiers cohérents.
5. Utilisateur avec rôle non autorisé → `ForbiddenException` sur dashboard / toggle module.
6. Activation `BLOG` sans `WEBSITE` → erreur métier.

Attendu : **PASS**

- [ ] **Étape 6.4 : Commit**

```bash
git add apps/api/src/clubs apps/api/src/modules apps/api/src/dashboard apps/api/test
git commit -m "feat(api): club modules resolver and admin dashboard summary"
```

---

### Task 7 : Documentation d’exécution locale et durcissement

**Fichiers :**

- Modifier : `.env.example`
- Créer (optionnel si politique repo) : racine `README.md` **uniquement si absent** — sinon ajouter section dans README existant (YAGNI : si aucun README, créer une phrase + commandes dans le plan uniquement, sans nouveau fichier si vous évitez les markdown non demandés ; ici préférer mettre les commandes dans `docs/superpowers/plans/...` et `.env.example`).

- [ ] **Étape 7.1 : `.env.example` complet**

```
DATABASE_URL=postgresql://clubflow:clubflow@localhost:5432/clubflow
JWT_SECRET=change-me-in-production
PORT=3000
```

- [ ] **Étape 7.2 : Script npm `db:seed`** pour utilisateur démo + club

- [ ] **Étape 7.3 : Vérification finale**

```bash
docker compose up -d
cd apps/api && npx prisma migrate deploy && npm run db:seed && npm run start:dev
```

Puis requête GraphQL Playground : health implicite + `login` + `adminDashboardSummary`.

- [ ] **Étape 7.4 : Commit**

```bash
git add .env.example apps/api/package.json
git commit -m "chore: env example and demo seed script"
```

---

## Revue du plan (checklist auteur)

- [ ] Chaque tâche a des chemins exacts, commandes et résultat attendu.
- [ ] Les dépendances modules reflètent le tableau 5.2 du document de conception.
- [ ] Le périmètre reste « socle back-end » : pas d’OAuth social ni de logique métier Membres avancée (groupes dynamiques, familles) dans ce plan.
- [ ] Les champs dashboard permettent au front Stitch d’afficher des cartes KPI sans mock statique côté client.

---

## Fin de plan — reprise d’exécution

**Plan enregistré sous :** `docs/superpowers/plans/2026-03-30-socle-backend-general-clubflow.md`

**Deux options d’exécution :**

1. **Subagent-driven (recommandé)** — une tâche fraîche par sous-agent, relecture entre les tâches : utiliser @superpowers/subagent-driven-development.
2. **Exécution inline** — enchaîner les tâches dans cette session avec pauses de relecture : utiliser @superpowers/executing-plans.

**Quelle approche préférez-vous ?**
