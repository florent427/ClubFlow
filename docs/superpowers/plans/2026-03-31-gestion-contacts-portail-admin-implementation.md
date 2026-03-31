# Plan d’implémentation — Gestion des contacts portail (admin)

> **Pour agents :** compétence recommandée `@superpowers:subagent-driven-development` ou `@superpowers:executing-plans` pour exécuter ce plan **tâche par tâche**. Les étapes utilisent des cases `- [ ]` pour le suivi.

**Objectif :** livrer dans l’admin ClubFlow une section **« Contacts »** (menu dédié) pour lister, éditer, promouvoir en membre minimal et supprimer (selon règles) les enregistrements `Contact` du club, via une API GraphQL protégée comme l’annuaire membres.

**Architecture :** logique métier dans un **service Nest** (règles `canDeleteContact`, promotion, sync `displayName`) ; **resolver GraphQL** dédié avec les mêmes garde-fous que `MembersResolver` (`GqlJwtAuthGuard`, `ClubContextGuard`, `ClubAdminRoleGuard`, `ClubModuleEnabledGuard`, `@RequireClubModule(ModuleCode.MEMBERS)`). Liste **sans pagination curseur** au MVP, comme `clubMembers` (tableau complet + filtre client). UI admin : page liste + **drawer** calqué sur `MemberDetailDrawer` / `MembersDirectoryPage`.

**Stack :** NestJS, GraphQL code-first, Prisma, Apollo Client + React (`apps/admin`). Tests : Jest unitaires service, e2e optionnel sur le même modèle que `apps/api/test/app.e2e-spec.ts`.

**Spec de référence :** [`docs/superpowers/specs/2026-03-31-gestion-contacts-portail-admin-design.md`](../specs/2026-03-31-gestion-contacts-portail-admin-design.md)

---

## Carte des fichiers (prévision)

| Fichier | Rôle |
|---------|------|
| `apps/api/src/members/club-contacts.service.ts` | Liste, fiche, update, delete, promote ; constante civilité défaut **MVP** `MemberCivility.MR` |
| `apps/api/src/members/club-contacts.service.spec.ts` | Tests unitaires des règles |
| `apps/api/src/members/models/club-contact.model.ts` | Type GraphQL `ClubContact` (id, clubId, userId, firstName, lastName, email, emailVerified, linkedMemberId, canDeleteContact, createdAt, updatedAt) |
| `apps/api/src/members/dto/update-club-contact.input.ts` | `firstName`, `lastName` (validation `class-validator`) |
| `apps/api/src/members/models/promote-contact-result.model.ts` | Ex. `PromoteContactResult { memberId }` (ou type inline `@ObjectType`) |
| `apps/api/src/members/club-contacts.resolver.ts` | Queries / mutations admin |
| `apps/api/src/members/members.module.ts` | Enregistrer `ClubContactsService`, `ClubContactsResolver` |
| `apps/api/src/graphql/graphql.module.ts` | Import side-effect du modèle GraphQL si nécessaire (comme `member.model.ts`) |
| `apps/api/test/app.e2e-spec.ts` | Scénarios e2e contacts (si infra existante le permet) |
| `apps/admin/src/components/AdminLayout.tsx` | Lien nav **Contacts** → `/contacts` |
| `apps/admin/src/App.tsx` | Route `contacts` → page |
| `apps/admin/src/pages/contacts/ContactsPage.tsx` | Liste + recherche + filtre e-mail vérifié |
| `apps/admin/src/pages/contacts/ContactDetailDrawer.tsx` | Fiche, actions, messages d’erreur spec §3.4 |
| `apps/admin/src/lib/documents.ts` | Opérations GraphQL |
| `apps/admin/src/lib/types.ts` | Types TS des réponses |

---

### Task 1 : Service `ClubContactsService` — règles et mapping

**Fichiers :**
- Créer : `apps/api/src/members/club-contacts.service.ts`
- Créer : `apps/api/src/members/club-contacts.service.spec.ts`

**Comportement à implémenter (aligné spec §2) :**

- `listClubContacts(clubId)` : `prisma.contact.findMany({ where: { clubId }, include: { user: true } })`, pour chaque ligne trouver `member` avec `where: { clubId, userId: contact.userId }` (premier si `@@unique`), calculer `linkedMemberId`, `canDeleteContact = !linkedMember`, `emailVerified` depuis `user.emailVerifiedAt`.
- `getClubContact(clubId, contactId)` : idem ou factoring interne ; `NotFoundException` si absent / mauvais club.
- `updateClubContact(clubId, contactId, input)` : transaction `contact.update` + `user.update` `{ displayName: \`${first} ${last}\`.trim() }` ; **ne pas** toucher au `Member`.
- `deleteClubContact(clubId, contactId)` : si membre existe (`userId`+`clubId`), `BadRequestException` message type spec §3.4 ; sinon `contact.delete`.
- `promoteContactToMember(clubId, contactId)` : charger `contact` + `user` ; si `!user.emailVerifiedAt` → `BadRequestException` ; si `member` existe → `BadRequestException` ; `member.create` avec `userId`, `email: user.email`, `firstName`/`lastName` depuis **contact**, `civility: MR` (documenter en constante en tête de service), `clubId`, `status: ACTIVE` ; retourner `member.id`.

- [ ] **Étape 1 :** Écrire les tests unitaires **avant** le code (TDD) : cas `canDeleteContact` false/true ; promotion refusée sans `emailVerifiedAt` ; promotion refusée si membre existe ; update met à jour `displayName` (mock Prisma ou tests avec `PrismaService` selon pattern du repo).

- [ ] **Étape 2 :** Exécuter les tests ciblés.

```bash
cd apps/api
npx jest club-contacts.service.spec.ts --runInBand
```

Attendu : échecs si implémentation absente.

- [ ] **Étape 3 :** Implémenter le service minimal pour faire passer les tests.

- [ ] **Étape 4 :** Relancer `npx jest club-contacts.service.spec.ts --runInBand` — attendu **PASS**.

- [ ] **Étape 5 :** Commit.

```bash
git add apps/api/src/members/club-contacts.service.ts apps/api/src/members/club-contacts.service.spec.ts
git commit -m "feat(api): service contacts club et règles métier"
```

---

### Task 2 : GraphQL — types, DTO, resolver

**Fichiers :**
- Créer : `apps/api/src/members/models/club-contact.model.ts`
- Créer : `apps/api/src/members/dto/update-club-contact.input.ts`
- Créer : `apps/api/src/members/models/promote-contact-result.model.ts` (ou équivalent)
- Créer : `apps/api/src/members/club-contacts.resolver.ts`
- Modifier : `apps/api/src/members/members.module.ts`
- Modifier : `apps/api/src/graphql/graphql.module.ts` (import side-effect du `.model` si besoin pour le schéma)

**Opérations :**

- `clubContacts: [ClubContact!]!` — `ClubContactsService.listClubContacts`
- `clubContact(id: ID!): ClubContact!` — `getClubContact`
- `updateClubContact(input: UpdateClubContactInput!): ClubContact!` — id + firstName, lastName
- `deleteClubContact(id: ID!): Boolean!`
- `promoteContactToMember(id: ID!): PromoteContactResult!`

**Guards (copier le décorateur de classe de `MembersResolver`) :** même pile + `@RequireClubModule(ModuleCode.MEMBERS)`.

- [ ] **Étape 1 :** Générer / valider le schéma : `npm run build` dans `apps/api`.

- [ ] **Étape 2 :** Commit.

```bash
git add apps/api/src/members/
git commit -m "feat(api): GraphQL clubContacts et mutations admin"
```

---

### Task 3 : E2E (recommandé)

**Fichier :** `apps/api/test/app.e2e-spec.ts`

- [ ] **Étape 1 :** Ajouter un test : staff authentifié liste `clubContacts` après `registerContact` + `verifyEmail` (réutiliser helpers existants si présents).
- [ ] **Étape 2 :** Test suppression refusée lorsqu’un `Member` existe (créer membre minimal en base ou via mutation existante).
- [ ] **Étape 3 :** `npm run test:e2e` dans `apps/api` — attendu **PASS**.

- [ ] **Étape 4 :** Commit.

```bash
git add apps/api/test/app.e2e-spec.ts
git commit -m "test(api): e2e contacts club admin"
```

---

### Task 4 : Admin — navigation et routing

**Fichiers :**
- Modifier : `apps/admin/src/components/AdminLayout.tsx`
- Modifier : `apps/admin/src/App.tsx`

- [ ] **Étape 1 :** Ajouter `NavLink` **Contacts** (icône ex. `contacts` ou `person`) vers `/contacts`, même niveau que Gestion des membres.
- [ ] **Étape 2 :** Route `<Route path="contacts" element={<ContactsPage />} />` sous le layout protégé.
- [ ] **Étape 3 :** Créer `apps/admin/src/pages/contacts/ContactsPage.tsx` minimal (`export function ContactsPage()` placeholder) pour que la route compile ; complété en Task 6.
- [ ] **Étape 4 :** `npm run build` dans `apps/admin`.

- [ ] **Étape 5 :** Commit.

```bash
git add apps/admin/src/components/AdminLayout.tsx apps/admin/src/App.tsx apps/admin/src/pages/contacts/ContactsPage.tsx
git commit -m "feat(admin): route et menu Contacts"
```

---

### Task 5 : Admin — documents Apollo + types

**Fichiers :**
- Modifier : `apps/admin/src/lib/documents.ts`
- Modifier : `apps/admin/src/lib/types.ts`

- [ ] **Étape 1 :** Déclarer `CLUB_CONTACTS`, `CLUB_CONTACT`, `UPDATE_CLUB_CONTACT`, `DELETE_CLUB_CONTACT`, `PROMOTE_CONTACT_TO_MEMBER` avec les champs nécessaires au UI.
- [ ] **Étape 2 :** Types TS alignés sur le schéma généré côté API (noms exacts des champs).

- [ ] **Étape 3 :** Commit.

```bash
git add apps/admin/src/lib/documents.ts apps/admin/src/lib/types.ts
git commit -m "feat(admin): opérations GraphQL contacts"
```

---

### Task 6 : Admin — `ContactsPage` + `ContactDetailDrawer`

**Fichiers :**
- Modifier : `apps/admin/src/pages/contacts/ContactsPage.tsx` (remplacer le placeholder Task 4)
- Créer : `apps/admin/src/pages/contacts/ContactDetailDrawer.tsx`

**UI MVP :**

- En-tête de page type `members-loom__hero` : titre **Contacts portail**, aide courte (effet `displayName` global — spec §2.5).
- Tableau : colonnes prénom, nom, e-mail, vérifié (oui/non), **Aussi membre** si `linkedMemberId`, lien `NavLink` vers `/members` avec stratégie d’ouverture fiche : soit `Link` vers annuaire (MVP simple : lien + instruction « rechercher »), soit réutiliser `useMembersUi().setDrawerMemberId` si accessible depuis cette route — **préférence plan :** bouton « Ouvrir membre » qui `navigate('/members')` puis `setDrawerMemberId(linkedMemberId)` si le contexte `MembersUiProvider` entoure déjà `App` ; sinon lien documenté « aller à l’annuaire ».
- Recherche texte (nom/e-mail) côté client ; filtre optionnel boutons **Tous / E-mail vérifié / Non vérifié**.
- Clic ligne → ouvre drawer ; drawer : champs éditables prénom/nom, boutons Enregistrer, Promouvoir, Supprimer (désactivé + `title` si `!canDeleteContact`), erreurs GraphQL affichées avec messages spec.

- [ ] **Étape 1 :** Implémenter et vérifier manuellement avec API locale.
- [ ] **Étape 2 :** `npm run build` dans `apps/admin`.

- [ ] **Étape 3 :** Commit.

```bash
git add apps/admin/src/pages/contacts/
git commit -m "feat(admin): liste et drawer contacts portail"
```

---

## Ordre d’exécution suggéré

1 → 2 → 3 → 4 → 5 → 6.

## Vérification finale

- [ ] `npm run build` dans `apps/api` et `apps/admin`
- [ ] `npm test` dans `apps/api` (ou au minimum `club-contacts.service.spec.ts`)
- [ ] Parcours manuel : liste, édition noms, promotion (compte vérifié), suppression après suppression membre, impossibilité supprimer avec membre présent.

---

## Notes d’implémentation

- **Module club :** même exigence **`MEMBERS` activé** que pour l’annuaire ; si le produit doit exposer les contacts sans module membres, trancher hors ce plan (non couvert par la spec validée).
- **Pagination :** spec §4.3 autorise le même style que membres ; l’annuaire actuel est **liste complète** — rester cohérent ; pagination réservée à une phase ultérieure si perf critique.
- **Civilité par défaut :** `MR` documentée dans le service ; corriger en annuaire après promotion.
