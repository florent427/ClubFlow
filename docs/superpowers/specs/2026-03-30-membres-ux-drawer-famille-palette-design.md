# Spécification — UX Gestion des membres : drawer fiche foyer & palette de commande

**Date :** 2026-03-30  
**Statut :** validée par le demandeur (échanges 2026-03-30)  
**Périmètre :** administration ClubFlow — module **Gestion des membres** (`apps/admin`) et API associée si nécessaire.

## 1. Objectif

- Rendre l’expérience **Gestion des membres** plus **fluide et intuitive**.
- Permettre une **recherche rapide** des membres pour : ouvrir leur contexte d’édition, les rattacher à un foyer, etc.
- Sur **Familles & payeurs** : **modifier** les foyers (libellé, composition, payeur) depuis une **fiche foyer dédiée** ; inclure une **recherche de membres** pour **ajouter** des personnes au foyer depuis cette fiche.
- Conserver la distinction produit : **rôles foyer** (payeur / membre) vs **rôles métier** (adhérent, coach, bureau, rôles club personnalisés).

## 2. Décisions produit (synthèse des arbitrages)

| Sujet | Décision |
|--------|----------|
| Présentation de la fiche foyer | **Drawer** large au-dessus de la liste — **pas** de changement d’URL (**B**). |
| Recherche membres | **C** — champs **contextuels** où nécessaire **et** **palette globale** type Spotlight pour usages intensifs. |
| « Changer les rôles » depuis palette / recherche globale | **C** — **foyer / payeur** gérés dans le **drawer** (et actions palette en contexte foyer) ; **rôles métier** dans l’**annuaire** / panneau « Modifier la fiche » ; la palette sert surtout à **trouver** et **ouvrir** la bonne vue. |

## 3. État actuel (baseline)

- **Annuaire** : tableau, recherche prénom/nom, panneau latéral création/édition, modale « Foyer » par membre.
- **Familles & payeurs** : liste des foyers, recherche sur **libellé**, création et suppression de foyer, pas de **fiche foyer** éditable ni recherche membres pour composition depuis la carte.
- **API** : mutations familles existantes (création, suppression, rattachement, transfert, définir payeur) ; **pas** de mutation documentée pour **mettre à jour le libellé** seul du foyer (à ajouter si absente au moment de l’implémentation).

## 4. Comportement UX cible

### 4.1 Liste « Familles & payeurs »

- Clic sur une ligne / carte → ouverture du **drawer** fiche foyer.
- Conserver la recherche par **libellé** sur la liste.
- Option UX : **mise en évidence** discrète de la carte du foyer dont le drawer est ouvert (lisibilité).

### 4.2 Drawer « Fiche foyer »

- **En-tête** : **libellé éditable** ; affichage **Payeur manquant** si `needsPayer` (donnée API existante).
- **Membres du foyer** : liste avec rôle foyer ; actions **Retirer du foyer**, **Définir payeur** (mutations alignées sur l’existant).
- **Ajouter un membre** : zone de **recherche** (prénom + nom, même périmètre que l’annuaire) sur les membres du club ; sélection puis ajout au foyer = **transfert** / rattachement avec les **règles métier et confirmations** déjà définies (transfert transactionnel, foyer sans payeur possible, etc. — voir spec rattachement du 2026-03-30).
- **Lien** vers l’**annuaire** / fiche pour agir sur les **rôles métier** (pas dans le drawer).
- **Fermeture** : `Échap`, clic sur fond assombri, bouton **Fermer**.
- **Accessibilité** : titre du foyer exposé ; gestion du focus raisonnable dans le drawer (piège focus souhaitable en V1 si faible coût).

### 4.3 Palette de commande globale

- **Raccourci** : **Ctrl+K** (Windows/Linux) / **Cmd+K** (macOS).
- Disponible sur les routes sous **Gestion des membres** (`/members` et sous-routes : annuaire, grades, rôles, familles).
- **Recherche** sur membres (prénom + nom) ; résultats menant à **Ouvrir l’annuaire** (mettre en évidence la ligne / ouvrir le panneau d’édition selon ce que le plan d’implémentation retiendra).
- **Contexte** : si le **drawer foyer** est ouvert, proposition d’action du type **« Ajouter au foyer courant »** pour un membre sélectionné (sans édition des rôles métier dans la palette).
- **V1** : filtrage **côté client** sur la liste des membres déjà chargée ; **évolution** : argument GraphQL `search` documenté hors périmètre immédiat.

### 4.4 Annuaire

- Conserver le **panneau latéral** pour création / édition (**rôles métier**, grades, rôles club).
- Recherche en tête de liste conservée ; la palette **complète** pour navigation rapide.

## 5. Données & API

- **Mise à jour libellé foyer** : exposer si nécessaire une mutation du type `updateClubFamily` (`id`, `label` optionnel) avec les mêmes gardes module **FAMILIES** / admin club.
- **Chargement drawer** : **phase 1** — données issues de `clubFamilies` + `clubMembers` avec **refetch** à l’ouverture ; **phase 2** (optionnelle) — query `clubFamily(id)` si volumétrie ou besoin de détail enrichi.
- Réutiliser les mutations existantes pour composition : `transferClubMemberToFamily`, `removeClubMemberFromFamily`, `setClubFamilyPayer`, `createClubFamily` (création depuis liste inchangée en principe).

## 6. Design system

- Cohérence **Stitch ClubFlow** : classes `members-*`, `cf-*`, typographie et tons existants pour drawer, palette overlay, listes et champs.

## 7. Tests & validation

- Vérifier au minimum : ouverture/fermeture drawer, édition libellé, recherche + ajout membre, badge payeur manquant.
- **E2E** souhaitable pour un flux critique (ou checklist manuelle documentée si e2e trop lourd).

## 8. Hors périmètre (cette spec)

- Nouvelle route `/members/families/:id` (URL dédiée non retenue pour la V1 — **drawer sans URL**).
- Édition des **rôles métier** dans la palette (uniquement navigation vers l’annuaire).
- Recherche serveur des membres (reportée en évolution).

## 9. Références

- [2026-03-30-familles-membres-rattachement-recherche-design.md](./2026-03-30-familles-membres-rattachement-recherche-design.md) — règles transfert / payeur / recherche Libellé vs prénom-nom.

---

## Revue interne

- Aligné sur les réponses **B**, **C**, **C**, **OK** final.
- Le choix **sauvegarde auto du libellé** vs **bouton Enregistrer** est laissé au **plan d’implémentation** (recommandation : bouton explicite en V1 pour limiter les appels API accidentels).
