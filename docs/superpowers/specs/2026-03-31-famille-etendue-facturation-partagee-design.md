# Spécification — Famille étendue, contacts / membres et facturation partagée

**Date :** 2026-03-31  
**Statut :** implémentation API / admin / portail en cours (2026-04-01) — spec de conception gelée ; PDF reçus = itération ultérieure (données `paidBy*` exposées).  
**Périmètre :** évolution du modèle **foyer** (`Family`), introduction d’un **groupe foyer étendu** pour parents séparés multi-résidence, **accès portail**, **dette comptable unique** avec **sous-vues par contributeur**, **pièces PDF / exports** au **nom du payeur réel**  

---

## 1. Contexte et écart avec l’existant

### 1.1 État actuel (référence code)

- **`Family` + `FamilyMember`** : rôles `PAYER` et `MEMBER` ; règle métier **un payeur explicite** lorsque plusieurs membres (`validateFamilyCreationInput`, `computeFamilyNeedsPayer`).
- **`Invoice`** : `familyId` optionnel, facture rattachée à un foyer unique ; **`Payment`** sans champ **payeur membre** explicite dans le schéma Prisma actuel (`Payment` : `invoiceId`, `amountCents`, `method`, etc.).
- **Portail membre** : `FamiliesService.listViewerProfiles` — l’utilisateur voit tous les **membres actifs** des **mêmes familles** que ses fiches `Member` liées par `userId`.

### 1.2 Besoins métier validés en brainstorming

| Sujet | Choix retenu |
|--------|----------------|
| Partage des frais | **C** — Sous-comptes / budgets par parent (acomptes, dettes « internes »), **une seule dette club** pour le foyer étendu, **n’importe quel** parent autorisé peut solder le solde global ; **traçabilité** des paiements pour les pièces. |
| Pièces comptables | **B** — Selon **qui paie l’écriture**, le **PDF / export** peut être émis **au nom du parent qui a effectivement réglé** ; **plusieurs modèles** de pièces selon le type de mouvement. |
| Structure résidence | **B** — **Deux (ou plus) foyers `Family` distincts** (résidences), reliés par une notion de **famille étendue** pour **enfants** et **facturation**. |

---

## 2. Concepts métier et données (section design 1)

### 2.1 Définitions

- **`Family` (foyer)** : unité « résidence / organisation » côté club (parents et éventuellement enfants rattachés pour l’annuaire et les règles locales).
- **`HouseholdGroup` (nom provisoire)** : regroupe **plusieurs `Family`** d’un même club pour représenter **une famille étendue** (ex. parents séparés, deux foyers). Porte la **cohérence facturation** : **dette unique** au niveau club pour ce groupe.
- **`Member`** : personne physique ; adultes avec compte portail via `userId` ; enfants typiquement sans compte (évolution possible plus tard).

### 2.2 Cible schéma (évolution)

- Lier chaque `Family` concernée au **`HouseholdGroup`** (relation nullable pour rétrocompatibilité : foyers non groupés = comportement actuel).
- Faire évoluer **`Invoice`** pour rattachement **prioritaire au groupe** (ex. `householdGroupId`) ; phase transitoire documentée : **foyer porteur** conservant `familyId` pour limiter la régression (voir §6).
- Étendre **`Payment`** avec **`paidByMemberId`** **nullable** : obligatoire dès qu’un **membre du groupe** initie ou est identifié comme payeur réel ; **nullable** uniquement pour les **encaissements club catalogués** (ex. espèces saisies par l’admin sans fiche payeur, correction comptable) — liste des motifs et contrôle d’accès à définir en implémentation, avec traçabilité `createdByUserId` / note si besoin.

### 2.3 Rôle `PAYER` historique

- Tant que le module s’appuie sur `FamilyMemberLinkRole.PAYER`, préciser en implémentation : soit **alignement** sur le groupe (un payeur « titulaire » pour relances / convention club), soit **dépréciation progressive** au profit du groupe + payeur par opération. La spec **exige** la traçabilité **par paiement** ; le titulaire foyer peut rester un **champ de convenance** pour les documents « appel » si le club le configure.

---

## 3. Accès portail (section design 2)

### 3.1 Sélecteur de profils

- Étendre la logique des **profils visionneur** : à partir des `Family` du `user`, résoudre le(s) **`HouseholdGroup`**, puis autoriser l’accès aux profils listés en **§3.1.1**.
- **Par défaut** : **pas** d’accès au profil portail **de l’autre adulte** (co-parent) comme profil sélectionnable — uniquement **soi + enfants** au sens §3.1.1 — sauf future fonction « co-tutelle étendue » explicite.

#### 3.1.1 Règle vérifiable « enfant / profil enfant » (source de vérité API)

Critères **cumulatifs** pour qu’un `Member` `m` soit sélectionnable comme profil « enfant » par un parent `p` (même `HouseholdGroup`, même `clubId`) :

| # | Condition | Détail |
|---|-----------|--------|
| 1 | Rattachement groupe | `m` est lié au `HouseholdGroup` (via une `Family` du groupe : `FamilyMember` sur une `familyId` dont `family.householdGroupId` = groupe de `p`). |
| 2 | Minorité | `m.birthDate` défini **et** âge strictement inférieur à 18 ans (calcul au fuseau documenté club, même règle que côté tarification / droit si déjà présent). |
| 3 | Statut | `m.status === ACTIVE`. |

- **Majeur** rattaché au groupe (enfant majeur adhérent) : **non** inclus dans les profils « enfant » par défaut ; accès **uniquement** si `m.userId ===` utilisateur connecté (profil « soi ») ou si une **règle produit future** l’autorise explicitement.
- **Ambiguïté** (naissance inconnue) : en l’absence de `birthDate`, le membre **n’est pas** traité comme profil enfant distant ; seul un **admin** peut corriger la fiche ou activer une règle d’exception documentée côté implémentation.

### 3.2 Création et rattachement

- **Première livraison** : création des foyers, du groupe étendu et rattachements **côté admin** (aligné sur pratique actuelle).
- **Évolutions ultérieures** : demandes depuis le portail (ajout enfant, invitation co-parent) avec **workflow de validation club** ; spécification produit séparée pour limiter le périmètre du présent document.

### 3.3 Sécurité

- Conserver le principe **403** si le `memberId` demandé n’est pas dans l’ensemble autorisé après résolution du groupe **sans** distinguer « inconnu » vs « interdit » dans le message client (énumération d’IDs).
- **Résolution systématique** : toute query sensible (`viewerMe`, facturation groupe, historique) vérifie **appartenance au `HouseholdGroup`** (ou legacy `Family`) **avant** chargement des agrégats ; pas d’hydratation « profonde » qui exposerait des champs co-parent par erreur.
- **Sélection de champs GraphQL** : types « viewer » **sans** champs réservés admin sur les fiches d’un tiers ; revue des resolvers pour éviter les fuites via relations.
- **Audit minimal (recommandé V1 groupe)** : journaliser consultation du **solde groupe** / liste des factures ouvertes (userId, householdGroupId, horodatage) ; journaliser **enregistrement paiement** avec `paidByMemberId`.
- **Tests de non-régression** : requêtes billing avec token parent A **ne** renvoient **aucune** donnée identitaire / profil exploitable du parent B (hors ce qui serait explicitement prévu par « co-tutelle étendue »).
- **`X-Club-Id` / JWT** : inchangé par rapport à la spec portail existante ; l’enfant reste un `Member` du club adhérent.

---

## 4. Facturation, sous-comptes et pièces (section design 3)

### 4.1 Dette

- **Un** solde « club » (factures ouvertes / historique) pour le **`HouseholdGroup`**, indépendamment du nombre de `Family`.

### 4.2 Paiements

- Tout encaissement **rattaché à un payeur membre** : montant, date, moyen, facture(s), **`paidByMemberId`** obligatoire (payeur réel). Exceptions **cataloguées** : `paidByMemberId` null (voir §2.2) avec audit admin.
- **Habilitation à payer sur le portail** : tout adulte (`Member` avec `userId` non null) dont au moins une fiche est rattachée à une **`Family` du `HouseholdGroup`** peut **initier** un règlement sur les factures de ce groupe. Le rôle historique `PAYER` sur une `Family` sert aux **relances / convention** et aux **documents d’appel** configurables, **pas** comme seule porte d’accès au paiement en ligne pour les autres adultes du groupe.

### 4.3 Sous-comptes

- **Vues dérivées** : agrégations par **`paidByMemberId`** (et règles optionnelles club : répartition, « reste dû » informatif entre parents). Les acomptes d’un parent **réduisent le solde global** ; la répartition sert à la **transparence** et aux **exports**, sans créer plusieurs dettes club involontaires.

### 4.4 PDF / exports (modèles multiples)

- **Reçus / attestations de paiement** : **nom et identité du membre** ayant payé (`paidByMemberId`).
- **Appels de cotisation / factures** : paramétrage club : nom **foyer / titulaire** vs **payeur effectif** selon type de document ; exigence de **cohérence comptable** : lien facture ↔ paiements ↔ payeur réel toujours traçable.
- Catalogue des **templates** par type de pièce et par club (évolution progressive).

### 4.5 UI « espace commun »

- **MVP interface** : solde global, historique des mouvements, filtre « payé par », liste des membres du groupe. **Itérations** : notes, engagements de répartition, notifications entre parents — hors périmètre minimal sauf besoin exprimé.

### 4.6 Règles de cohérence

- Interdiction d’enregistrer un paiement avec **`paidByMemberId`** hors du `HouseholdGroup` de la facture.
- Gestion explicite du **trop-perçu** et des **remboursements** : à traiter dans le plan d’implémentation (non détaillé ici).

---

## 5. Architectures envisagées et recommandation

| Approche | Idée | Avantages | Inconvénients |
|----------|------|-----------|----------------|
| **1 — Groupe de facturation** | `HouseholdGroup` + factures / solde au niveau groupe | Aligné dette unique + traçabilité payeur | Migration API / Prisma plus large |
| **2 — Foyer porteur + liens** | `Invoice.familyId` sur un foyer, autres foyers liés, droits étendus | Moins de rupture immédiate | Règles tacites, dette « syntaxiquement » sur une famille |
| **3 — Double rattachement enfant** | Même enfant dans deux `Family` sans groupe | Réutilise beaucoup le schéma actuel | Risque de doubles comptes si pas de couche groupe |

**Recommandation :** viser **1** comme **cible** ; autoriser **2** comme **étape transitoire** documentée si besoin de livrer le portail / permissions avant la migration complète des factures.

---

## 6. Migration et compatibilité

- Foyers **sans** `HouseholdGroup` : comportement **identique** à aujourd’hui (facture `familyId`, payeur `PAYER` unique).
- Introduction progressive : remplir `HouseholdGroup` pour les cas séparés ; **script ou assistant admin** pour « fusionner » deux foyers existants en un groupe **sans dupliquer** les `Member` enfants.

### 6.1 Foyer porteur (phase transitoire, approche 2)

- **Désignation** : choix **manuel** par l’admin au moment de la création du `HouseholdGroup` (famille qui conserve `invoice.familyId` jusqu’à migration complète vers `householdGroupId`), **ou** règle par défaut documentée (ex. foyer où se trouve le membre marqué `PAYER` « historique ») — **une seule** vérité par groupe pendant la coexistence.
- **Changement de porteur** : réservé admin ; les **anciennes factures** gardent leur `familyId` d’émission ; les **nouvelles** utilisent le porteur courant ou le groupe selon l’étape de migration.
- **Lecture** : les services agrègent les factures **par groupe** pour le portail dès que `householdGroupId` est renseigné sur la facture ou dérivé du porteur + règle de cohorte (à figer en implémentation).

### 6.2 Phases de bascule

1. **Phase A — Schéma** : ajout `HouseholdGroup`, relations `Family` → groupe, `Invoice.householdGroupId` nullable, `Payment.paidByMemberId` nullable.
2. **Phase B — Double lecture** : factures avec seulement `familyId` rétrogradées comme « groupe singleton » implicite ; nouvelles entités groupe lisent `householdGroupId` en priorité avec repli sur porteur.
3. **Phase C — Écriture portail** : paiements avec `paidByMemberId` pour les flux membres ; règles admin pour null documentées.
4. **Phase D — Optionnel** : bascule des factures historiques (data migration) ; **rollback** : désactivation feature groupe **sans** supprimer les colonnes ; retour arrière données seulement si script inverse validé.

Pendant les phases B–C, **exports comptables** et intégrations (webhooks Stripe, etc.) doivent être **testés** sur cohortes pilotes ; tout changement d’identifiant métier exposé hors base est listé dans les notes de release.

---

## 7. Critères d’acceptation produit (vérifiables)

1. **Admin** : créer un `HouseholdGroup`, rattacher **au moins deux** `Family`, affecter les mêmes enfants au bon groupe **sans** duplication de personne.
2. **Portail** : deux parents (`userId` distincts) voient **le même solde / factures ouvertes** du groupe ; **ni l’un ni l’autre** ne peut sélectionner le profil portail **de l’autre adulte** (jeux de tests §8).
3. **Portail** : chaque parent peut sélectionner **ses** enfants **mineurs** du groupe selon §3.1.1 ; un majeur du groupe sans `userId` n’apparaît pas comme profil enfant distant.
4. **Paiement** : enregistrement avec un `paidByMemberId` **hors** membres du `HouseholdGroup` de la facture → **rejet** métier.
5. **Paiement** : un parent non `PAYER` historique peut tout de même **régler** une facture du groupe (habilitation §4.2).
6. **Documents** : un **reçu** généré après paiement porte l’**identité du payeur réel** (`paidByMemberId`).
7. **Sous-vue** : l’espace groupe affiche un **historique agrégé** et un **filtre ou colonne** « payé par » cohérent avec les paiements.
8. **Rétrocompatibilité** : foyer **sans** groupe → comportement facturation / portail **inchangé** par rapport au comportement documenté avant cette spec.

---

## 8. Tests (exigences)

- Unitaires : résolution **groupe** à partir d’un membre ; construction **viewerProfiles** avec filtres adulte / enfant ; validation **paidByMemberId** ∈ groupe de la facture.
- Intégration / e2e : scénario **deux foyers**, un groupe, **deux `userId`**, même enfant visible par les deux parents, **pas** de profil co-parent croisé (sauf override futur) ; enregistrement paiement et **export** avec bon **payeur affiché**.

---

## 9. Dépendances

- Spec portail membre : `2026-03-31-portail-membre-mvp-design.md` (garde viewer, `viewerFamilyBillingSummary` à faire évoluer vers le **groupe**).
- Module paiements existant : `Invoice`, `Payment`, services associés dans `apps/api`.

---

## 10. Prochaines étapes

1. Relecture humaine de ce document.
2. Skill **writing-plans** : plan d’implémentation daté dans `docs/superpowers/plans/`, avec ordre de migrations Prisma, API GraphQL et adaptations admin / portail.

---

*Document rédigé suite au brainstorming famille étendue et facturation partagée (2026-03-31).*
