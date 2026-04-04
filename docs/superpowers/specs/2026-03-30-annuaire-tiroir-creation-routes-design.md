# Spécification — Annuaire : tiroir fiche membre, création par routes, CTA visibles

**Date :** 2026-03-30  
**Statut :** validée par le demandeur (échanges 2026-03-30)  
**Périmètre :** administration ClubFlow — `apps/admin`, module **Gestion des membres** (Annuaire, Familles & payeurs). Aucun changement API requis si la logique métier existante suffit.

## 1. Objectif

- Aligner l’**Annuaire** sur le pattern **liste + tiroir** déjà utilisé pour **Familles & payeurs** : pas de panneau « Nouvelle fiche / Modifier la fiche » visible en permanence.
- Mettre la **modification** d’une fiche membre dans un **drawer** superposé au contenu.
- Déporter **Nouvelle fiche** et **Nouveau foyer** vers des **pages dédiées** sous `MembersLayout`, avec **retour** explicite et historique navigateur cohérent (routes, pas overlay sans URL).
- **CTA** : boutons **« Nouveau membre »** et **« Nouveau foyer »** **très visibles** (voir §4.5).

## 2. Décisions produit

| Sujet | Décision |
|--------|----------|
| Création membre | Route **`/members/new`** (recommandation issue du choix **C** : préférence routes vs modale plein écran). |
| Création foyer | Route **`/members/families/new`**. |
| Édition membre | **Drawer** latéral large (même famille visuelle que la fiche foyer), **sans** changement d’URL pour l’édition. |
| Navigation retour | `Link` / `useNavigate` vers liste ; **pas** de `replace` à l’entrée sur `/new` pour préserver le bouton Précédent. |
| État global drawer membre | **`drawerMemberId`** dans le contexte membres (aligné sur `drawerFamilyId`) pour ouverture depuis palette, tiroir foyer, etc. |
| Bloc « Famille » sur la fiche | **Intégré dans le tiroir membre** (section Foyer : rattacher / détacher / payeur) ; **éviter** une modale superposée au drawer sauf contrainte technique. |
| Spec UX drawer foyer (2026-03-30) | L’annuaire **évolue** : le §4.4 de la spec « drawer famille & palette » qui décrit un panneau latéral permanent pour création/édition est **remplacé** par la présente spec pour l’édition et la création membre. |

## 3. État actuel (rappel)

- **Annuaire** : tableau + **aside** permanent formulaire création/édition + modale « Foyer ».
- **Familles** : liste + **aside** « Nouveau foyer » + **drawer** pour fiche foyer existante.

## 4. Comportement UX cible

### 4.1 Annuaire — liste

- Une **liste principale** (tableau en pleine largeur), recherche prénom/nom inchangée.
- **Disparition** du panneau latéral fixe « Nouvelle fiche / Modifier la fiche ».
- **Clic sur la ligne** (zone de contenu de la ligne) ouvre le **`MemberDetailDrawer`** pour le membre concerné. Les actions **Foyer** (si conservée comme bouton distinct), **Supprimer** et tout contrôle qui ne doit pas ouvrir le drawer utilisent **`stopPropagation`** sur le clic.
- **Bouton « Modifier »** : peut être retiré si redondant avec le clic ligne, ou conservé comme raccourci explicite (même effet : ouvrir le drawer).

### 4.2 Annuaire — drawer « Fiche membre »

- **En-tête** : nom affiché, bouton **Fermer**, fond assombri, fermeture **Échap** (comme fiche foyer).
- **Formulaire** : champs identiques à l’édition actuelle (prénom, nom, naissance, grade, rôles système, rôles club).
- **Section Foyer** : rattachement à un foyer existant, création de foyer depuis ce membre, détachement, définition payeur — réutiliser les mutations et confirmations déjà en place.
- **Actions** : enregistrer, annuler / fermer, supprimer la fiche (avec confirmation), selon l’existant.
- **Accessibilité** : `aria-modal` sur le drawer ; titre et focus gérés de façon cohérente avec `FamilyDetailDrawer`.

### 4.3 Page `/members/new` — Nouveau membre

- Contenu = **formulaire de création** actuellement dans l’aside annuaire (champs + soumission `createClubMember`).
- **En-tête** : titre « Nouvelle fiche », lien ou bouton **Retour à l’annuaire** (`/members`) très lisible.
- Après succès : redirection vers **`/members`** et **ouverture du drawer** sur le nouveau membre **ou** simple retour liste avec message ; **préférence produit** : ouvrir le drawer sur le membre créé si l’ID est disponible dans la réponse mutation (meilleure continuité).

### 4.4 Familles & payeurs

- Liste + recherche ; **suppression** du aside « Nouveau foyer » fixe.
- **Drawer** `FamilyDetailDrawer` inchangé pour les foyers existants.
- Page **`/members/families/new`** : formulaire actuel du aside (libellé, payeur, membres cochés, création).

### 4.5 CTA très visibles — « Nouveau membre » et « Nouveau foyer »

**Exigence validée par le demandeur.**

- **Annuaire** : dans la zone **hero** (ou immédiatement sous le titre), une **rangée d’actions** avec un bouton principal **`btn btn-primary`** (libellé **« Nouveau membre »**), **taille et contraste** suffisants pour être la **première action** visuelle de la page (pas un lien texte seul).
- **Familles & payeurs** : même principe — bouton principal **« Nouveau foyer »** menant à **`/members/families/new`**, placé dans le hero ou aligné à droite du titre, **visible sans faire défiler** sur viewport bureau courant.
- **Cohérence Stitch** : réutiliser les classes boutons existantes ; si besoin, une classe utilitaire **mineure** (ex. marge ou taille) pour renforcer la hiérarchie **sans** nouveau design system parallèle.
- **Accessibilité** : libellé explicite ; le bouton reste un vrai `<a>` ou `<button>` selon implémentation (`Link` stylistiquement bouton primaire).

## 5. Palette de commande (Cmd+K)

- Remplacer / compléter **`annuaireMemberIntent`** par **`drawerMemberId`** : action « ouvrir la fiche » = **navigation vers `/members` si besoin** + **`setDrawerMemberId(id)`**.
- Si le drawer foyer est ouvert, le comportement **« Ajouter au foyer courant »** reste aligné sur la spec palette existante.

## 6. Routage React

Sous `MembersLayout`, ajouter **avant** la route `families` la route la plus spécifique :

- `path="new"` → `NewMemberPage`
- `path="families/new"` → `NewFamilyPage`
- `path="families"` → `FamiliesPage` (inchangé)

Les URLs **`/members/new`** et **`/members/families/new`** restent **internes** au layout (sous-nav, palette, provider).

## 7. CSS

- Réutiliser les patterns **drawer** existants (`family-drawer-*` ou factorisation légère en préfixe partagé si ça réduit la duplication sans refactor massif).

## 8. Tests & validation

- Manuel : CTA visibles, création membre/foyer, retour arrière, ouverture drawer au clic ligne, Cmd+K → drawer membre.
- Build admin : `npm run build`.

## 9. Hors périmètre

- Query GraphQL dédiée « membre par id » (tant que les données `clubMembers` suffisent).
- Recherche serveur.

## 10. Références

- `docs/superpowers/specs/2026-03-30-membres-ux-drawer-famille-palette-design.md` (drawer foyer & palette — sections annuaire **édition** remplacées ici).
- `docs/superpowers/specs/2026-03-30-familles-membres-rattachement-recherche-design.md` (règles foyer / payeur).
