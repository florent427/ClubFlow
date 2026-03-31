# Portail membre (MVP) — Plan d’implémentation

> **Pour agents :** sous-compétence recommandée : `@superpowers/subagent-driven-development` ou `@superpowers/executing-plans` pour exécuter ce plan **tâche par tâche**. Les étapes utilisent `- [ ]` pour le suivi.

**Goal :** Livrer `apps/member-portal` (login, sélection de profil, dashboard style Stitch) branché sur l’API avec les queries GraphQL « viewer » (`viewerMe`, `viewerUpcomingCourseSlots`, `viewerFamilyBillingSummary`) et le garde `ViewerActiveProfileGuard`.

**Architecture :** Nouveau module Nest `ViewerModule` (resolver + service dédiés) pour ne pas diluer les resolvers admin ; garde composée `GqlJwtAuthGuard` + `ClubContextGuard` + `ViewerActiveProfileGuard` + `ClubModuleEnabledGuard` là où la spec impose un module (`PLANNING`, `PAYMENT`). La logique de filtre des créneaux vit dans `PlanningService` (méthode dédiée) pour rester cohérente avec le domaine planning. Le front reprend les patterns `apps/admin` (Vite, React 19, Apollo Client, `react-router-dom`, en-têtes `Authorization` + `x-club-id`).

**Tech Stack :** Node/NestJS, GraphQL, Prisma, Jest + supertest (e2e), Vite + React + TypeScript + Apollo Client.

**Références :**  
- Spec : `docs/superpowers/specs/2026-03-31-portail-membre-mvp-design.md`  
- Design UI : `design stitch/DESIGN.md`, `design stitch/code.html`  
- E2e existant : `apps/api/test/app.e2e-spec.ts`

---

## Carte des fichiers (création / modification)

| Fichier ou dossier | Rôle |
|--------------------|------|
| `apps/api/src/common/guards/viewer-active-profile.guard.ts` | Vérifie JWT + `activeProfileMemberId` + membre actif + `clubId` aligné + `assertViewerHasProfile`. |
| `apps/api/src/common/guards/viewer-active-profile.guard.spec.ts` | Tests unitaires du garde (mocks Prisma + FamiliesService). |
| `apps/api/src/viewer/viewer.module.ts` | Module Nest : imports `PrismaModule`, `FamiliesModule`, `PlanningModule`, providers guards partagés si besoin. |
| `apps/api/src/viewer/viewer.service.ts` | `viewerMe`, agrégation facturation foyer, appel planning pour créneaux. |
| `apps/api/src/viewer/viewer.resolver.ts` | Queries GraphQL exposées au portail. |
| `apps/api/src/viewer/models/*.ts` | Types GraphQL : membre viewer, créneau enrichi (lieu, coach), facture synthèse, résumé famille. |
| `apps/api/src/planning/planning.service.ts` | Nouvelle méthode : créneaux à venir filtrés membre / groupe dynamique (spec §5.2). |
| `apps/api/src/graphql/graphql.module.ts` | `imports: [..., ViewerModule]`. |
| `apps/api/test/app.e2e-spec.ts` (ou `viewer-portal.e2e-spec.ts`) | Scénarios membre : login, `selectActiveViewerProfile`, `viewerMe`, optionnel planning/paiement. |
| `apps/member-portal/*` | Nouvelle app Vite (package.json, vite.config, index.html, src/main.tsx, App, routes, layout, pages, `lib/apollo.ts`, `lib/storage.ts`). |

---

### Task 1 : Garde `ViewerActiveProfileGuard`

**Files:**
- Create: `apps/api/src/common/guards/viewer-active-profile.guard.ts`
- Create: `apps/api/src/common/guards/viewer-active-profile.guard.spec.ts`
- Modify: `apps/api/src/families/families.module.ts` — exporter `FamiliesService` si pas déjà exporté (pour injection dans le garde).

- [ ] **Step 1 : Vérifier l’export `FamiliesService`**

Lire `apps/api/src/families/families.module.ts`. Si `FamiliesService` n’est pas dans `exports`, ajouter `exports: [FamiliesService]` (ou équivalent existant).

- [ ] **Step 2 : Implémenter le garde**

Comportement attendu :

1. Lire `req.user` typé `RequestUser` (comme `GqlJwtAuthGuard`).
2. Si `!user?.userId` → `UnauthorizedException`.
3. Si `!user.activeProfileMemberId` → `BadRequestException` avec message du type « Sélection de profil requise ».
4. Charger le membre via `PrismaService.member.findFirst({ where: { id, clubId: req.club.id } })`.
5. Si absent ou `status !== ACTIVE` → `ForbiddenException`.
6. Appeler `familiesService.assertViewerHasProfile(user.userId, activeProfileMemberId)`.

Utiliser `GqlExecutionContext` + `getContext().req` comme dans `ClubContextGuard`.

- [ ] **Step 3 : Tests unitaires**

Dans `viewer-active-profile.guard.spec.ts`, couvrir au minimum :

- club manquant / membre autre club → interdit ;
- membre inactif → interdit ;
- `assertViewerHasProfile` lève → propagé ;
- cas nominal → `true`.

Astuce : mocker `PrismaService` et `FamiliesService` avec `jest.fn()`.

- [ ] **Step 4 : Commande**

```bash
cd c:/Users/flore/ClubFlow/apps/api
npm run test -- --testPathPattern=viewer-active-profile.guard.spec
```

Attendu : tous les tests du fichier passent.

- [ ] **Step 5 : Commit**

```bash
git add apps/api/src/common/guards/viewer-active-profile.guard.ts apps/api/src/common/guards/viewer-active-profile.guard.spec.ts apps/api/src/families/families.module.ts
git commit -m "feat(api): garde viewer profil actif pour portail membre"
```

---

### Task 2 : `PlanningService.listUpcomingCourseSlotsForActiveMember`

**Files:**
- Modify: `apps/api/src/planning/planning.service.ts`
- Create: `apps/api/src/planning/planning.service.viewer.spec.ts` (ou tests ajoutés dans spec existant si présent)

- [ ] **Step 1 : Rédiger un test unitaire ciblant la règle MVP**

Cas : club avec 3 créneaux futurs — (A) sans `dynamicGroupId` ; (B) avec groupe G1, membre assigné à G1 ; (C) avec groupe G2, membre non assigné.  
Attendu pour `memberId` : retourner A et B, pas C.

Utiliser Prisma avec schéma réel ou mocks selon la convention du fichier de test choisi.

- [ ] **Step 2 : Implémenter la méthode**

Signature indicative :

```ts
async listUpcomingCourseSlotsForViewerMember(
  clubId: string,
  memberId: string,
  now?: Date,
): Promise<Array<CourseSlot & { venue: Venue; coachMember: Member }>>
```

Logique :

- `startsAt >= (now ?? new Date())` ;
- `(dynamicGroupId === null) OR (dynamicGroupId IN (SELECT dynamicGroupId FROM MemberDynamicGroup WHERE memberId = ...))` — exprimer avec Prisma `OR` / `some`.

Trier par `startsAt` asc.

- [ ] **Step 3 : `npm run test`** (fichier ou pattern planning viewer)

Attendu : PASS.

- [ ] **Step 4 : Commit**

```bash
git add apps/api/src/planning/planning.service.ts apps/api/src/planning/planning.service.viewer.spec.ts
git commit -m "feat(planning): créneaux à venir filtrés pour membre portail"
```

---

### Task 3 : Types GraphQL « viewer » et `ViewerService` / `ViewerResolver`

**Files:**
- Create: `apps/api/src/viewer/models/viewer-member.model.ts` — champs : id, firstName, lastName, photoUrl, civility (optionnel), medicalCertExpiresAt, gradeLevelId, gradeLevelLabel (nullable)
- Create: `apps/api/src/viewer/models/viewer-course-slot.model.ts` — id, title, startsAt, endsAt, venueName, coachFirstName, coachLastName (éviter d’exposer toute la hiérarchie admin)
- Create: `apps/api/src/viewer/models/viewer-invoice-summary.model.ts` — id, label, status, dueAt, balanceCents, totalPaidCents, amountCents (ou seulement balance/total selon besoin UI)
- Create: `apps/api/src/viewer/models/viewer-family-billing.model.ts` — invoices, familyMembers (nom, prénom, photoUrl), isPayerView (bool), familyLabel nullable
- Create: `apps/api/src/viewer/viewer.service.ts`
- Create: `apps/api/src/viewer/viewer.resolver.ts`
- Create: `apps/api/src/viewer/viewer.module.ts`

Guards sur le resolver (décorateur de classe) :

```ts
@UseGuards(
  GqlJwtAuthGuard,
  ClubContextGuard,
  ViewerActiveProfileGuard,
  ClubModuleEnabledGuard,
)
```

- `viewerMe` : **pas** de `@RequireClubModule` (profil membre toujours pertinent si MEMBERS — optionnel : exiger seulement JWT + club ; si le club n’a pas de membres actifs, le membre existe quand même).

  - Implémentation : charger membre `id === req.user.activeProfileMemberId` + `include: { gradeLevel: true }`, mapper vers `ViewerMemberGraph`.

- `viewerUpcomingCourseSlots` : `@RequireClubModule(ModuleCode.PLANNING)` — déléguer à `planningService.listUpcomingCourseSlotsForViewerMember`.

- `viewerFamilyBillingSummary` : `@RequireClubModule(ModuleCode.PAYMENT)` :

  1. Déterminer si le membre actif est payeur : `FamilyMember` avec `linkRole === PAYER` pour ce `memberId` (ou membre « standalone » sans famille → `isPayerView: false`, listes vides).
  2. Si non payeur : retourner objet avec listes vides et `isPayerView: false` (pas d’erreur).
  3. Si payeur : résoudre `familyId`, charger factures du club où `invoice.familyId === familyId`, statuts `OPEN` + derniers `PAID` (limite 5), utiliser `invoicePaymentTotals` depuis `apps/api/src/payments/invoice-totals.ts` avec somme des `Payment` par facture.
  4. Membres rattachés : autres `FamilyMember` du même foyer avec `include: { member: true }`.

- [ ] **Step 1 : Brancher `ViewerModule` dans** `apps/api/src/graphql/graphql.module.ts` (`imports: [..., ViewerModule]`).

- [ ] **Step 2 : Générer / vérifier le schéma** — lancer `npm run build` ou la commande habituelle qui régénère `src/schema.gql` et s’assurer qu’il n’y a pas de conflit de noms.

- [ ] **Step 3 : Commit**

```bash
git add apps/api/src/viewer apps/api/src/graphql/graphql.module.ts apps/api/src/schema.gql
git commit -m "feat(api): queries GraphQL viewer pour portail membre"
```

---

### Task 4 : E2E API portail membre

**Files:**
- Modify: `apps/api/test/app.e2e-spec.ts` **ou** Create: `apps/api/test/viewer-portal.e2e-spec.ts`

- [ ] **Step 1 : Données de test**

Dans `beforeAll` / setup du fichier choisi (ou bloc `describe` dédié) :

- Créer un utilisateur **`member-user@clubflow.test`** avec mot de passe connu.
- Créer **deux** `Member` du même club (ex. parent payeur + enfant) partageant une `Family` (rôle PAYER sur le parent), les deux avec `userId` du même user si la spec famille le permet — **sinon** : un seul user relié au payeur et enfant sans compte utilisateur ; pour e2e minimal, tester avec **un seul membre** lié au user + `selectActiveViewerProfile` + `viewerMe`.

  - Vérifier dans le schéma Prisma : un user peut-il être lié à plusieurs membres dans le même club ? (`@@unique([clubId, userId])` sur `Member` → **un seul Member par (club, user)**). Donc pour tester payeur **et** enfant, soit deux users, soit adapter le test : **user A** = payeur avec famille contenant **enfant sans userId** ; `viewerFamilyBillingSummary` pour user A.

- Activer modules `PLANNING` et `PAYMENT` sur le club de test si on couvre ces queries.

- Créer un `CourseSlot` futur sans groupe + un avec groupe assigné au membre pour valider le filtre.

- [ ] **Step 2 : Requêtes GraphQL**

1. `login` → token.
2. Headers : `Authorization`, `X-Club-Id`.
3. `selectActiveViewerProfile(memberId)` si nécessaire.
4. `viewerMe { firstName gradeLevelLabel medicalCertExpiresAt }`
5. `viewerUpcomingCourseSlots { title startsAt venueName }`
6. `viewerFamilyBillingSummary { isPayerView invoices { balanceCents } }`

- [ ] **Step 3 : Commande**

```bash
cd c:/Users/flore/ClubFlow/apps/api
npm run test:e2e
```

Attendu : suite e2e entière au vert.

- [ ] **Step 4 : Commit**

```bash
git add apps/api/test/
git commit -m "test(api): e2e queries viewer portail membre"
```

---

### Task 5 : Scaffold `apps/member-portal`

- [ ] **Step 1 : Créer l’app**

```bash
cd c:/Users/flore/ClubFlow/apps
npm create vite@latest member-portal -- --template react-ts
cd member-portal
npm install @apollo/client graphql react-router-dom
npm install
```

(Si le projet impose des versions alignées sur `apps/admin`, harmoniser `package.json` : React 19, Apollo 4, Vite 8, etc.)

- [ ] **Step 2 : Fichiers de base**

- `src/lib/storage.ts` — `getToken`, `setToken`, `clearAuth`, `getClubId`, `setClubId` (clés de stockage **distinctes** de l’admin pour éviter les collisions si même origin — ex. préfixe `cf_member_`).
- `src/lib/apollo.ts` — copie adaptée de `apps/admin/src/lib/apollo.ts` ; `VITE_GRAPHQL_HTTP` ; mêmes en-têtes.
- `src/vite-env.d.ts` — typer `ImportMetaEnv`.

- [ ] **Step 3 : Commit**

```bash
git add apps/member-portal
git commit -m "chore(member-portal): scaffold Vite React et Apollo"
```

---

### Task 6 : Auth et sélection de profil (front)

**Files:**
- Create: `apps/member-portal/src/pages/LoginPage.tsx`
- Create: `apps/member-portal/src/pages/SelectProfilePage.tsx`
- Modify: `apps/member-portal/src/App.tsx`

- [ ] **Step 1 : Login**

Mutation `login` (reprendre les champs de `apps/admin/src/pages/LoginPage.tsx`). Au succès : stocker le token ; pour chaque entrée de `viewerProfiles`, noter `clubId` ; si **un seul** profil, appeler `selectActiveViewerProfile` puis `setClubId(profile.clubId)` et rediriger vers `/`.

- [ ] **Step 2 : Choix de profil**

Si plusieurs profils : afficher grille de cartes (avatars / initiales) style Stitch ; au clic, mutation `selectActiveViewerProfile`, mettre `clubId`, rediriger `/`.

- [ ] **Step 3 : Garde de route**

Composant `Protected` : si pas de token → `/login`. Si token mais pas de `clubId` → `/profiles`.

- [ ] **Step 4 : Commit**

```bash
git add apps/member-portal/src
git commit -m "feat(member-portal): login et sélection de profil"
```

---

### Task 7 : Layout et dashboard (Stitch)

**Files:**
- Create: `apps/member-portal/src/components/MemberLayout.tsx` — sidebar desktop + top bar + bottom nav mobile
- Create: `apps/member-portal/src/pages/DashboardPage.tsx`
- Create: `apps/member-portal/src/pages/ProgressionPage.tsx`
- Create: `apps/member-portal/src/pages/PlanningPage.tsx`
- Create: `apps/member-portal/src/pages/FamilyPage.tsx`
- Create: `apps/member-portal/src/pages/SettingsPage.tsx`
- Create: `apps/member-portal/src/index.css` — tokens CSS ou Tailwind si ajouté (la maquette Stitch utilise Tailwind ; **option** : ajouter Tailwind au portail pour coller à `code.html`, ou reproduire en CSS modules — **choisir une option et la tenir** ; recommandation : Tailwind + copie des couleurs du `tailwind.config` inline de `design stitch/code.html`).

- [ ] **Step 1 : Query `viewerMe` + `club`** sur le dashboard ; hero « Content de te revoir, {prénom} » ; badges grade + certificat médical (logique simple : `medicalCertExpiresAt >= aujourd’hui` → valide).

- [ ] **Step 2 : Section « Mon programme »** — état vide « Bientôt disponible » (spec §3).

- [ ] **Step 3 : CTA « Réserver un cours »** — `disabled` + tooltip ou libellé « À venir ».

- [ ] **Step 4 : Colonne planning** — extraits depuis `viewerUpcomingCourseSlots` (limite 3 sur le dashboard, page complète sur `/planning`).

- [ ] **Step 5 : Famille & paiements** — afficher seulement si `viewerFamilyBillingSummary.isPayerView` ; sinon message « Réservé au payeur » sur la page famille.

- [ ] **Step 6 : Commit**

```bash
git add apps/member-portal
git commit -m "feat(member-portal): layout Stitch et pages MVP"
```

---

### Task 8 : CORS et documentation courte

- [ ] **Step 1 : Vérifier** `main.ts` (ou bootstrap) de l’API — si CORS restreint, ajouter l’origine du portail dev (ex. `http://localhost:5174`) ou pattern env `MEMBER_PORTAL_ORIGIN`.

- [ ] **Step 2 : Fichier** `apps/member-portal/README.md` (2–3 phrases : variables d’env, `npm run dev`, compte de test).

- [ ] **Step 3 : Commit**

```bash
git add apps/api/src/main.ts apps/member-portal/README.md
git commit -m "chore: CORS portail membre et README"
```

---

### Task 9 : Roadmap

- [ ] **Step 1 : Mettre à jour** `docs/superpowers/roadmap/2026-03-31-clubflow-avancement-realise.md` (Phase I — preuve : chemins `apps/member-portal`, queries `viewer*`) et raccourcir `...-reste.md` si critères remplis.

- [ ] **Step 2 : Commit**

```bash
git add docs/superpowers/roadmap/
git commit -m "docs(roadmap): portail membre MVP"
```

---

## Fin de plan — relecture

Après rédaction : faire relire ce plan (pair humain ou revue courte) avant exécution massive ; s’assurer que les noms GraphQL finaux matchent `schema.gql` généré.

---

## Handoff exécution

**Plan enregistré dans** `docs/superpowers/plans/2026-03-31-portail-membre-mvp-implementation.md`.

**Deux modes d’exécution possibles :**

1. **Subagent-Driven (recommandé)** — une sous-tâche fraîche par *Task*, revue entre les tâches.  
2. **Inline** — enchaîner les tâches dans la même session avec points de contrôle après Tasks 4, 7 et 9.

Dis-moi lequel tu préfères pour la suite.
