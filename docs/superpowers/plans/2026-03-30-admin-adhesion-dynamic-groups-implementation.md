# Back-office adhésion & groupes dynamiques — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rendre accessibles dans `apps/admin` les flux validés dans [2026-03-30-admin-adhesion-dynamic-groups-design.md](../specs/2026-03-30-admin-adhesion-dynamic-groups-design.md) (groupes dynamiques CRUD, affectations + suggestion sur fiche membre, paramètres saisons/formules, assistant cotisation DRAFT → OPEN).

**Architecture:** Prolonger le schéma GraphQL existant côté API avec un champ **léger** sur `MemberGraph` pour les groupes assignés (évite requêtes ad hoc). Côté admin, centraliser les opérations dans `documents.ts` / `types.ts`, réutiliser les patterns de `MembersGradesPage` (formulaires + `useMutation` + `refetch`), et conditionner les écrans via `CLUB_MODULES` (`MEMBERS` / `PAYMENT`) + `activeClubSeason`. **Conventions UI (spec §7) :** chaque liste / panneau gère loading, vide, erreur ; surface `graphQLErrors` (toast ou bandeau). Pas de runner de tests front en V1 : **`npm run build`** + **`npm run lint`** sur `apps/admin` + parcours manuel spec §8.

**Tech Stack:** React 19, React Router 7, Apollo Client 4, Vite, NestJS GraphQL existant (`apps/api`).

**Références:** Spec addendum §3–7 ; patterns `apps/admin/src/pages/members/MembersGradesPage.tsx`, `apps/admin/src/lib/documents.ts`, `apps/admin/src/pages/DashboardPage.tsx` (carte modules).

---

## Carte des fichiers

| Fichier | Responsabilité |
|---------|----------------|
| `apps/api/src/members/models/member.model.ts` | Nouveau sous-type minimal + champ `assignedDynamicGroups` sur `MemberGraph`. |
| `apps/api/src/members/members.service.ts` | `include` Prisma `dynamicGroupAssignments.dynamicGroup`, mapping dans `toMemberGraph`. |
| `apps/admin/src/lib/documents.ts` | Nouvelles requêtes/mutations GQL (groupes CRUD, suggestion, set groups, saisons, produits, facture, pricing rules, invoices). |
| `apps/admin/src/lib/types.ts` | Types TypeScript des réponses / variables. |
| `apps/admin/src/lib/payment-labels.ts` (nouveau, optionnel) | Libellés FR pour `ClubPaymentMethod` (éviter duplication). |
| `apps/admin/src/pages/members/MembersDynamicGroupsPage.tsx` (nouveau) | CRUD groupes dynamiques. |
| `apps/admin/src/pages/settings/AdhesionSettingsPage.tsx` (nouveau) | Hub saisons + formules (sections ou deux colonnes). |
| `apps/admin/src/pages/members/MemberDetailDrawer.tsx` | Bloc groupes + assistant cotisation ; peut extraire `MemberDynamicGroupsSection.tsx` / `MemberMembershipCotisationPanel.tsx` si > ~150 lignes ajoutées. |
| `apps/admin/src/App.tsx` | Routes `/members/dynamic-groups`, `/settings/adhesion`. |
| `apps/admin/src/pages/members/MembersLayout.tsx` | Lien sous-nav « Groupes dynamiques ». |
| `apps/admin/src/pages/settings/SettingsLayout.tsx` + `SettingsHubPage.tsx` | Liens vers adhésion. |
| `apps/admin/src/components/AdminLayout.tsx` | (Optionnel) Rien à changer si navigation suffit dans sous-layouts. |

**Ordre d’exécution recommandé :** Task **1 → 2 → 4 → 3 → 5 → 6 → 7 → 8** (helper modules avant la page groupes).

---

### Task 1: API — exposer les groupes assignés sur `MemberGraph`

**Files:**
- Modify: `apps/api/src/members/models/member.model.ts`
- Modify: `apps/api/src/members/members.service.ts` (`memberIncludeGraph`, type `toMemberGraph`, implémentation)
- Test: `cd apps/api; npm run build` (compilateur)

- [ ] **Step 1: Ajouter un type GraphQL minimal**

Créer un `@ObjectType()` du genre `AssignedDynamicGroupGraph` avec `id`, `name` (pas besoin de `matchingActiveMembersCount` ici).

- [ ] **Step 2: Étendre `MemberGraph`**

Champ : `assignedDynamicGroups: AssignedDynamicGroupGraph[]` (tableau, défaut `[]`).

- [ ] **Step 3: Prisma include + mapping**

Dans `memberIncludeGraph`, ajouter par ex.  
`dynamicGroupAssignments: { include: { dynamicGroup: { select: { id: true, name: true } } } }`. Mettre à jour **en même temps** le type générique `Prisma.MemberGetPayload<{ include: … }>` de `toMemberGraph` pour éviter les erreurs TS.  
Puis dans `toMemberGraph`, mapper vers le tableau trié par `name` (ordre stable).

- [ ] **Step 4: Vérifier la compilation**

Run: `cd apps/api; npm run build`  
Expected: succès sans erreur TS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/members/models/member.model.ts apps/api/src/members/members.service.ts
git commit -m "feat(api): assignedDynamicGroups sur MemberGraph pour le back-office"
```

---

### Task 2: Admin — documents GraphQL & types

**Files:**
- Modify: `apps/admin/src/lib/documents.ts`
- Modify: `apps/admin/src/lib/types.ts`

- [ ] **Step 1: Étendre `CLUB_MEMBERS`**

Ajouter le fragment pour `assignedDynamicGroups { id name }` (noms exacts selon Step Task 1).

- [ ] **Step 2: Ajouter opérations groupes**

Mutations : `CREATE_CLUB_DYNAMIC_GROUP`, `UPDATE_CLUB_DYNAMIC_GROUP`, `DELETE_CLUB_DYNAMIC_GROUP` (signatures alignées sur `createClubDynamicGroup` / `updateClubDynamicGroup` / `deleteClubDynamicGroup`).  
Query : réutiliser / compléter `clubDynamicGroups` si déjà présent.

- [ ] **Step 3: Affectations membre**

`SUGGEST_MEMBER_DYNAMIC_GROUPS` (variable `memberId`), `SET_MEMBER_DYNAMIC_GROUPS` (input `memberId` + `dynamicGroupIds`).

- [ ] **Step 4: Adhésion**

Queries : `CLUB_SEASONS`, `ACTIVE_CLUB_SEASON`, `MEMBERSHIP_PRODUCTS`, `CLUB_PRICING_RULES`, `CLUB_INVOICES`.  
Mutations : `CREATE_CLUB_SEASON`, `UPDATE_CLUB_SEASON`, `CREATE_MEMBERSHIP_PRODUCT`, `UPDATE_MEMBERSHIP_PRODUCT`, `CREATE_MEMBERSHIP_INVOICE_DRAFT`, `FINALIZE_MEMBERSHIP_INVOICE`.

- [ ] **Step 5: Types TS**

Déclarer les types de données correspondants dans `types.ts` (réutiliser des unions string pour `InvoiceStatus` / `ClubPaymentMethod` si pas d’enum générée).

- [ ] **Step 6: Build + lint admin**

Run: `cd apps/admin; npm run build && npm run lint`  
Expected: succès.

- [ ] **Step 7: Commit**

```bash
git add apps/admin/src/lib/documents.ts apps/admin/src/lib/types.ts
git commit -m "feat(admin): documents GraphQL adhesion et groupes dynamiques"
```

---

### Task 3: Page `MembersDynamicGroupsPage` + route + sous-nav

**Files:**
- Create: `apps/admin/src/pages/members/MembersDynamicGroupsPage.tsx`
- Modify: `apps/admin/src/App.tsx`
- Modify: `apps/admin/src/pages/members/MembersLayout.tsx`

- [ ] **Step 1: Implémenter la page**

Liste des `clubDynamicGroups` ; formulaire création (`name`, `minAge`, `maxAge`, multi-sélection `gradeLevelIds` via `CLUB_GRADE_LEVELS`). Édition inline ou modal selon le style `MembersGradesPage`. Suppression avec `confirm`.

- [ ] **Step 2: Garde `MEMBERS`**

Après le Task 4 : utiliser `isModuleEnabled(..., 'MEMBERS')` et un message cohérent si le module est désactivé.

- [ ] **Step 2b: Suppression**

Si l’API renvoie une erreur (contraintes `Restrict` sur `DynamicGroup`, ex. formule liée), afficher le message serveur — ne pas supposer que le `confirm` suffit.

- [ ] **Step 3: Brancher routes**

`App.tsx` : `<Route path="dynamic-groups" element={<MembersDynamicGroupsPage />} />` sous `members`.  
`MembersLayout.tsx` : `<NavLink to="/members/dynamic-groups">Groupes dynamiques</NavLink>`.

- [ ] **Step 4: Build + lint**

Run: `cd apps/admin; npm run build && npm run lint`

- [ ] **Step 5: Commit**

```bash
git add apps/admin/src/pages/members/MembersDynamicGroupsPage.tsx apps/admin/src/App.tsx apps/admin/src/pages/members/MembersLayout.tsx
git commit -m "feat(admin): page CRUD groupes dynamiques"
```

---

### Task 4: Helper modules club (recommandé — avant Task 3 si possible)

**Files:**
- Create: `apps/admin/src/lib/club-modules.ts` — fonction pure `isModuleEnabled(rows, code)`  
  OU hook `useClubModules()` dans un petit fichier sous `src/lib/`

- [ ] **Step 1: Implémenter** lecture depuis cache Apollo `CLUB_MODULES` ou propager depuis layout (éviter dupliquer la logique du `DashboardPage`).

- [ ] **Step 2: Utiliser** sur pages adhésion + cotisation.

- [ ] **Step 3: Commit** (peut être fusionné avec Task 5 si minimal)

---

### Task 5: Hub `/settings/adhesion` (saisons + formules)

**Files:**
- Create: `apps/admin/src/pages/settings/AdhesionSettingsPage.tsx`
- Modify: `apps/admin/src/App.tsx`, `SettingsLayout.tsx`, `SettingsHubPage.tsx`

- [ ] **Step 1: Saisons**

Liste `clubSeasons`, bandeau si `activeClubSeason` null. Formulaires create / update (`label`, `startsOn`, `endsOn`, `setActive` / `isActive`). Messages d’erreur API affichés.

- [ ] **Step 2: Formules**

Liste `membershipProducts` avec lien visuel vers groupe (`dynamicGroupId` + résolution nom via `clubDynamicGroups` en query parallèle). Create / update : `label`, `baseAmountCents` (saisie euros → centimes en JS), flags `allow*`, `exceptionalCapPercentBp`, choix `dynamicGroupId` (select).

- [ ] **Step 3: Garde `PAYMENT`**

Si module paiement off : remplacer le contenu par message + lien tableau de bord modules (ancre `/#club-modules`).

- [ ] **Step 4: Routes & navigation**

`/settings/adhesion`, lien depuis hub paramètres et sous-nav.

- [ ] **Step 5: Build + lint + commit**

```bash
cd apps/admin; npm run build && npm run lint
git add apps/admin/src/pages/settings/AdhesionSettingsPage.tsx apps/admin/src/App.tsx apps/admin/src/pages/settings/SettingsLayout.tsx apps/admin/src/pages/settings/SettingsHubPage.tsx
git commit -m "feat(admin): parametres saisons et formules adhesion"
```

---

### Task 6: Fiche membre — bloc groupes dynamiques

**Files:**
- Modify: `apps/admin/src/pages/members/MemberDetailDrawer.tsx`  
- Optional create: `apps/admin/src/pages/members/MemberDynamicGroupsSection.tsx`

- [ ] **Step 1: État local**

Checkboxes pour tous les `clubDynamicGroups` (ou liste double) ; précharger depuis `member.assignedDynamicGroups`.

- [ ] **Step 2: Bouton « Suggérer »**

Appeler `suggestMemberDynamicGroups` ; fusionner les ids proposés dans la sélection **en local uniquement** jusqu’à « Enregistrer » (spec §6).

- [ ] **Step 3: Enregistrer**

Mutation `setMemberDynamicGroups` avec liste d’ids cochés ; `refetchQueries: [CLUB_MEMBERS]` (ou `await refetch()` du parent).

- [ ] **Step 4: Garde `MEMBERS`**

Masquer le bloc si module désactivé.

- [ ] **Step 5: Build + lint + commit**

Run: `cd apps/admin; npm run build && npm run lint`

---

### Task 7: Fiche membre — assistant cotisation

**Files:**
- Modify: `MemberDetailDrawer.tsx` ou nouveau `MemberMembershipCotisationPanel.tsx`

- [ ] **Step 1: Garde d’entrée**

Afficher le flux seulement si `MEMBERS` && `PAYMENT` && `activeClubSeason` non null (queries `CLUB_MODULES`, `ACTIVE_CLUB_SEASON` — peuvent être passées en props depuis annuaire si déjà chargées pour éviter N fois).

- [ ] **Step 2: Sélection produit**

Filtrer `membershipProducts` : produit `dynamicGroupId` ∈ ids des `assignedDynamicGroups` du membre.

- [ ] **Step 3: Formulaire brouillon**

Champs alignés `CreateMembershipInvoiceDraftInput`. Masquer aide publique / exceptionnelle selon flags produit. Pour l’exceptionnelle : afficher le champ seulement en V1 « toujours » si `allowExceptional` et laisser l’API refuser avec message clair si rôle insuffisant **ou** tenter une query profil si exposée plus tard (spec : affinage JWT).

- [ ] **Step 4: Création brouillon + affichage**

Mutation `createMembershipInvoiceDraft` ; le retour est un `InvoiceGraph` (pas de lignes imbriquées) — afficher `id`, `status`, `baseAmountCents`, `amountCents`, libellé ; mention « pas de paiement en DRAFT » ; **refetch optionnel** `CLUB_INVOICES` pour cohérence avec la liste club ; lien ou texte « Retrouver cette facture dans Finances » si une liste existe, sinon ID copiable.

- [ ] **Step 5: Finalisation**

Charger `clubPricingRules` ; construire liste de méthodes : d’abord les `method` ayant une règle, puis compléter avec autres valeurs enum si besoin ; libellés FR (`payment-labels.ts`). Mutation `finalizeMembershipInvoice`.

- [ ] **Step 6: Refetch**

`refetchQueries` incluant `CLUB_INVOICES` et `CLUB_MEMBERS` si pertinent.

- [ ] **Step 7: Build + lint + commit**

---

### Task 8: QA & finition

- [ ] Parcours manuel complet spec §8 (brainstorming).
- [ ] Vérifier Planning / Annuaire : `clubDynamicGroups` inchangé fonctionnellement.
- [ ] `cd apps/admin; npm run lint` — passage final sur l’ensemble des fichiers touchés.

---

## Fin de plan — relecture

Après rédaction : exécuter la boucle **plan-document-reviewer** (voir skill `writing-plans`) avant développement massif.

---

## Choix d’exécution (post-revue)

1. **Subagent-Driven (recommandé)** — @superpowers/subagent-driven-development : une sous-session par tâche, revue entre tâches.  
2. **Inline** — @superpowers/executing-plans : tout enchaîner dans une session avec points de contrôle.
