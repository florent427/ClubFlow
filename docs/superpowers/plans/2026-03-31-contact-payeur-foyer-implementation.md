# Contact payeur foyer — plan d’implémentation

> **Pour agents :** sous-compétence recommandée : `superpowers:subagent-driven-development` ou `superpowers:executing-plans`. Cocher les étapes (`- [ ]`) au fil de l’eau.

**Spec de référence :** `docs/superpowers/specs/2026-03-31-contact-payeur-foyer-design.md`

**Goal :** Permettre qu’un `Contact` (sans `Member` dans le club) soit désigné **payeur** d’un foyer (`FamilyMember` / `PAYER`), avec portail équivalent payeur sauf **Ma progression** / **Planning**, et bascule automatique du lien payeur vers le `Member` dès qu’un adhérent existe pour le même `User` (règle B).

**Architecture :** Étendre `FamilyMember` pour un payeur référencé par `memberId` **ou** `contactId` (les liens `MEMBER` restent sur `memberId` uniquement). Étendre le JWT / `RequestUser` avec un profil actif **contact** (`activeProfileContactId`) mutually exclusive avec `activeProfileMemberId` pour les requêtes viewer. Enrichir `listViewerProfiles` pour exposer des profils « contact payeur ». Ajouter `paidByContactId` sur `Payment` pour la traçabilité. Admin : sélection payeur contact ou membre ; portail : navigation conditionnelle selon présence d’un `Member` pour le club courant.

**Tech stack :** NestJS, Prisma/Postgres, GraphQL (code-first), Apollo admin, Vite portail membre, Jest (unit + e2e `apps/api/test/app.e2e-spec.ts`).

---

## Carte des fichiers (prévue)

| Zone | Fichiers |
|------|-----------|
| Schéma DB | `apps/api/prisma/schema.prisma`, nouvelle migration SQL |
| Familles | `apps/api/src/families/families.service.ts`, `families.resolver.ts`, `family-payer-rules.ts`, `families-needs-payer.spec.ts`, `dto/*.input.ts`, `models/family-graph.model.ts` |
| Membres (migration payeur) | `apps/api/src/members/members.service.ts` (ou équivalent création / update `userId`) |
| Auth / JWT | `apps/api/src/auth/jwt.strategy.ts`, `auth.service.ts`, `auth.resolver.ts` (si `selectActiveProfile`), modèles `login-payload.model.ts` |
| Types requête | `apps/api/src/common/types/request-user.ts` |
| Guard viewer | `apps/api/src/common/guards/viewer-active-profile.guard.ts`, spec associée |
| Viewer | `apps/api/src/viewer/viewer.service.ts`, `viewer.resolver.ts`, modèles `viewer-member.model.ts`, billing |
| Paiements | `apps/api/src/payments/payments.service.ts`, `payments.resolver.ts`, `models/payment.model.ts`, `dto/record-manual-payment.input.ts`, specs |
| Enums GraphQL | `apps/api/src/graphql/register-enums.ts` si nouveau type |
| Admin | `apps/admin/src/pages/members/FamilyDetailDrawer.tsx`, `NewFamilyPage.tsx`, `FamiliesPage.tsx`, documents GraphQL/types |
| Portail | `apps/member-portal/src/components/MemberLayout.tsx`, `App.tsx`, `SelectProfilePage.tsx`, `DashboardPage.tsx`, queries GraphQL |
| E2E | `apps/api/test/app.e2e-spec.ts` |

---

### Task 1 : Migration Prisma — `FamilyMember` + `Payment`

**Fichiers :**

- Modify: `apps/api/prisma/schema.prisma`
- Create: `apps/api/prisma/migrations/<timestamp>_family_member_contact_payer/migration.sql` (nom exact selon convention du dépôt)

- [ ] **Step 1 : Schéma**

  - Sur `FamilyMember` : `memberId` → optionnel ; ajouter `contactId` optionnel + relation `Contact` + `@@index`.
  - Invariant métier (documenté en commentaire Prisma + appli) : si `linkRole === MEMBER` → `memberId` requis, `contactId` null ; si `linkRole === PAYER` → exactement un de `memberId`, `contactId`.
  - Remplacer `@@unique([familyId, memberId])` par des contraintes compatibles avec `memberId` nullable (ex. index unique partiel en SQL brut dans la migration pour `(familyId, memberId)` WHERE `memberId IS NOT NULL` et idem pour `contactId`, **ou** unique composite Prisma si supporté sans doublons NULL — **vérifier** le comportement Postgres/Prisma ; éviter plusieurs lignes `PAYER` avec les deux FK nulles.
  - Modèle `Contact` : relation inverse `familyMembers` côté payeur.
  - `Payment` : `paidByContactId` optionnel, FK `Contact`, `@@index` ; règle : ne pas renseigner les deux `paidByMemberId` et `paidByContactId` (check appli + idéalement CHECK SQL).

- [ ] **Step 2 : Générer client**

  Run : `cd apps/api ; npx prisma generate`  
  Expected : succès.

- [ ] **Step 3 : Commit**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations/
git commit -m "feat(db): FamilyMember payeur Contact + paidByContactId"
```

---

### Task 2 : Règles « besoin payeur » et graph famille (unit tests d’abord)

**Fichiers :**

- Modify: `apps/api/src/families/family-payer-rules.ts` (ou agrégats dans `families.service.ts` si la logique reste centralisée)
- Modify: `apps/api/src/families/families-needs-payer.spec.ts` (ou fichier créé à côté)
- Modify: `apps/api/src/families/families.service.ts` — `computeFamilyNeedsPayer` / `toFamilyGraph`

- [ ] **Step 1 : Tests unitaires** — cas : foyer avec 1 enfant `MEMBER` + 1 `PAYER` sur `contactId` → `needsPayer === false` ; foyer avec 2 `MEMBER` sans `PAYER` (ni membre ni contact) → `needsPayer === true` ; un seul lien `MEMBER` (membre seul) → pas de besoin payeur explicite (aligné sur la règle actuelle).

- [ ] **Step 2 : Run**

  Run : `cd apps/api ; npx jest families-needs-payer --no-cache` (ajuster le chemin du fichier spec)  
  Expected : FAIL tant que l’implémentation n’accepte pas les nouveaux liens.

- [ ] **Step 3 : Implémenter** `computeFamilyNeedsPoyer` pour traiter tout `FamilyMember` avec `linkRole === PAYER` (que `memberId` ou `contactId`).  
  **Step 4 :** `toFamilyGraph` / `FamilyMemberLinkGraph` : exposer `memberId` et `contactId` (nullable) côté GraphQL (voir Task 4).

- [ ] **Step 5 : Commit**

```bash
git commit -m "feat(families): needsPayer et graph avec payeur Contact"
```

---

### Task 3 : Service familles — création foyer, set payeur, validations

**Fichiers :**

- Modify: `apps/api/src/families/dto/create-club-family.input.ts` — ajouter `payerContactId` optionnel **xor** `payerMemberId` existant (validation class-validator)
- Modify: `apps/api/src/families/families.service.ts` — `createClubFamily`, `setClubFamilyPayer`, transferts, `ensureSoleFamilyMemberIsPayer` (ignorer les lignes uniquement `contactId` pour le comptage « membre seul »)
- Modify: `apps/api/src/families/families.resolver.ts`

- [ ] **Step 1 : Tests ciblés** (unit ou e2e léger) : impossible de définir payeur `Contact` si un `Member` existe déjà pour ce `userId` dans le club (**refus explicite**, message clair — décision spec par défaut).

- [ ] **Step 2 :** `setClubFamilyPayer` : soit renommer en mutation dédiée `setClubFamilyPayerMember` + nouvelle `setClubFamilyPayerContact`, soit un input union ; **une seule** mutation claire pour l’admin.

- [ ] **Step 3 :** Lors d’un `PAYER` `contactId`, dépromouvoir l’ancien payeur `memberId`/`contactId` comme aujourd’hui (`updateMany` sur `PAYER` → `MEMBER` **uniquement pour les lignes avec `memberId`**, attention aux lignes `contactId`).

- [ ] **Step 4 : Commit**

```bash
git commit -m "feat(families): création foyer et set payeur Contact"
```

---

### Task 4 : Migration automatique payeur Contact → Member (règle B)

**Fichiers :**

- Modify: `apps/api/src/members/members.service.ts` (hooks après création/rattachement `Member.userId`)
- éventuellement : `apps/api/src/families/families.service.ts` — méthode `migrateFamilyPayerFromContactToMember(contactId, memberId, familyId)`

- [ ] **Step 1 : Test** : étant donné un `FamilyMember` `PAYER` avec `contactId` lié à `userId` U, création d’un `Member` pour (club, U) remplace la ligne : même `familyId`, `linkRole` `PAYER`, `memberId` = nouveau, `contactId` null.

- [ ] **Step 2 : Implémenter** dans une transaction ; rejouer les synchros existantes (`syncContactUserPayerMemberLinks*`) **ou** les désactiver pour les foyers déjà payeur-contact — **éviter double logique contradictoire** (revoir `applyPayerMemberLinksForContact`).

- [ ] **Step 3 : Commit**

```bash
git commit -m "feat(members): migration payeur Contact vers Member"
```

---

### Task 5 : GraphQL admin — types famille / liens

**Fichiers :**

- Modify: `apps/api/src/families/models/family-graph.model.ts` — `FamilyMemberLinkGraph` : `memberId` nullable ; `contactId` nullable ; description GraphQL
- Modify: resolvers + inputs comme ci-dessus

- [ ] Vérifier que le schéma généré est cohérent ; mettre à jour **toutes** les queries admin qui supposent `memberId` non null sur chaque lien (rechercher `links { memberId`).

- [ ] **Commit**

```bash
git commit -m "feat(graphql): liens foyer memberId/contactId nullable"
```

---

### Task 6 : Auth — profils contact + JWT

**Fichiers :**

- Modify: `apps/api/src/families/models/viewer-profile.model.ts` — pour un profil contact : `contactId` renseigné, `memberId` null (ou les deux champs avec invariant documenté)
- Modify: `apps/api/src/families/families.service.ts` — `listViewerProfiles` : inclure les `Contact` du `userId` qui ont un `FamilyMember` `PAYER` avec `contactId` (legacy + household : reprendre la même logique de filtrage confidentialité que pour les membres si applicable — **ne pas exposer** l’autre parent si la spec confidentialité s’applique ; s’appuyer sur `viewer-profile-rules`).
- Modify: `apps/api/src/auth/jwt.strategy.ts` — `JwtPayload` + `validate` : ajouter `activeProfileContactId?: string`
- Modify: `apps/api/src/common/types/request-user.ts`
- Modify: `apps/api/src/auth/auth.service.ts` — `buildLoginPayload`, `selectActiveProfile` → ajouter `selectActiveContactProfile(contactId)` ou paramètre union ; JWT avec **au plus un** des deux actifs.
- Modify: `apps/api/src/auth/auth.resolver.ts` / mutation existante (chercher `selectActiveProfile`)

- [ ] **Tests** `auth.service.spec.ts` : login avec uniquement profils contact retourne token utilisable (après Task 7 guard).

- [ ] **Commit**

```bash
git commit -m "feat(auth): JWT profil contact payeur"
```

---

### Task 7 : Guard + Viewer service / resolver

**Fichiers :**

- Modify: `apps/api/src/common/guards/viewer-active-profile.guard.ts` : si `activeProfileMemberId` présent → comportement actuel ; sinon si `activeProfileContactId` → vérifier `Contact` actif pour `clubId` et `assertViewerHasContactProfile` (nouvelle méthode dans `FamiliesService`).

- Modify: `apps/api/src/viewer/viewer.resolver.ts` : passer les deux ids au service ; résoudre `viewerMe` :
  - branche **Member** : comportement actuel ;
  - branche **Contact** : retourner un `ViewerMemberGraph` étendu **ou** nouveau type `ViewerContactProfileGraph` — **choisir l’option la moins cassante pour le portail** (champs optionnels + `isContactOnly: true` recommandé pour éviter un second type complet).

- Modify: `apps/api/src/viewer/viewer.service.ts` : `viewerFamilyBillingSummary`, `findFamilyByPrincipalPayerEmail` (prendre en charge payeur dont l’identité est le `Contact` / `User.email`), etc.

- [ ] Masquer ou no-op les queries `@RequireClubModule(ModuleCode.PLANNING)` côté client pour contact-only ; le guard module peut encore s’appliquer — décider si le serveur renvoie erreur ou liste vide (préférable : **403/empty** cohérent sans MODULE pour contact).

- [ ] **Tests** guard spec + e2e minimal viewer billing avec payeur contact.

- [ ] **Commit**

```bash
git commit -m "feat(viewer): billing et viewerMe pour profil Contact"
```

---

### Task 8 : Paiements — `paidByContactId`

**Fichiers :**

- Modify: `apps/api/src/payments/payments.service.ts`, `payments-record-manual.spec.ts`, DTOs, modèle GraphQL `Payment`

- [ ] **Step 1 :** Dupliquer/adapter `assertPaidByMemberAllowedForInvoice` pour un contact payeur du foyer porteur (même règles d’appartenance au foyer / household).

- [ ] **Step 2 :** Enregistrement manuel et webhooks Stripe (si métadonnées) : documenter ce qui reste `paidByMemberId` uniquement en V1 si hors scope.

- [ ] **Commit**

```bash
git commit -m "feat(payments): paidByContactId pour paiements manuels"
```

---

### Task 9 : Admin UI

**Fichiers :**

- Modify: `apps/admin/src/pages/members/FamilyDetailDrawer.tsx`, `NewFamilyPage.tsx`, `FamiliesPage.tsx`, fragments GraphQL associés

- [ ] Sélecture payeur : liste **membres** du foyer + liste **contacts** du club (ou recherche) ; libellé « Payeur : … » selon source.

- [ ] Affichage listes foyers : colonne payeur si `contactId` (nom depuis `Contact`).

- [ ] **Commit**

```bash
git commit -m "feat(admin): payeur foyer Contact"
```

---

### Task 10 : Portail membre — navigation

**Fichiers :**

- Modify: `apps/member-portal/src/components/MemberLayout.tsx`, `SelectProfilePage.tsx`, `App.tsx`
- Modify: requêtes `viewerMe` pour lire `isContactOnly` (ou équivalent)

- [ ] Si profil actif est contact-only (ou `viewerMe.memberId` null + flag) : **ne pas afficher** les entrées **Ma progression** et **Planning** ; rediriger `/progression` et `/planning` vers `/` ou dashboard si accès direct.

- [ ] **Commit**

```bash
git commit -m "feat(portal): masquer progression/planning pour contact payeur"
```

---

### Task 11 : E2E et régression

**Fichiers :**

- Modify: `apps/api/test/app.e2e-spec.ts`

- [ ] Scénario : foyer avec enfant `MEMBER` + payeur `Contact` ; connexion portail (profil contact) ; `viewerFamilyBillingSummary` cohérent ; pas de planning.

- [ ] Scénario : création `Member` pour le même `User` → profil membre ; lien payeur migré ; navigation complète.

- [ ] Run : `cd apps/api ; npm run test:e2e` (ou commande du `package.json`)  
  Expected : tous verts.

- [ ] **Commit**

```bash
git commit -m "test(e2e): payeur Contact foyer et migration Member"
```

---

## Ordre recommandé

Tasks **1 → 2 → 3 → 5** (données + API admin de base), puis **6 → 7** (portail bloquant), **4** (migration B peut s’intégrer dès Task 3 stable), **8**, **9–10**, **11**.

## Execution handoff

Le plan est enregistré dans `docs/superpowers/plans/2026-03-31-contact-payeur-foyer-implementation.md`.

**Options d’exécution :**

1. **Subagent-driven (recommandé)** — un sous-agent par tâche, relecture entre les tâches.  
2. **Exécution inline** — enchaîner les tâches dans cette session avec points de contrôle.

**Quelle approche préférez-vous ?**

*(Boucle plan-document-reviewer : prompt non présent dans le dépôt ; revue humaine du plan possible avant code.)*
