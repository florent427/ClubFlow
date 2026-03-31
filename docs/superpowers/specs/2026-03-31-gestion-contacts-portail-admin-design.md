# Spécification — Gestion des contacts portail (back-office admin)

**Date :** 2026-03-31  
**Statut :** validée par le demandeur (brainstorming 2026-03-31)  
**Périmètre :** nouvelle entrée de navigation **« Contacts »** dans `apps/admin`, exposition GraphQL côté `apps/api` pour les **contacts club** (`Contact` Prisma), sans modifier le parcours d’inscription portail existant (`registerContact`).

**Références :** modèle `Contact` dans `apps/api/prisma/schema.prisma` (prospect / contact distinct de `Member`) ; portail [`2026-03-31-portail-membre-mvp-design.md`](./2026-03-31-portail-membre-mvp-design.md).

---

## 1. Objectif

Permettre au **personnel club** (mêmes droits que pour **Gestion des membres**) de :

- **Lister et consulter** les personnes enregistrées comme **contacts** du club via l’écran d’inscription du portail membre ;
- **Modifier** le prénom et le nom affichés sur la fiche contact club ;
- **Promouvoir** un contact en **membre club** avec une création **minimale** en une action, puis compléter la fiche depuis l’annuaire ;
- **Supprimer** un contact **sous conditions** (révocation d’accès portail côté contact lorsque autorisé).

Les écrans **Contacts** et **Gestion des membres** restent **deux silos distincts** dans le menu (pas de vue fusionnée).

---

## 2. Règles métier

### 2.1 Cohabitation `Contact` + `Member`

- Après **promotion**, les enregistrements **`Contact`** et **`Member`** peuvent **coexister** pour le **même `User`** au sein du même club.
- Le **dédoublonnage** fonctionnel repose sur **le compte** (même `User`, donc **même e-mail**) : l’API expose pour chaque contact des indicateurs du type **membre lié** (`linkedMemberId` nullable) et **suppression autorisée** (`canDeleteContact`), calculés **côté serveur** (pas de jointure par e-mail uniquement côté client).
- **Noms (`Contact` vs `Member`) au MVP :** une mise à jour des prénom/nom **sur la fiche `Contact`** **ne modifie pas** les champs `Member.firstName` / `Member.lastName` du membre lié. Pour aligner l’annuaire, le personnel édite la **fiche membre** dans **Gestion des membres**.

### 2.2 Suppression d’un membre (annuaire)

- La suppression d’un **membre** au club signifie le **retrait du lien membre** (`Member`) pour ce club ; le **`User`** et le **`Contact`** associés **ne sont pas supprimés** par cette opération. Les **contacts restent** visibles dans « Contacts ».

### 2.3 Suppression d’un contact

- **Interdite** tant qu’existe un **`Member`** du **même club** pour le **même `User`** que ce contact (équivalent métier : « un membre existe pour la même adresse e-mail / le même compte »).
- Lorsque la suppression est **autorisée**, elle retire la ligne **`Contact`** (club + user). Le comportement exact du portail pour un `User` qui n’a plus ni `Member` ni `Contact` pour ce club doit **rester aligné** sur les règles déjà en place (accès refusé si aucun profil contact/membre pour ce club).

### 2.4 Promotion « membre minimal »

- Une mutation dédiée **promouvoir le contact en membre** crée un **`Member`** avec le **minimum de champs** requis par le modèle / validations existantes.
- **Remplissage champs `Member` (aligné Prisma actuel) :**
  - `userId` : celui du `Contact` ;
  - `email` : **`User.email`** (même valeur que le compte) ;
  - `firstName` / `lastName` : reprise des champs **`Contact`** au moment de la promotion ;
  - `civility` : l’enum `MemberCivility` n’admet que `MR` / `MME` — au **MVP**, utiliser une **valeur par défaut documentée en implémentation** (ex. `MR`) ; l’admin **corrige** dans l’annuaire si besoin ;
  - absence de **mot de passe local** sur le `User` (ex. compte **OAuth** uniquement) : **n’est pas** un blocage à la promotion tant que les autres garde-fous sont satisfaits.
- **Bloquant si :**
  - l’e-mail du `User` n’est **pas vérifié** (`emailVerifiedAt` absent) ;
  - un **`Member`** existe déjà pour ce `User` et ce club.
- **Succès :** retour de l’**identifiant membre** (ou équivalent) pour **lien direct** vers la fiche dans **Gestion des membres**.

### 2.5 Modification des noms (contact)

- Champs éditables au **MVP** : **prénom** et **nom** sur **`Contact`**.
- **E-mail :** **non éditable** depuis l’écran Contacts au MVP (éviter incohérences auth et clé de dédoublonnage).
- Lors d’une mise à jour prénom/nom, mettre à jour **`User.displayName`** dans la **même transaction** au format `« Prénom Nom »` (trim, cohérence avec `registerContact` qui renseigne `displayName`).
- **`User.displayName` est unique au niveau compte :** une modification depuis le **contact d’un club** met à jour ce champ pour **tout le `User`** (y compris si le même compte a des profils dans d’autres clubs). **Effet de bord accepté au MVP** ; documenter en UI si pertinent.

### 2.6 Droits

- **Même périmètre** que la **Gestion des membres** : tout staff déjà autorisé à l’annuaire pour ce club dispose des mêmes opérations sur les contacts (liste, fiche, mise à jour, promotion, suppression selon règles).

---

## 3. Interface admin (`apps/admin`)

### 3.1 Navigation

- Nouveau lien de sidebar **« Contacts »** au **même niveau** que **« Gestion des membres »** (non imbriqué sous Membres).

### 3.2 Liste

- Tableau avec recherche / tri de base ; filtres MVP utiles : par ex. **e-mail vérifié / non vérifié** si l’API expose ces données.
- Colonnes indicatives : noms, e-mail, statut vérification, **badge ou libellé** si **aussi membre** (doublon fonctionnel), lien **ouvrir le membre** si `linkedMemberId` présent.

### 3.3 Fiche / panneau

- Affichage aligné sur les patterns existants (drawer ou page) des autres listes admin.
- Actions : **Enregistrer** (prénom/nom), **Promouvoir en membre**, **Supprimer le contact** (désactivée ou avec explication si `canDeleteContact === false`).

### 3.4 Messages d’erreur (extrait)

- Suppression refusée : *« Impossible de supprimer ce contact tant qu’une fiche membre existe pour ce compte. Retirez d’abord le membre depuis l’annuaire si nécessaire. »* (libellé final harmonisé avec le ton de l’admin.)
- Promotion refusée : **e-mail non vérifié** ; **déjà membre**.

---

## 4. API GraphQL (`apps/api`)

### 4.1 Emplacement

- **Module / resolver dédiés** « contacts club » (noms d’implémentation libres), avec **mêmes garde-fous** (JWT club, rôle staff) que les opérations actuelles sur les membres du club.

### 4.2 Opérations indicatives

| Opération | Rôle |
|-----------|------|
| Query liste paginée | Contacts du `clubId` contexte ; champs enrichis : e-mail, `emailVerified`, `linkedMemberId`, `canDeleteContact`, etc. |
| Query fiche | Idem pour un `contactId` du club. |
| Mutation `updateClubContact` | Prénom/nom `Contact` + sync `User.displayName`. |
| Mutation `deleteClubContact` | Vérif membre lié ; sinon suppression `Contact`. |
| Mutation `promoteContactToMember` | Création membre minimal ; garde-fous §2.4. |

Les noms exacts des types et champs peuvent être ajustés tant que la sémantique est conservée.

### 4.3 Pagination

- Réutiliser le **même style** (cursor ou offset) que la liste membres admin pour homogénéité.

---

## 5. Traçabilité (MVP)

- Pas d’audit événementiel obligatoire : **`createdAt` / `updatedAt`** sur `Contact` suffisent.

---

## 6. Tests

- **Unitaires / service :** règle `canDelete` vs présence `Member` ; promotion refuse si non vérifié ou déjà membre ; mise à jour synchronise `displayName`.
- **E2E GraphQL (si infra existante) :** scénario suppression OK après retrait membre ; scénario suppression refusée avec membre présent ; scénario promotion puis présence du membre.

---

## 7. Hors périmètre (MVP explicite)

- Modification de l’**e-mail** depuis Contacts.
- Historique d’audit détaillé des actions admin sur contacts.
- Fusion automatique des lignes Contact / Member dans une vue unique (le menu reste séparé ; la liste Contacts peut afficher un **indicateur** « aussi membre »).

---

## 8. Prochaine étape (implémentation)

Après relecture de ce document : produire un **plan d’implémentation** (skill `writing-plans`) — **aucun code** avant ce plan validé en session d’implémentation.
