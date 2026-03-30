# Spécification — Familles & payeurs : rattachement depuis la fiche membre et recherche

**Date :** 2026-03-30  
**Statut :** validée par le demandeur (échanges 2026-03-30)  
**Périmètre :** administration ClubFlow (`apps/admin` + `apps/api`)

## 1. Objectif

- Permettre sur la **fiche membre** de **rattacher** un membre à un foyer, de le **détacher**, ou de **créer un nouveau foyer** incluant ce membre.
- Permettre une **recherche par mot-clé** :
  - **Annuaire membres** : prénom et nom ;
  - **Familles & payeurs** : libellé du foyer uniquement.

## 2. Décisions produit (rappel)

| Sujet | Décision |
|--------|----------|
| Rattachement depuis la fiche | **C** — rejoindre un foyer existant **ou** créer un nouveau foyer (réutiliser la logique métier actuelle de création de foyer). |
| Recherche | **A** — membres : prénom + nom ; foyers : libellé uniquement. |
| Changement de foyer | **A** — **transfert en une transaction** (suppression du lien précédent + création du nouveau), avec **confirmation explicite** dans l’UI. |
| Payeur qui quitte un foyer où il reste d’autres membres | **B** — **pas de blocage** ; le foyer peut être **sans payeur** jusqu’à correction ; **signalement visible** côté admin. |

## 3. État actuel (baseline)

- Prisma : `Family`, `FamilyMember` (rôle `PAYER` \| `MEMBER`), un membre ne doit pas être dans deux foyers (vérification à la création de foyer).
- API : `clubFamilies`, `createClubFamily`, `deleteClubFamily`. Pas de mutation d’ajout / retrait / transfert unitaire.
- Admin : création de foyer sur `FamiliesPage` ; pas de bloc « foyer » sur `MembersDirectoryPage` ; pas de filtre recherche.

## 4. Modèle de données / exposition GraphQL

### 4.1 Membre (admin)

Enrichir le type GraphQL membre (ex. `MemberGraph` ou équivalent) avec :

- `family` (nullable) : `{ id, label }` — foyer courant ;
- `familyLink` (nullable) : `{ id, linkRole }` — identifiant de la ligne `FamilyMember` et rôle.

Ces champs sont dérivés de `FamilyMember` ; pas de duplication en base.

### 4.2 Foyer

Enrichir le type foyer avec :

- `needsPayer` (booléen) : `true` s’il existe au moins un `FamilyMember` pour ce foyer **et** aucun lien avec `linkRole === PAYER`.

Utilisé pour badge / liste sur `FamiliesPage` et cohérence avec la décision **B**.

## 5. Règles métier

1. **Un membre — au plus un foyer** à tout instant.
2. **Détacher** : suppression de la ligne `FamilyMember` pour ce `memberId`. Si c’était le seul membre, le foyer peut rester vide ou être supprimé — **à trancher en implémentation** : recommandation **ne pas** supprimer automatiquement le foyer (factures `familyId` optionnel) ; si le foyer n’a plus de membres, afficher le foyer vide ou proposer suppression manuelle (comportement actuel `deleteClubFamily`).
3. **Transfert vers foyer existant** : transaction : supprimer tout `FamilyMember` existant pour ce membre, puis créer le nouveau lien (validation club, membres actifs, contrainte un payeur par foyer lors de la création du lien `PAYER`).
4. **Créer un nouveau foyer depuis la fiche** : appeler la même logique que `createClubFamily` (payeur obligatoire, membres du club, pas déjà dans un autre foyer) — le membre courant peut être dans `memberIds` / `payerMemberId`.
5. **Promotion payeur** (même foyer) : opération distincte recommandée — mettre `PAYER` sur le membre cible et `MEMBER` sur l’ancien payeur (transaction, même club validé).
6. **Erreurs** : foyer ou membre hors club, membre inactif si la règle existante l’exige, tentative d’ajout sans transfert alors que le membre a déjà un foyer (évité par la mutation de transfert unique).

## 6. API (proposition de surface)

- `removeClubMemberFromFamily(memberId: ID!): Boolean` — détache le membre (idempotent si déjà seul).
- `transferClubMemberToFamily(memberId: ID!, familyId: ID!, linkRole: FamilyMemberLinkRole!): FamilyGraph` (ou type dédié) — transfert transactionnel.
- `setClubFamilyPayer(memberId: ID!): ...` — le membre doit déjà être dans un foyer ; désigne ce membre comme seul payeur (anciens payeurs → `MEMBER`).
- Réutiliser `createClubFamily` pour la création depuis la fiche.

Guards / modules : identiques aux résolveurs familles (`FAMILIES`, admin club).

## 7. Interface admin

### 7.1 `MembersDirectoryPage`

- Section **Foyer** : affichage foyer courant + rôle ; sinon « Aucun foyer ».
- Actions : **Détacher** (avec confirmation si payeur) ; **Rejoindre un foyer** (sélection + rôle) ; **Créer un foyer** (formulaire compact ou lien vers flux existant prérempli).
- Transfert : modale de confirmation rappelant le risque **foyer sans payeur** si applicable.
- Champ **recherche** : filtre local sur prénom + nom (insensible à la casse, normalisation espaces).

### 7.2 `FamiliesPage`

- Filtre **recherche** sur libellé (local).
- Afficher **badge** « Payeur manquant » (ou équivalent Stitch) lorsque `needsPayer`.

## 8. Performance / évolution

- **Phase 1** : filtrage côté client sur listes déjà chargées.
- **Évolution** : arguments optionnels `search` sur `clubMembers` et `clubFamilies` si les volumes l’exigent.

## 9. Tests

- **Service** : détachement, transfert, `needsPayer` après départ du payeur, promotion payeur, rejet hors club.
- **E2E** (au moins un scénario) : rattachement → transfert → détachement ; foyer sans payeur visible.

## 10. Hors périmètre

- Recherche sur e-mail ou sur les noms des membres pour filtrer les foyers (non retenu — option **A**).
- Portail adhérent : non concerné par cette spec.

---

## Revue spec (interne)

- Cohérent avec les réponses utilisateur **C**, **A**, **A**, **B**.
- Le cas « foyer sans membre après détachement du dernier » est laissé à l’implémentation avec recommandation documentée §5.2.
