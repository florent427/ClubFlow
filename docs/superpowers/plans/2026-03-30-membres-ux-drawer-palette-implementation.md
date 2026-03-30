# Plan d’implémentation — UX Membres : drawer fiche foyer & palette Cmd+K

> **Pour agents :** utiliser **superpowers:subagent-driven-development** ou **executing-plans** pour exécuter ce plan tâche par tâche. Étapes en `- [ ]`.

**Référence spec :** [docs/superpowers/specs/2026-03-30-membres-ux-drawer-famille-palette-design.md](../specs/2026-03-30-membres-ux-drawer-famille-palette-design.md)

**Référence règles foyer :** [docs/superpowers/specs/2026-03-30-familles-membres-rattachement-recherche-design.md](../specs/2026-03-30-familles-membres-rattachement-recherche-design.md)

**Objectif :** drawer latéral pour éditer un foyer (libellé, membres, payeur, recherche d’ajout), liste foyers avec carte active, palette **Ctrl+K** / **Cmd+K** sous `/members/*` avec ouverture annuaire + action « Ajouter au foyer courant » si drawer ouvert ; mutation **`updateClubFamily`** si absente.

**Architecture :** contexte React léger dans `MembersLayout` (foyer actif du drawer + file d’intention pour focus annuaire) ; composants `MembersCommandPalette` et `FamilyDetailDrawer` (ou équivalent) ; phase 1 données = `clubFamilies` + `clubMembers` + refetch.

**Stack :** NestJS GraphQL, Prisma, React Router, Apollo, Vite admin.

---

## Cartographie des fichiers

| Zone | Fichiers |
|------|----------|
| API | `apps/api/src/families/dto/update-club-family.input.ts` (nouveau), `families.service.ts`, `families.resolver.ts`, éventuellement `test/app.e2e-spec.ts` |
| Admin — contexte | `apps/admin/src/pages/members/members-ui-context.tsx` (nouveau), `MembersLayout.tsx` |
| Admin — UI | `FamiliesPage.tsx` (drawer + liste), `MembersCommandPalette.tsx` (nouveau, ou sous `components/`), `MembersDirectoryPage.tsx` (réaction au focus depuis palette), `documents.ts`, `types.ts`, `index.css` |

---

### Tâche 1 : API `updateClubFamily`

**Fichiers :** nouveau DTO, `families.service.ts`, `families.resolver.ts`

- [ ] **1.1** — Créer `UpdateClubFamilyInput` : `id` (UUID), `label` optionnel (`string`, `@MaxLength`, nullable pour effacer le libellé si le produit le permet — sinon `optional string` sans null explicite ; **recommandation spec** : champ texte + bouton Enregistrer, envoi `undefined` si inchangé, `null` ou `""` selon convention Prisma pour « sans libellé »).
- [ ] **1.2** — `FamiliesService.updateClubFamily(clubId, input)` : vérifier `family` existe pour le club ; `update` du `label` ; retourner `FamilyGraph` (recharger avec `familyMembers`).
- [ ] **1.3** — Mutation GraphQL `updateClubFamily`, mêmes gardes que `createClubFamily`.
- [ ] **1.4** — `nest build` + test e2e minimal (mutation + lecture `clubFamilies`) ou test manuel documenté.

---

### Tâche 2 : Documents & types admin

**Fichiers :** `apps/admin/src/lib/documents.ts`, `types.ts`

- [ ] **2.1** — Mutation `UPDATE_CLUB_FAMILY` alignée sur le schéma.
- [ ] **2.2** — Types TypeScript des variables / réponses si besoin.

---

### Tâche 3 : Contexte UI « shell » membres

**Fichiers :** `members-ui-context.tsx`, `MembersLayout.tsx`

- [ ] **3.1** — Créer un `MembersUiProvider` avec au minimum :
  - `drawerFamilyId: string | null` / `setDrawerFamilyId`
  - `annuaireMemberIntent: { memberId: string; openEdit: boolean } | null` + fonction pour le déclencher puis le consommer (éviter re-triggers).
- [ ] **3.2** — Envelopper `<Outlet />` dans le provider dans `MembersLayout` ; monter le composant palette **une fois** au même niveau (au-dessus du contenu ou `fixed`).

---

### Tâche 4 : Drawer « Fiche foyer » (`FamiliesPage`)

**Fichiers :** `FamiliesPage.tsx`, `index.css`

- [ ] **4.1** — Clic sur une carte foyer : `setDrawerFamilyId(f.id)` ; classe CSS `--active` ou équivalent sur la carte correspondante.
- [ ] **4.2** — Rendu du **drawer** (panneau latéral + backdrop) : titre / `aria-labelledby`, bouton fermer, **Échap**, clic backdrop → `setDrawerFamilyId(null)`.
- [ ] **4.3** — Contenu : données du foyer depuis `clubFamilies` (mémoïser la carte sélectionnée ; **refetch** `CLUB_FAMILIES` / `CLUB_MEMBERS` à l’ouverture ou après mutations).
- [ ] **4.4** — **Libellé** : champ + bouton **Enregistrer** appelant `UPDATE_CLUB_FAMILY` (spec V1 : pas d’auto-save obligatoire).
- [ ] **4.5** — Liste membres : nom (via `clubMembers`), rôle foyer, boutons **Retirer** / **Définir payeur** (`removeClubMemberFromFamily`, `setClubFamilyPayer`) avec confirmations FR.
- [ ] **4.6** — **Ajouter un membre** : input recherche prénom+nom sur membres **sans foyer** ou tous avec message si déjà dans un foyer (transfert avec confirm — réutiliser textes proches de `MembersDirectoryPage`).
- [ ] **4.7** — Lien **Annuaire** : `Link to="/members"` + éventuellement `annuaireMemberIntent` pour pré-sélection (optionnel V1).
- [ ] **4.8** — Badge **Payeur manquant** dans le drawer si `needsPayer`.

---

### Tâche 5 : Palette `MembersCommandPalette`

**Fichiers :** `MembersCommandPalette.tsx`, `MembersLayout.tsx`, `index.css`

- [ ] **5.1** — Écoute globale **Ctrl+K** / **Cmd+K** uniquement si `location.pathname.startsWith('/members')` ; **ne pas** interférer quand focus dans `input`/`textarea` sauf si combinaison standard (comportement type Spotlight : souvent ouvert même depuis champ — **recommandation** : ouvrir sauf si le champ est déjà une *palette search*).
- [ ] **5.2** — Overlay + champ de recherche ; résultats filtrés sur `clubMembers` (Apollo `useQuery(CLUB_MEMBERS)` ou cache existant).
- [ ] **5.3** — Action principale : **Ouvrir dans l’annuaire** → `navigate('/members')` + `setAnnuaireMemberIntent({ memberId, openEdit: true })` (ou `false` si préférence : seulement scroll).
- [ ] **5.4** — Si `drawerFamilyId !== null` : action secondaire **Ajouter au foyer courant** (rôle `MEMBER` par défaut, confirm si membre déjà ailleurs) → `transferClubMemberToFamily` puis refetch.
- [ ] **5.5** — Fermeture : **Échap**, clic extérieur ; accessibilité : focus dans la palette à l’ouverture, `role="dialog"`.

---

### Tâche 6 : Annuaire — consommation de l’intention palette

**Fichiers :** `MembersDirectoryPage.tsx`

- [ ] **6.1** — `useEffect` sur `annuaireMemberIntent` : `scrollIntoView` sur ligne (`id` stable `member-row-{id}`), si `openEdit` appeler `startEdit(m)`, puis consommer l’intent.
- [ ] **6.2** — Attributs `id` sur les `<tr>` du tableau pour le scroll.

---

### Tâche 7 : Vérification

- [ ] **7.1** — `npm run build` (admin + api).
- [ ] **7.2** — Parcours manuel : drawer, libellé, ajout membre, palette depuis annuaire et depuis familles avec drawer ouvert.
- [ ] **7.3** — `npm run test:e2e` dans `apps/api` si scénario ajouté ; sinon noter la dette test.

---

## Notes

- **Phase 2** (hors périmètre immédiat) : query `clubFamily(id)` si perf liste + drawer insuffisante.
- Harmoniser styles avec **Stitch** (`members-*`, variables `cf-*`).
- Éviter d’alourdir `FamiliesPage` : extraire `FamilyDetailDrawer` dans `FamilyDetailDrawer.tsx` si le fichier dépasse ~350 lignes.
