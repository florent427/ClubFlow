# Plan d’implémentation — Inscription contact, E/M et OAuth (Google v1)

> **Pour agents :** sous-skill requis : `superpowers:subagent-driven-development` (recommandé) ou `superpowers:executing-plans`. Les étapes utilisent des cases à cocher (`- [ ]`) pour le suivi.

**Goal :** Permettre l’inscription et la connexion des **contacts** par email/mot de passe (avec vérification email obligatoire) et par **Google OAuth** (v1), avec fusion automatique des comptes selon la spec, sans casser le portail membre existant.

**Architecture :** Étendre Prisma (`User`, `Contact`, `UserIdentity`, jetons de vérification), `AuthService` / `AuthResolver`, envoi transactional mail pour le lien de vérif, routes HTTP Nest pour OAuth + redirect vers le portail, garde métier « email vérifié » pour les opérations contact, throttle public. Le portail adapte le routage : session **sans** profil membre mais avec `X-Club-Id` issu du contact (ou `VITE_CLUB_ID` en MVP).

**Tech Stack :** NestJS, GraphQL (Apollo), Prisma, PostgreSQL, bcrypt, JWT (`@nestjs/jwt` / `passport-jwt`), mail existant (`TransactionalMailService`, `ClubSendingDomainService`), Vite + React portail, `@nestjs/throttler`, client OAuth (ex. `openid-client` **ou** `passport-google-oauth20` — trancher une seule lib pour Google en v1).

**Références :** Spec [`docs/superpowers/specs/2026-03-31-inscription-contact-oauth-design.md`](../specs/2026-03-31-inscription-contact-oauth-design.md) ; portail [`docs/superpowers/specs/2026-03-31-portail-membre-mvp-design.md`](../specs/2026-03-31-portail-membre-mvp-design.md).

---

## Carte des fichiers (création / modification)

| Zone | Fichiers principaux |
|------|---------------------|
| Données | `apps/api/prisma/schema.prisma`, nouvelle migration ; `apps/api/prisma/seed.ts` (données compatibles `emailVerifiedAt`, comptes seed) |
| Config | `apps/api/.env.example`, `apps/api/src/main.ts` ou service bootstrap : validation `CLUB_ID` + club existant |
| Auth cœur | `apps/api/src/auth/auth.service.ts`, `auth.module.ts`, `auth.resolver.ts`, `jwt.strategy.ts`, `auth.service.spec.ts` |
| DTO / modèles GQL | `apps/api/src/auth/dto/*.ts`, `apps/api/src/auth/models/login-payload.model.ts` (ex. champ `contactClubId`), nouveaux inputs |
| Identités OAuth | Nouveau : `apps/api/src/auth/oauth/*.ts` (controller, service, stratégie ou client OIDC) |
| Gardes | Nouveau : `apps/api/src/common/guards/email-verified.guard.ts` (ou équivalent) ; possible adaptation `viewer-active-profile.guard.ts` si besoin |
| Mail | `apps/api/src/mail/transactional-mail.service.ts` (+ méthode `sendEmailVerification`) |
| Rate limit | `apps/api/src/app.module.ts` / `graphql.module.ts` : `ThrottlerModule`, décorateurs sur mutations publiques |
| Portail | `apps/member-portal/src/App.tsx`, `pages/LoginPage.tsx`, `pages/RegisterPage.tsx` (nouveau), `pages/VerifyEmailPage.tsx` ou route query `token`, `pages/OAuthCallbackPage.tsx` (nouveau), `lib/documents.ts`, `lib/storage.ts`, `vite` env `.env.example` |
| E2E | `apps/api/test/app.e2e-spec.ts` ou nouveau `auth-contact.e2e-spec.ts` |

---

### Task 1 : Migration Prisma — `User`, `Contact`, `UserIdentity`, jeton de vérification

**Files:**
- Modify: `apps/api/prisma/schema.prisma`
- Create: `apps/api/prisma/migrations/<timestamp>_contact_auth_oauth/migration.sql`
- Modify: `apps/api/prisma/seed.ts` (users seed : `emailVerifiedAt`, `passwordHash` si besoin)

- [ ] **Step 1 :** Ajouter `emailVerifiedAt DateTime?` sur `User` ; rendre `passwordHash String?` (nullable).
- [ ] **Step 2 :** Créer modèle `Contact` avec `clubId`, `userId`, champs min. (`firstName`, `lastName` ou `displayName` aligné produit), et **`@@unique([userId, clubId])`**.
- [ ] **Step 3 :** Créer enum `OAuthProvider { GOOGLE FACEBOOK LINKEDIN }` et modèle `UserIdentity` avec `@@unique([provider, providerSubject])`, FK `userId`.
- [ ] **Step 4 :** Créer `EmailVerificationToken` : `id`, `userId`, `tokenHash`, `expiresAt`, `consumedAt DateTime?` (usage unique).
- [ ] **Step 5 :** `npx prisma migrate dev` (ou équivalent CI). **Backfill obligatoire :** dans la même migration SQL (ou migration données suivante), poser `emailVerifiedAt = createdAt` (ou `now()`) pour tout `User` ayant déjà un `passwordHash` non null, afin de ne pas **casser** les comptes existants en prod/dev. Mettre à jour seed pour cohérence.

**Vérif :** `npx prisma validate` ; appliquer migration sur DB locale.

- [ ] **Step 6 : Commit**

```bash
git add apps/api/prisma apps/api/prisma/seed.ts
git commit -m "feat(api): schéma Contact, OAuth identities et vérif email"
```

---

### Task 2 : Validation `CLUB_ID` au démarrage

**Files:**
- Modify: `apps/api/src/main.ts` **ou** nouveau `apps/api/src/config/club-bootstrap.service.ts` + `AppModule`
- Modify: `apps/api/.env.example`

- [ ] **Step 1 :** Documenter `CLUB_ID=<uuid>` dans `.env.example` (requis MVP).
- [ ] **Step 2 :** Avant `listen()`, ou dans `OnModuleInit` d’un provider injectant `PrismaService`, vérifier `process.env.CLUB_ID` et `prisma.club.findUnique` ; si absent → `Logger.error` + `process.exit(1)`.

**Vérif :** Démarrer l’API sans `CLUB_ID` → échec explicite ; avec ID valide → démarrage OK.

- [ ] **Step 3 : Commit**

```bash
git commit -m "feat(api): validation CLUB_ID au démarrage"
```

---

### Task 3 : Service jetons + envoi email de vérification

**Files:**
- Create: `apps/api/src/auth/email-verification.service.ts` (générer token, hasher, persister, consommer)
- Modify: `apps/api/src/mail/transactional-mail.service.ts`
- Modify: `apps/api/src/auth/auth.module.ts` (providers, exports)

- [ ] **Step 1 :** Tests unitaires `email-verification.service.spec.ts` : création jeton, expiration, consommation unique, rejet si hash incorrect.

**Run :** `cd apps/api && npm test -- email-verification.service.spec.ts`  
**Attendu :** vert après implémentation.

- [ ] **Step 2 :** Implémenter `hashToken` / `verifyAndConsume` avec secret dédié `EMAIL_VERIFICATION_SECRET` (env, `.env.example`).
- [ ] **Step 3 :** `sendEmailVerificationEmail(clubId, to, linkUrl)` dans transactional mail (HTML + texte), via profil domaine club existant.

- [ ] **Step 4 : Commit**

```bash
git commit -m "feat(api): jetons vérification email et envoi transactional"
```

---

### Task 4 : `registerContact`, `verifyEmail`, `resendVerificationEmail`, `login` (email non vérifié)

**Files:**
- Modify: `apps/api/src/auth/auth.service.ts`, `auth.resolver.ts`
- Create: `apps/api/src/auth/dto/register-contact.input.ts`, `verify-email.input.ts`, `resend-verification.input.ts`
- Modify: `apps/api/src/auth/auth.service.spec.ts`

**Prérequis :** exécuter **Task 6 avant Task 4** (ou un seul PR combinant les deux) afin de ne pas exposer de mutations publiques sans `@Throttle`.

- [ ] **Step 1 :** Test : `login` avec user `emailVerifiedAt: null` → `UnauthorizedException` (ou erreur GraphQL typée) — pas de token.
- [ ] **Step 2 :** Test : `registerContact` crée User + Contact, envoie mail (mock transport), ne retourne pas de `LoginPayload` avec accès complet (spec : pas de JWT métier ; mutation peut retourner un booléen `{ ok: true }` ou champ `success`).
- [ ] **Step 3 :** Test : `verifyEmail` avec token valide → `emailVerifiedAt` défini + retour `LoginPayload` (mock jwt sign).
- [ ] **Step 4 :** Implémenter `resendVerificationEmail` : réponse homogène que l’email existe ou non (spec 6.5).

- [ ] **Step 5 :** **Anti-énumération (spec 6.5, tableau 8.1) :** tests + comportement pour `registerContact` et `login` : email inconnu / déjà pris / mauvais mot de passe → **même code GraphQL ou message générique** autant que possible ; éviter fuites dans le corps d’erreur ; optionnel : **délai minimum constant** (ou jitter) sur chemins sensibles pour réduire les fuites par timing.

**Run :** `cd apps/api && npm test -- auth.service.spec.ts`  
**Attendu :** PASS

- [ ] **Step 6 :** Exposer mutations sur `AuthResolver` **sans** `GqlJwtAuthGuard` ; décorer `@Throttle` (Task 6).

- [ ] **Step 7 : Commit**

```bash
git commit -m "feat(api): registerContact, verifyEmail, resend, login si email vérifié"
```

---

### Task 5 : Extension `LoginPayload` et login OAuth-ready

**Files:**
- Modify: `apps/api/src/auth/models/login-payload.model.ts`
- Modify: `apps/api/src/graphql/register-enums.ts` si nouveaux enums exposés
- Modify: `apps/member-portal/src/lib/auth-types.ts`, `lib/documents.ts`

- [ ] **Step 1 :** Ajouter champ nullable `contactClubId` (ou `viewerDefaultClubId`) sur `LoginPayload` : rempli quand `viewerProfiles` vide mais `Contact` existe pour `CLUB_ID` / club du user.

- [ ] **Step 2 :** Adapter `login` et `verifyEmail` pour renseigner ce champ ; `selectActiveViewerProfile` inchangé pour membres.

- [ ] **Step 3 :** Régénérer / vérifier `schema.gql` si commité.

- [ ] **Step 4 : Commit**

```bash
git commit -m "feat(api): LoginPayload avec contactClubId pour portail sans profil membre"
```

---

### Task 6 : Rate limiting (Throttle)

**Files:**
- Modify: `apps/api/package.json` (dépendance `@nestjs/throttler`)
- Modify: `apps/api/src/app.module.ts` ou `graphql.module.ts` (module racine GraphQL) selon où les imports globaux sont branchés (import global `ThrottlerModule`)
- Modify: `apps/api/src/auth/auth.resolver.ts` et contrôleur OAuth (Task 7)

- [ ] **Step 1 :** Configurer limites raisonnables : par **IP** et, quand c’est faisable sans stockage lourd, par **email normalisé** pour `resendVerificationEmail` / `login` (spec 6.5 : IP et/ou email). À défaut d’un store distribué, documenter le MVP IP-only + issue de suivi pour buckets par email.
- [ ] **Step 2 :** Décorer mutations publiques et routes OAuth GET.

**Vérif :** test manuel ou e2e déclenche 429 après seuil.

- [ ] **Step 3 : Commit**

```bash
git commit -m "feat(api): throttling auth publique et OAuth"
```

**Ordre avec Task 4 :** ne **pas** merger de mutations publiques sans throttle — en pratique enchaîner **Task 6 puis Task 4**, ou **un même commit / PR** qui contient les deux.

---

### Task 7 : Google OAuth (HTTP) + redirect portail

**Files:**
- Create: `apps/api/src/auth/oauth/google-oauth.controller.ts`, `google-oauth.service.ts` (échange code, profil)
- Modify: `apps/api/src/auth/auth.module.ts` (contrôleur, imports)
- Modify: `apps/api/.env.example` : `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `MEMBER_PORTAL_ORIGIN`, `OAUTH_CALLBACK_URL`

**Décision à figer une fois (spec 6.1) :** Redirect `302` vers `https://membre.../oauth/callback#access_token=...` **ou** `?code=` + mutation `completeOAuthLogin` — documenter le choix en en-tête de `google-oauth.controller.ts`.

- [ ] **Step 1 :** Test e2e ou intégration avec mock du token Google (pas d’appel réseau en CI) : callback avec `state` valide crée ou met à jour User, Contact, UserIdentity.
- [ ] **Step 2 :** Implémenter flux : `state` signé ou stocké serveur courte durée ; refus open redirect (whitelist `MEMBER_PORTAL_ORIGIN`).
- [ ] **Step 3 :** Cas fusion : email déjà vérifié ; cas user E/M non vérifié + Google `email_verified` → mise à jour `emailVerifiedAt` (tests unitaires `auth.service` ou service OAuth dédié).

- [ ] **Step 4 : Commit**

```bash
git commit -m "feat(api): OAuth Google et callback sécurisé"
```

---

### Task 8 : Garde « email vérifié » pour opérations contact / JWT

**Files:**
- Create: `apps/api/src/common/guards/email-verified.guard.ts`
- Modify: `apps/api/src/jwt.strategy.ts` — pas obligatoire d’ajouter claim si le garde lit Prisma
- Modify: resolvers « viewer » ou futur `ContactResolver` : combinaison `GqlJwtAuthGuard`, `ClubContextGuard`, `EmailVerifiedGuard`

- [ ] **Step 1 :** Le garde charge `User` par `sub`, vérifie `emailVerifiedAt`.

- [ ] **Step 2 :** Placer sur les queries/mutations du **portail contact** (nouvelles ou existantes une fois définies) ; ne **pas** casser `viewerMe` qui reste derrière `ViewerActiveProfileGuard` pour membres.

- [ ] **Step 3 :** Tests unitaires du garde.

- [ ] **Step 4 : Commit**

```bash
git commit -m "feat(api): garde email vérifié pour contexte contact"
```

---

### Task 9 : Portail membre — inscription, vérif, login sans profil, OAuth callback

**Files:**
- Create: `apps/member-portal/src/pages/RegisterPage.tsx`
- Create: `apps/member-portal/src/pages/VerifyEmailPage.tsx` (lit `token` query)
- Create: `apps/member-portal/src/pages/OAuthCallbackPage.tsx`
- Modify: `apps/member-portal/src/App.tsx`, `LoginPage.tsx`, `lib/storage.ts`, `lib/documents.ts`
- Modify: `apps/member-portal/.env.example` : `VITE_GRAPHQL_HTTP_URL`, `VITE_CLUB_ID` (MVP, aligné API)

- [ ] **Step 1 :** Flux login : si `viewerProfiles.length === 0` mais `contactClubId` présent → `setMemberSession(token, contactClubId)` → redirect `/` (layout contact).
- [ ] **Step 2 :** Page register → mutation `registerContact` → écran « vérifiez votre mail ».
- [ ] **Step 3 :** Lien mail → `/verify-email?token=...` → `verifyEmail` → stockage session comme login.
- [ ] **Step 4 :** `/oauth/callback` parse token (ou échange code) → session.
- [ ] **Step 5 :** Adapter `DashboardPage` ou shell : si pas de profil membre, afficher vue « espace contact » (placeholder minimal conforme spec).

**Vérif :** `npm run build` dans `apps/member-portal`.

- [ ] **Step 6 : Commit**

```bash
git commit -m "feat(member-portal): inscription contact, vérif email, Google callback"
```

---

### Task 10 : Mise à jour spec portail MVP + documentation `.env` + rotation secrets

**Files:**
- Modify: `docs/superpowers/specs/2026-03-31-portail-membre-mvp-design.md` (note : OAuth repris par spec contact)
- Modify: racine `README` ou `apps/api/README` si présent : variables `CLUB_ID`, OAuth, `EMAIL_VERIFICATION_SECRET`, `JWT_SECRET`

- [ ] **Step 1 :** Remplacer / annoter la ligne « OAuth phase L » pour renvoyer à la spec inscription contact.

- [ ] **Step 2 :** Documenter la **procédure de rotation** des secrets OAuth client, `JWT_SECRET`, `EMAIL_VERIFICATION_SECRET` (spec 6.5 / critère 8.1) : qui fait quoi, fenêtre de déploiement, invalidation des jetons existants si besoin.

- [ ] **Step 3 : Commit**

```bash
git commit -m "docs: portail MVP, OAuth contact et rotation des secrets"
```

---

### Task 11 : E2E et non-régression

**Files:**
- Modify: `apps/api/test/app.e2e-spec.ts` ou nouveau fichier test

- [ ] **Step 1 :** E2E : register → verifyEmail (token issu de DB test ou endpoint test-only **non activé en prod**) → graphql `viewerProfiles` vide mais authentifié avec club header.
- [ ] **Step 2 :** E2E : login ancien user seed avec membre inchangé.

**Run :** `cd apps/api && npm run test:e2e`  
**Attendu :** PASS

- [ ] **Step 3 : Commit**

```bash
git commit -m "test(api): e2e auth contact et non-régression membre"
```

---

## Ordre d’exécution recommandé

**1 → 2 → 3 → 6 → 4 → 5 → 7 → 8 → 9 → 10 → 11** (Task **6** rate-limit **avant** Task **4** mutations publiques). Task 7 OAuth peut suivre immédiatement Task 5.

## Hors plan immédiat (v2)

- Fournisseurs **Facebook** et **LinkedIn** : dupliquer la couche OAuth (Task 7) avec nouveaux providers enum.
- Résolution **club par Host** (remplace `CLUB_ID` + `VITE_CLUB_ID`).

---

## Revue du plan

Après rédaction : exécuter une revue plan-vs-spec (agent reviewer) ; itérer si nécessaire (max 3 boucles).

## Exécution

Une fois le plan approuvé :

> **Plan enregistré dans `docs/superpowers/plans/2026-03-31-inscription-contact-oauth-implementation.md`. Deux modes d’exécution :**
>
> **1. Subagent-driven (recommandé)** — un sous-agent par tâche, relecture entre les tâches.  
> **2. Exécution inline** — enchaîner les tâches dans cette session avec `executing-plans` et pauses de relecture.
>
> **Lequel préfères-tu ?**
