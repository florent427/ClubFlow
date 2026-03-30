# Plan d’implémentation — Rattachement foyer sur fiche membre + recherche

> **Pour agents :** utiliser **superpowers:subagent-driven-development** (recommandé) ou **executing-plans** pour exécuter ce plan tâche par tâche. Les étapes utilisent des cases à cocher `- [ ]`.

**Référence spec :** [docs/superpowers/specs/2026-03-30-familles-membres-rattachement-recherche-design.md](../specs/2026-03-30-familles-membres-rattachement-recherche-design.md)

**Objectif :** exposer foyer + lien sur chaque membre (GraphQL), mutations détacher / transférer / définir payeur, indicateur `needsPayer` sur les foyers, recherche locale prénom+nom (annuaire) et libellé (familles), UI sur `MembersDirectoryPage` et `FamiliesPage`.

**Architecture :** étendre `FamiliesService` pour les mutations métier (transactions Prisma) ; enrichir `MembersService.toMemberGraph` avec `include: { familyMembers: { include: { family: true }, take: 1 } }` (au plus un lien géré par l’app) ; admin Apollo : requêtes/mutations alignées ; filtres `useMemo` côté client.

**Stack :** NestJS GraphQL, Prisma, React Admin (Vite), Apollo Client, Jest e2e existant (`apps/api/test/app.e2e-spec.ts`).

---

## Fichiers impactés (cartographie)

| Zone | Fichiers |
|------|-----------|
| API types GraphQL | `apps/api/src/members/models/member.model.ts` (sous-types `MemberFamilySummaryGraph`, `MemberFamilyLinkSummaryGraph` + champs `family`, `familyLink`), `apps/api/src/families/models/family-graph.model.ts` (`needsPayer`) |
| API logique | `apps/api/src/families/families.service.ts`, `apps/api/src/families/families.resolver.ts`, `apps/api/src/members/members.service.ts` (include + mapping) |
| Admin | `apps/admin/src/lib/documents.ts`, `apps/admin/src/lib/types.ts`, `apps/admin/src/pages/members/MembersDirectoryPage.tsx`, `apps/admin/src/pages/members/FamiliesPage.tsx`, éventuellement `apps/admin/src/index.css` |
| Tests | `apps/api/src/families/families.service.spec.ts` (nouveau, Prisma mock) ou tests ciblés ; `apps/api/test/app.e2e-spec.ts` |

**Règle métier à coder explicitement (transfert en `PAYER`) :** dans la transaction, si `linkRole === PAYER` et que le foyer cible a déjà un payeur, passer les anciens liens `PAYER` de ce foyer en `MEMBER` (un seul payeur).

**Règle `needsPayer` :** `links.length > 0` et aucun `linkRole === PAYER`.

**Détachement :** `deleteMany` / `delete` sur `FamilyMember` pour ce `memberId` ; **ne pas** supprimer le `Family` automatiquement (spec §5.2).

---

### Tâche 1 : Modèles GraphQL (`MemberGraph`, `FamilyGraph`)

**Fichiers :**
- Modifier : `apps/api/src/members/models/member.model.ts`
- Modifier : `apps/api/src/families/models/family-graph.model.ts`

- [ ] **Étape 1.1** — Ajouter `MemberFamilySummaryGraph` (`id`, `label`) et `MemberFamilyLinkSummaryGraph` (`id`, `linkRole`) ; sur `MemberGraph`, champs nullable `family` et `familyLink`.
- [ ] **Étape 1.2** — Sur `FamilyGraph`, ajouter `needsPayer: boolean` avec `@Field(() => Boolean)`.
- [ ] **Étape 1.3** — `npm run build` dans `apps/api` (ou `nest build`) pour vérifier la compilation GraphQL.

---

### Tâche 2 : `FamiliesService` — `toFamilyGraph` + mutations

**Fichiers :**
- Modifier : `apps/api/src/families/families.service.ts`

- [ ] **Étape 2.1** — Calculer `needsPayer` dans `toFamilyGraph` (et tout appel intermédiaire qui construit un `FamilyGraph`).
- [ ] **Étape 2.2** — Implémenter `removeClubMemberFromFamily(clubId, memberId)` : vérifier membre du club ; supprimer le `FamilyMember` du membre ; idempotent si déjà absent ; retourner `true`.
- [ ] **Étape 2.3** — Implémenter `transferClubMemberToFamily(clubId, memberId, familyId, linkRole)` en **transaction** : valider membre actif + même club que foyer ; supprimer tout `FamilyMember` existant pour ce membre ; si `linkRole === PAYER`, déclasser les autres `PAYER` du foyer cible en `MEMBER` ; créer le nouveau lien ; retourner le `FamilyGraph` du foyer cible (recharger avec `include: { familyMembers: true }`).
- [ ] **Étape 2.4** — Implémenter `setClubFamilyPayer(clubId, memberId)` : le membre doit avoir exactement un `FamilyMember` ; dans une transaction, mettre tous les `PAYER` du **même** `familyId` en `MEMBER`, puis le membre ciblé en `PAYER` ; retourner `FamilyGraph` du foyer.
- [ ] **Étape 2.5** — Cas d’erreur explicites : `NotFoundException`, `BadRequestException` (messages FR cohérents avec le module), foyer ou membre hors club.

---

### Tâche 3 : Résolveur GraphQL

**Fichiers :**
- Modifier : `apps/api/src/families/families.resolver.ts`

- [ ] **Étape 3.1** — Mutations `removeClubMemberFromFamily`, `transferClubMemberToFamily`, `setClubFamilyPayer` avec les mêmes gardes que `createClubFamily` (`GqlJwtAuthGuard`, `ClubContextGuard`, `ClubAdminRoleGuard`, `ClubModuleEnabledGuard`, `@RequireClubModule(ModuleCode.FAMILIES)`).
- [ ] **Étape 3.2** — Vérifier que `clubFamilies` renvoie bien `needsPayer` (via service).

---

### Tâche 4 : `MembersService` — chargement foyer

**Fichiers :**
- Modifier : `apps/api/src/members/members.service.ts`

- [ ] **Étape 4.1** — Étendre le `include` de `listMembers`, `getMember`, et tout autre chemin utilisant `toMemberGraph` avec `familyMembers: { take: 1, include: { family: true } }` (si plusieurs lignes anachroniques, prendre la première et considérer un log / nettoyage manuel hors scope).
- [ ] **Étape 4.2** — Mapper `family` / `familyLink` dans `toMemberGraph` à partir de `row.familyMembers[0]` si présent.

---

### Tâche 5 : Tests API

**Fichiers :**
- Créer : `apps/api/src/families/families.service.spec.ts` **ou** étendre les e2e uniquement si mocking Prisma trop lourd.
- Modifier : `apps/api/test/app.e2e-spec.ts`

- [ ] **Étape 5.1** — Tests unitaires ciblés pour `needsPayer` (fonction pure extraite de `toFamilyGraph` si besoin de test sans DB).
- [ ] **Étape 5.2** — Au minimum un scénario **e2e** : créer membres + foyer → `transferClubMemberToFamily` ou création puis transfert d’un second membre → vérifier liens ; `removeClubMemberFromFamily` ; lecture `clubFamilies` avec `needsPayer` après départ du payeur (spec **B**).
- [ ] **Étape 5.3** — `npm run test` et `npm run test:e2e` dans `apps/api`.

---

### Tâche 6 : Documents GraphQL et types admin

**Fichiers :**
- Modifier : `apps/admin/src/lib/documents.ts`
- Modifier : `apps/admin/src/lib/types.ts`

- [ ] **Étape 6.1** — Étendre `CLUB_MEMBERS` avec `family { id label }` et `familyLink { id linkRole }`.
- [ ] **Étape 6.2** — Étendre `CLUB_FAMILIES` avec `needsPayer`.
- [ ] **Étape 6.3** — Ajouter mutations `REMOVE_CLUB_MEMBER_FROM_FAMILY`, `TRANSFER_CLUB_MEMBER_TO_FAMILY`, `SET_CLUB_FAMILY_PAYER` (noms exacts alignés sur le schéma API).
- [ ] **Étape 6.4** — Mettre à jour `MembersQueryData`, `FamiliesQueryData` et types des réponses de mutations.

---

### Tâche 7 : `MembersDirectoryPage`

**Fichiers :**
- Modifier : `apps/admin/src/pages/members/MembersDirectoryPage.tsx`

- [ ] **Étape 7.1** — Champ texte « Recherche » : filtrer la liste affichée (prénom + nom, insensible à la casse, trim).
- [ ] **Étape 7.2** — Bloc **Foyer** par ligne (ou dans le panneau d’édition) : afficher libellé + rôle ; lien vers `/members/families` optionnel.
- [ ] **Étape 7.3** — Bouton **Détacher** + confirmation (renforcer le message si `linkRole === PAYER`).
- [ ] **Étape 7.4** — **Rejoindre un foyer** : sélecteur des foyers (liste filtrée par recherche sur libellé côté client) + choix rôle Payeur / Membre ; modale de confirmation pour transfert (mention foyer d’origine sans payeur si le membre était payeur et d’autres membres restent — message informatif).
- [ ] **Étape 7.5** — **Créer un foyer** : réutiliser la mutation `CREATE_CLUB_FAMILY` (formulaire compact ou section repliable) en pré-sélectionnant le membre courant dans `memberIds` / `payerMemberId` selon choix admin.
- [ ] **Étape 7.6** — Bouton **Définir comme payeur** (visible si membre déjà dans un foyer et rôle membre) appelant `SET_CLUB_FAMILY_PAYER`.
- [ ] **Étape 7.7** — `refetch` des requêtes `CLUB_MEMBERS` et `CLUB_FAMILIES` après mutations pertinentes.

---

### Tâche 8 : `FamiliesPage`

**Fichiers :**
- Modifier : `apps/admin/src/pages/members/FamiliesPage.tsx`
- Modifier (si besoin) : `apps/admin/src/index.css`

- [ ] **Étape 8.1** — Input recherche : filtrer les cartes foyers par `label` (insensible à la casse ; foyer sans nom : matcher chaîne vide ou « sans nom » selon comportement choisi, documenter en commentaire court).
- [ ] **Étape 8.2** — Badge visuel « Payeur manquant » lorsque `needsPayer` (style Stitch / classes existantes `members-*` / `cf-*`).

---

### Tâche 9 : Vérification finale

- [ ] **Étape 9.1** — `npm run build` dans `apps/admin` et `apps/api`.
- [ ] **Étape 9.2** — Parcours manuel : recherche annuaire, rattachement, transfert avec confirmation, badge foyer sans payeur, détachement.

---

## Notes d’évolution (hors périmètre immédiat)

- Contrainte DB optionnelle `@@unique([memberId])` sur `FamilyMember` pour garantir au plus un foyer par membre au niveau PostgreSQL.
- Arguments GraphQL `search` sur `clubMembers` / `clubFamilies` si volumétrie importante.
