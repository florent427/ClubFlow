# Plan d’implémentation — Annuaire tiroir + routes création + CTA

**Spec :** `docs/superpowers/specs/2026-03-30-annuaire-tiroir-creation-routes-design.md`  
**Apps :** `apps/admin` (principal).

## Tâche 1 — Routage et pages « new »

- Dans `App.tsx` (routes sous `members`), ajouter :
  - `new` → composant `NewMemberPage`
  - `families/new` → `NewFamilyPage` (**avant** `families`)
- Créer `NewMemberPage.tsx` : formulaire création extrait de `MembersDirectoryPage`, hero avec **Retour** (`Link` vers `/members`), soumission `CREATE_CLUB_MEMBER`, redirection `/members` + ouverture drawer si mutation renvoie l’id (via contexte `setDrawerMemberId` ou `navigate` + state — à trancher au code : préférence **contexte** après `refetch`).
- Créer `NewFamilyPage.tsx` : formulaire extrait de `FamiliesPage`, **Retour** vers `/members/families`, soumission inchangée.

## Tâche 2 — Contexte UI

- Étendre `members-ui-context.tsx` : `drawerMemberId`, `setDrawerMemberId`.
- Migrer la palette : `requestOpenAnnuaireMember` → `setDrawerMemberId` + `navigate('/members')` si route courante ≠ annuaire ; supprimer ou déprécier `annuaireMemberIntent` si plus utilisé.
- Adapter `FamilyDetailDrawer` : lien « Fiche » membre → `setDrawerMemberId` (+ fermer drawer foyer optionnel ou laisser les deux — **spec** : ouvrir fiche membre ; recommandation **fermer** le drawer foyer pour éviter deux drawers).

## Tâche 3 — `MemberDetailDrawer`

- Nouveau fichier : charger membre depuis `CLUB_MEMBERS` (find by id) ou props + refetch.
- Reprendre champs + mutations `UPDATE_CLUB_MEMBER`, `DELETE_CLUB_MEMBER`.
- Intégrer section **Foyer** (logique actuelle modale → section dans drawer : transfert, création foyer, détachement, payeur).
- Styles : réutiliser classes drawer existantes.

## Tâche 4 — `MembersDirectoryPage`

- Retirer aside création/édition.
- Ajouter **rangée hero + CTA** : `Link` stylé `btn btn-primary` **« Nouveau membre »** → `/members/new`.
- Gérer `drawerMemberId` : rendre `MemberDetailDrawer` quand défini.
- Clic sur `tr` : `setDrawerMemberId(m.id)` ; `stopPropagation` sur boutons d’action.
- Nettoyer état `editingId` / formulaire dupliqué devenu inutile côté page (garder état modale si encore nécessaire brièvement pendant extraction).

## Tâche 5 — `FamiliesPage`

- Retirer aside « Nouveau foyer ».
- Ajouter CTA **« Nouveau foyer »** (`btn btn-primary`) → `/members/families/new` dans hero / ligne titre-actions.
- Conserver liste + `FamilyDetailDrawer`.

## Tâche 6 — CSS

- Si besoin : classe type `members-hero__actions` pour aligner titre + CTA (flex, gap) ; **pas** de refonte globale.

## Tâche 7 — Vérification

- `npm run build` dans `apps/admin`.
- Parcours manuel : CTA, création, retour, drawer ligne, Cmd+K, fiche depuis drawer foyer.

## Ordre suggéré

1 → 2 → 3 → 4 → 5 → 6 → 7.
