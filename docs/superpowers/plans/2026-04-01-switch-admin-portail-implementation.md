# Bascule Admin ↔ portail membre — Implementation Plan

> **Pour exécution agentique :** skill recommandé : `@superpowers:subagent-driven-development` ou `@superpowers:executing-plans`. Tâches en cases `- [ ]`.

**Objectif :** Permettre la navigation réelle entre `apps/admin` et `apps/member-portal` avec le même JWT, bouton Personnel désactivé sans profils viewer, bouton Admin visible côté portail uniquement si le rôle back-office est confirmé par l’API (`ClubMembership`).

**Architecture :** (1) Extraire la logique « rôle back-office club » dans une fonction Prisma partagée, réutilisée par `ClubAdminRoleGuard` et `ViewerService.viewerMe`. (2) Exposer `canAccessClubBackOffice` sur `viewerMe`. (3) Comme les clés `localStorage` diffèrent (`clubflow_admin_*` vs `clubflow_member_*`), synchroniser token + `clubId` au moment du clic avant `location.assign`. (4) URL de l’autre app via variables d’environnement (chemins relatifs mono-origine ou URL absolues en dev deux ports).

**Stack :** NestJS, GraphQL, Prisma, Apollo Client (admin + member-portal), Vite.

**Spécification source :** `docs/superpowers/specs/2026-04-01-switch-vue-admin-portail-design.md`

**Fichiers clés existants :**

| Fichier | Rôle |
|---------|------|
| `apps/api/src/common/guards/club-admin-role.guard.ts` | Garde rôles admin club |
| `apps/api/src/viewer/viewer.service.ts` | `viewerMe` |
| `apps/api/src/viewer/models/viewer-member.model.ts` | Modèle GraphQL membre viewer |
| `apps/api/src/viewer/viewer.resolver.ts` | Query `viewerMe` |
| `apps/admin/src/lib/storage.ts` | `clubflow_admin_token`, `clubflow_admin_club_id` |
| `apps/admin/src/components/AdminLayout.tsx` | Toggle Admin / Personnel (UI existante) |
| `apps/member-portal/src/lib/storage.ts` | `clubflow_member_token`, `clubflow_member_club_id` |
| `apps/member-portal/src/components/MemberLayout.tsx` | Shell portail |
| `apps/member-portal/src/lib/viewer-documents.ts` | `VIEWER_ME` |

---

### Tâche 1 : API — rôle back-office réutilisable

**Fichiers :**
- Créer : `apps/api/src/common/club-back-office-role.ts` (fonction pure async `userHasClubBackOfficeRole(prisma, userId, clubId): Promise<boolean>` avec les mêmes trois rôles que le guard)
- Modifier : `apps/api/src/common/guards/club-admin-role.guard.ts` — déléguer à cette fonction
- Modifier : `apps/api/src/viewer/models/viewer-member.model.ts` — ajouter `@Field(() => Boolean) canAccessClubBackOffice!: boolean;`
- Modifier : `apps/api/src/viewer/viewer.service.ts` — `viewerMe(clubId, memberId, userId)` ; après chargement du membre, `canAccessClubBackOffice: await userHasClubBackOfficeRole(...)`
- Modifier : `apps/api/src/viewer/viewer.resolver.ts` — passer `user.userId` à `viewerMe`

- [ ] **Étape 1 :** Créer `club-back-office-role.ts` et faire refactor du guard sans changer le comportement.
- [ ] **Étape 2 :** Étendre le modèle + service + resolver ; compiler mentalement : `viewerMe` doit toujours retourner les champs existants + le booléen.
- [ ] **Étape 3 :** Tests unitaires ciblés (nouveau fichier `apps/api/src/common/club-back-office-role.spec.ts` ou test du `ViewerService` si un module de test existe ; sinon test minimal du helper avec `PrismaService` mocké ou db de test selon convention du dépôt).

  Commande : `cd apps/api && npm run test -- --testPathPattern=club-back-office` (adapter le pattern au nom de fichier choisi).

  Attendu : succès.

- [ ] **Étape 4 :** Commit

```bash
git add apps/api/src/common/club-back-office-role.ts apps/api/src/common/guards/club-admin-role.guard.ts apps/api/src/viewer/
git commit -m "feat(api): canAccessClubBackOffice sur viewerMe + helper rôle back-office"
```

---

### Tâche 2 : Portail membre — query + UI Admin

**Fichiers :**
- Modifier : `apps/member-portal/src/lib/viewer-documents.ts` — ajouter `canAccessClubBackOffice` sous `viewerMe`
- Modifier : `apps/member-portal/src/lib/viewer-types.ts` — champ optionnel booléen sur `viewerMe`
- Modifier : `apps/member-portal/src/components/MemberLayout.tsx` — regroupement « vue » (style `cf-role-toggle` admin) : **Personnel** actif sur portail ; **Admin** visible seulement si `viewerMe.canAccessClubBackOffice === true` (obtenir via `useQuery(VIEWER_ME)` en `cache-first` ou réutiliser les données du dashboard si factorisation simple ; éviter l’eau si déjà chargé ailleurs)
- Modifier : `apps/member-portal/src/index.css` — styles toggle si réutilisation des classes admin impossible (copier tokens compacts)

- [ ] **Étape 1 :** Étendre GraphQL + types ; vérifier typage `npm run build` dans `apps/member-portal`.

- [ ] **Étape 2 :** Implémenter `goToAdminApp()` : copier `getToken()` + `getClubId()` vers `localStorage` clés `clubflow_admin_token` et `clubflow_admin_club_id` (répliquer les littéraux **exactement** depuis `apps/admin/src/lib/storage.ts` pour éviter la dérive), puis `window.location.assign(urlAdmin)` — URL lue de `import.meta.env.VITE_ADMIN_APP_URL` (voir Tâche 4).

- [ ] **Étape 3 :** Commit

```bash
git add apps/member-portal/
git commit -m "feat(member-portal): toggle Admin + synchro session vers clés admin"
```

---

### Tâche 3 : Admin — profils viewer + navigation Personnel

**Fichiers :**
- Modifier : `apps/admin/src/lib/documents.ts` — ajouter `VIEWER_PROFILES` (même sélection que `apps/member-portal/src/lib/documents.ts` `MemberViewerProfiles`)
- Modifier : `apps/admin/src/lib/types.ts` ou fichier de types query — type pour `viewerProfiles`
- Modifier : `apps/admin/src/components/AdminLayout.tsx` — `useQuery(VIEWER_PROFILES, { skip: !isLoggedIn })` ; `hasMemberProfiles = profiles.length > 0` ; bouton **Personnel** `disabled={!hasMemberProfiles}` + `title` avec message spec ; clic : `pushToMemberPortal()` copiant token + clubId vers clés `clubflow_member_token` / `clubflow_member_club_id` puis `location.assign(urlMembre)`
- Vérifier : le JWT admin doit déjà contenir `activeProfileMemberId` si des profils existent (comportement `AuthService.login`) ; sinon documenter qu’une reconnexion peut être nécessaire si les profils sont ajoutés après coup

- [ ] **Étape 1 :** Ajouter document + query ; pas d’auth club requis pour `viewerProfiles` (guard JWT seul).

- [ ] **Étape 2 :** Brancher le toggle : état visuel `roleTab` — lorsque l’utilisateur est sur l’admin, `Admin` reste sélectionné ; **Personnel** déclenche la navigation (ne pas seulement changer l’état local sans naviguer).

- [ ] **Étape 3 :** `npm run build` dans `apps/admin`.

- [ ] **Étape 4 :** Commit

```bash
git add apps/admin/
git commit -m "feat(admin): switch vers portail membre + désactivation sans profils"
```

---

### Tâche 4 : Variables d’environnement + documentation

**Fichiers :**
- Modifier : `apps/admin/.env.example` (si présent) ou `apps/admin/README.md`
- Modifier : `apps/member-portal/README.md`
- Éventuellement : `docs/superpowers/specs/2026-04-01-switch-vue-admin-portail-design.md` — pas obligatoire si README suffit

Définir et documenter :

- `VITE_MEMBER_APP_URL` — utilisée par **admin** (ex. `/membre` en prod mono-origine, ou `http://localhost:5174/` en dev)
- `VITE_ADMIN_APP_URL` — utilisée par **member-portal** (ex. `/admin` ou `http://localhost:5173/`)

Comportement recommandé dans le code : si variable absente, fallback documenté (ex. `http://localhost:5174` / `http://localhost:5173`) **uniquement en `import.meta.env.DEV`** pour limiter les erreurs en prod.

- [ ] **Étape 1 :** Ajouter les `import.meta.env` dans les fichiers `vite-env.d.ts` de chaque app si besoin.

- [ ] **Étape 2 :** Mettre à jour README avec section « Bascule Admin / Membre » + rappel **même origine** pour partage effectif du storage sans copie cross-origin impossible.

- [ ] **Étape 3 :** Commit `docs:` ou `chore:`

---

### Tâche 5 : Vérification globale

- [ ] **Étape 1 :** `cd apps/api && npm run test && npm run test:e2e` — tout vert.

- [ ] **Étape 2 :** `cd apps/admin && npm run build` ; `cd apps/member-portal && npm run build`.

- [ ] **Étape 3 :** Test manuel scénario seed : compte admin avec membre lié + compte membre sans rôle admin (pas de bouton Admin).

---

### Tâche 6 (optionnelle) : E2E navigateur

- Ajouter scénario minimal dans `apps/api/test/app.e2e-spec.ts` ou autre harness **si** l’environnement de test peut servir les deux apps sous une origine ; sinon noter dans README comme hors CI.

---

## Notes d’alignement spec

- Aucun token dans l’URL.
- Source de vérité des droits : Prisma `ClubMembership` + rôles alignés sur `ClubAdminRoleGuard`.
- La **copie** des clés `localStorage` est le mécanisme MVP pour deux builds sur la **même origine** ; sans proxy mono-origine en local, la bascule nécessite les URL absolues dev + copie (le token arrive bien dans l’autre app après navigation).

---

## Fin de plan — reprise d’exécution

**Plan enregistré sous :** `docs/superpowers/plans/2026-04-01-switch-admin-portail-implementation.md`

**Deux modes d’exécution possibles :**

1. **Subagent-Driven (recommandé)** — un sous-agent par tâche, revue entre les tâches.
2. **Exécution inline** — enchaîner les tâches dans cette session avec `@superpowers:executing-plans` et points de contrôle.

Indiquez l’option souhaitée pour lancer l’implémentation.
