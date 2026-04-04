# Spécification — Paramètres, fiche membre évolutive et champs configurables

**Date :** 2026-03-30  
**Statut :** validée par le demandeur (échanges : périmètre **C**, option **B** pour champs perso)  
**Périmètre :** API NestJS / GraphQL / Prisma (`apps/api`), administration (`apps/admin`). Portail adhérent : **pas d’UI en V1** ; le modèle et l’API portent déjà les flags nécessaires.

## 1. Objectifs

- Offrir une **fiche membre évolutive** : champs du **catalogue** (modèle `Member`) **affichables / ordonnés / contraints** selon la config du club ; **champs personnalisés** en plus.
- Introduire un **menu Paramètres** et une **page paramètres** **extensible** pour d’autres réglages futurs (facturation, communication, etc.).
- **V1 champs personnalisés** : chaque définition inclut un booléen **`visibleParAdherent`** (« visible par l’adhérent ») pour préparer le portail membre **sans** implémenter ce portail en V1.

## 2. Décisions produit (synthèse)

| Sujet | Décision |
|--------|-----------|
| Modèle de configurabilité | **C** — catalogue officiel + extensions personnalisées. |
| Stockage technique | **Hybride** — colonnes `Member` pour le catalogue ; **EAV normalisé** (définition + valeurs) pour les champs perso. |
| Hub paramètres | Route **`/settings`**, libellé UI **Paramètres** ; sous-route initiale type **`/settings/member-fields`**. |
| Champs perso — visibilité adhérent | **B** — dès V1, booléen sur la définition (**visible par l’adhérent**). API et schéma prêts ; UI adhérent hors scope V1. |
| Noyau non négociable | **Prénom** et **nom** (ou équivalent identité minimum défini en implémentation) restent **toujours obligatoires et affichés** ; non désactivables dans les paramètres. |

## 3. Navigation & structure admin

- **Sidebar** (`AdminLayout`) : entrée **Paramètres** (icône type `settings`), section **Administration** ou équivalent.
- **`/settings`** : page **hub** (cartes / liens vers sous-sections) ; texte d’introduction indiquant que d’autres blocs arriveront.
- **Première sous-page** : configuration **Fiche adhérent** / **Champs de la fiche membre** → `/settings/member-fields` (slug technique ; libellé FR dans l’UI).
- Design **Stitch / ClubFlow** existant : réutiliser `cf-*`, `members-*` ou équivalent pour cohérence.

## 4. Comportement — page « Champs de la fiche membre »

### 4.1 Bloc A — Champs du catalogue (modèle)

- Liste des champs **mappés** sur des colonnes `Member` (ex. `email`, `phone`, `addressLine`, `postalCode`, `city`, `birthDate`, `photoUrl`, `medicalCertExpiresAt`, … — liste exhaustive figée dans le plan d’impl. alignée sur le schéma).
- Par champ : **`activeSurFiche`** (afficher dans le formulaire admin fiche membre), **`obligatoire`** si applicable (respecter contraintes DB : si colonne nullable, obligation = validation métier côté API à l’update/create), **`ordreAffichage`** (entier).
- Champs **identité minimum** : non listés comme désactivables ou traités à part (toggle désactivé ou absents de la liste « masquable »).

### 4.2 Bloc B — Champs personnalisés (extensions)

- CRUD des définitions (admin club) : **`code`** stable (slug unique par club, généré ou saisi selon règles de validation), **`libelle`**, **`type`** : au minimum `TEXT`, `TEXT_LONG`, `NUMBER`, `DATE`, `BOOLEAN`, `SELECT` (options stockées sur la définition ou table liée — à trancher en impl., JSON array acceptable en V1 si simple).
- Par définition : **`obligatoire`**, **`ordreAffichage`**, **`visibleParAdherent`** (booléen, **V1**).
- Suppression d’une définition : politique à documenter (soft-delete vs hard-delete + purge valeurs) — **recommandation V1** : hard-delete interdit si valeurs existent **ou** soft-delete `archivedAt` ; préférence produit à confirmer en impl. (défaut proposé : **archivage** pour ne pas casser l’historique).

### 4.3 Droits

- Même niveau que la gestion des membres : **administrateurs club** (gardes existants `ClubAdminRoleGuard`, contexte club).

## 5. Fiche membre (admin)

- **`MemberDetailDrawer`** (et **`NewMemberPage`** si champs catalogue concernés) : construction du formulaire à partir de :
  - la **config catalogue** (ordre + visibilité + obligatoire) ;
  - le bloc **Champs personnalisés** ordonné.
- Sauvegarde : mutation(s) **`updateMember`** enrichie et/ou mutation dédiée **`setMemberCustomFieldValues`** selon choix d’API (éviter payloads ambigus — préférence : **une mutation** `updateMember` avec input optionnel `customFields: [{ definitionId, value }]` pour atomicité).
- Affichage annuaire (tableau) : **hors scope** évolution V1 sauf décision contraire — les colonnes tableau restent identifiables (nom, foyer, etc.) ; les champs config n’élargissent pas le tableau en V1.

## 6. Données & API (Prisma / GraphQL)

### 6.1 Nouvelles tables (proposition)

- **`ClubMemberFieldCatalogSetting`** (ou nom aligné conventions) : `clubId`, `fieldKey` (enum ou string contrôlée), `showOnForm`, `required`, `sortOrder`, timestamps. Unique (`clubId`, `fieldKey`).
- **`MemberCustomFieldDefinition`** : `clubId`, `code`, `label`, `type`, `required`, `sortOrder`, `visibleToMember` (bool, map « visible par l’adhérent »), `optionsJson` nullable (pour SELECT), `archivedAt` nullable, timestamps. Unique (`clubId`, `code`).
- **`MemberCustomFieldValue`** : `memberId`, `definitionId`, `valueText` nullable (ou colonnes typées + une valeur « canonical » en texte pour recherche future — **V1** peut n’utiliser qu’une colonne texte + validation par type côté service).

### 6.2 GraphQL (code-first)

- Types : définition, paramètre catalogue, valeur exposée sur `Member` (ex. `customFieldValues: [MemberCustomFieldValueGraph!]!`).
- Queries : liste paramètres catalogue + définitions (filtrer `archivedAt` null pour l’édition courante).
- Mutations : `upsertClubMemberCatalogFieldSettings`, CRUD définitions (create/update/archive), `updateMember` étendu pour valeurs perso.

### 6.3 Portail adhérent (futur)

- Les requêtes « self » pourront filtrer les définitions avec **`visibleToMember`** et les valeurs associées — **non implémenté en V1**.

## 7. Migration & initialisation

- À la **première lecture** ou par **migration de données** : générer des lignes `ClubMemberFieldCatalogSetting` par club pour tous les `fieldKey` connus, avec défauts raisonnables (`showOnForm` cohérent avec l’UI actuelle pour ne pas régresser).

## 8. Tests & validation

- Unitaires : validation des types de valeurs perso, règles obligatoire + catalog minimum identity.
- E2E optionnel : activer un champ catalogue masqué puis vérifier disparition sur fiche ; créer champ perso + saisie sur membre.

## 9. Hors périmètre V1

- UI portail adhérent pour saisie / lecture des champs `visibleToMember`.
- Recherche / filtre annuaire sur champs perso.
- Édition en masse / import CSV des champs perso.

## 10. Références

- `apps/api/prisma/schema.prisma` — modèle `Member`.
- `docs/superpowers/specs/2026-03-30-annuaire-tiroir-creation-routes-design.md` — fiche membre en tiroir.
- `apps/admin/src/components/AdminLayout.tsx` — navigation.
