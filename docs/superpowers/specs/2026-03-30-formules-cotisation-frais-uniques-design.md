# Spécification — Formules de cotisation (annuel + mensuel), frais uniques, sans groupe tarifaire

**Date :** 2026-03-30  
**Statut :** validée en atelier (échanges 2026-03-30) ; document rédigé pour planification et migration  
**Périmètre :** modèle **produits d’adhésion**, **lignes de facture**, **admin** (paramètres + assistant sur fiche membre), **API** ; cohérence avec `[2026-03-30-adhesion-tarifs-groupes-remises-coupons-design.md](./2026-03-30-adhesion-tarifs-groupes-remises-coupons-design.md)` et **évolutions** explicites ci‑dessous.

## 1. Rapport avec la spec adhésion du 2026-03-30

La spec historique pose notamment :

- Cotisation portée par une **formule** liée à un **groupe dynamique** (`dynamicGroupId`) pour le **tarif** et l’**éligibilité**.
- Chaîne de remises sur la **formule** : prorata saison → famille → aide publique → exceptionnelle.
- `MemberDynamicGroup` pour l’**affectation** persistante membre ↔ groupe.

**La présente spec remplace ou précise** :

| Sujet | Avant (spec 2026-03-30) | Après (cette spec) |
|--------|-------------------------|---------------------|
| Lien formule ↔ groupe dynamique | Obligatoire pour tarif / éligibilité | **Supprimé pour le tarif** : la formule **ne** dépend **plus** d’un groupe pour le prix. Les **groupes dynamiques** restent pour **planning / communication / affectation membre**, sans servir de « groupe tarifaire ». |
| Montant cotisation | Un `baseAmountCents` | **Deux montants libres** : **annuel** et **mensuel** (aucun lien mathématique imposé par le produit). |
| Frais licence / dossier | Non explicités comme catalogue séparé | **Catalogue distinct** des **frais uniques**, sans critères d’éligibilité par membre. |
| Prorata + mensuel | Non détaillé | **Prorata saison** : **uniquement** sur parcours **annuel**. En **mensuel** : **pas** de prorata saison ; **le mois en cours est dû en entier** (plein tarif mensuel). |
| Remises sur frais uniques | N/A | **Aucune** remise automatique ; **seule** la **remise exceptionnelle** est permise sur les lignes frais uniques. |

**Conservé** (sauf contradiction ci‑dessus) : ordre des remises sur la **ligne cotisation** ; enchaînement avec **`ClubPricingRule`** après le total métier ; rôles / garde‑fous pour la remise exceptionnelle ; saison active pour le prorata **annuel** ; portail adhérent hors V1 sauf mention contraire.

## 2. Objectifs produit

1. Pour chaque **formule de cotisation récurrente**, exposer un **tarif annuel** et un **tarif mensuel** (**saisie indépendante**).
2. Permettre un **catalogue de frais d’adhésion à paiement unique** (licence, frais de dossier, etc.), **séparé** des cotisations.
3. Sur un **même brouillon / facture d’adhésion**, cumuler **une ligne cotisation** (selon rythme choisi) et **zéro ou plusieurs lignes** de frais uniques.
4. **Ne plus** utiliser le **groupe dynamique** comme condition de **tarif** ou de **filtrage des formules** ; l’**éligibilité** des formules de cotisation repose sur des **critères optionnels** portés par la formule.

## 3. Décisions produit (validées)

| Sujet | Décision |
|--------|----------|
| Groupes dynamiques et tarif | **Découplés** : pas de `dynamicGroupId` sur la formule cotisation. Les groupes restent utiles **ailleurs** (affectation membre, planning, com). |
| Éligibilité formule cotisation | **Hybride** : critères **optionnels** (âge min/max, grades) sur la formule. **Sans critère** → formule **ouverte à tous**. **Avec critères** → filtrage automatique selon profil membre. |
| Annuel vs mensuel | **Deux montants libres** ; pas de contrainte « mensuel × 12 = annuel ». |
| Prorata saison | **Uniquement** si la ligne cotisation est facturée sur la base **annuelle**. **Interdit** sur **ligne mensuelle**. |
| Mois en cours (mensuel) | **Dû en entier** au tarif mensuel de la formule (pas de prorata « dans le mois » pour l’entrée en cours de saison). |
| Frais uniques | **Catalogue séparé** ; **même montants pour tous** ; **pas** de critères d’éligibilité. |
| Remises sur frais uniques | **Aucune** parmi prorata, famille, aide publique. **Uniquement remise exceptionnelle** (mêmes rôles / garde‑fous que sur la cotisation, adaptés au type de ligne). |
| Facture d’adhésion | **Un document** peut regrouper **cotisation + N frais uniques**. |

## 4. Architecture de données (cible)

### 4.1 Choix d’implémentation recommandé

**Deux modèles distincts** (deux catalogues) pour limiter les champs nullable et clarifier les règles :

1. **Produit cotisation récurrent** — évolution de l’actuel `MembershipProduct` **sans** `dynamicGroupId` :
   - `annualAmountCents`, `monthlyAmountCents` (tous deux requis pour une formule « complète » côté métier ; le plan d’implémentation tranchera si une contrainte souple est nécessaire pour des clubs qui n’exposent qu’un mode — hors périmètre explicite V1 si non demandé).
   - Critères optionnels d’éligibilité : alignement sur les concepts existants (`minAge`/`maxAge`, liaison aux grades) **sur l’entité formule**, sans référence à `DynamicGroup`.
   - Flags **par formule** : `allowProrata`, `allowFamily`, `allowPublicAid`, `allowExceptional`, plafond exceptionnelle — s’appliquent à la **ligne cotisation** ; **prorata** n’est **invocable** que pour un **rythme annuel**.

2. **Produit frais unique** (nom exact : `MembershipOneTimeFee` ou équivalent) :
   - `label`, `amountCents`, `clubId`, archivage, timestamps.
   - **Pas** de critères, **pas** de flags de remise catalogue.

### 4.2 Lignes de facture

- **`InvoiceLineKind`** (ou équivalent) : distinguer au minimum **cotisation récurrente** vs **frais d’adhésion unique** (libellés techniques à figer au plan).
- **Référence produit** : **une** liaison vers le produit cotisation **ou** vers le produit frais unique (exclusivité applicative / contrainte DB selon choix Prisma).
- **Rythme de facturation** : attribut sur la **ligne cotisation** (ou sur le contexte d’inscription référencé par la ligne) : `ANNUEL` | `MENSUEL` ; détermine le **montant de base** (`annualAmountCents` vs `monthlyAmountCents`).
- **`dynamicGroupId` sur ligne** : **retiré** comme notion de « groupe tarifaire » pour les **nouveaux** brouillons ; si conservé temporairement pour migration d’historique, **non utilisé** pour l’éligibilité des **nouvelles** formules.

### 4.3 Ajustements (`InvoiceLineAdjustment`)

- **Ligne cotisation, rythme annuel** : chaîne existante (prorata si autorisé → famille → aide → exceptionnelle), ordre inchangé sauf **exclusion du prorata** si rythme mensuel.
- **Ligne cotisation, rythme mensuel** : **pas** d’étape `PRORATA_SEASON` ; le reste selon flags de la formule (famille, aide, exceptionnelle).
- **Ligne frais unique** : **uniquement** `EXCEPTIONAL` autorisé.

## 5. Flux admin et métier

### 5.1 Paramètres club

- **Onglet / section Cotisations** : CRUD formules récurrentes (deux montants, critères optionnels, flags).
- **Onglet / section Frais d’adhésion** : CRUD produits à montant unique.

### 5.2 Assistant sur fiche membre

- Sélection d’une **formule cotisation** parmi les formules **actives** et **éligibles** (règle hybride).
- Choix du **rythme** : **annuel** ou **mensuel** (base et pipeline d’ajustements conformes §4.3).
- Ajout **optionnel** de **frais uniques** depuis leur catalogue.
- Tout alimente **un** brouillon de facture d’adhésion **multi‑lignes**.

## 6. Validation et erreurs

- Rejet explicite si `PRORATA_SEASON` sur une ligne cotisation **mensuelle**.
- Rejet si type d’ajustement **non exceptionnel** sur une ligne **frais unique**.
- Messages métier clairs (ex. « Prorata saison non applicable au paiement mensuel » ; « Cette remise n’est pas disponible pour ce type de frais »).
- UI : masquer ou désactiver les actions incohérentes lorsque le contexte le permet.

## 7. Migration et données existantes

- Les implémentations déjà livrées avec `MembershipProduct.dynamicGroupId` et `baseAmountCents` unique devront :
  - **Migrer** `baseAmountCents` vers **annuel** et **mensuel** selon règle documentée en plan (ex. duplication provisoire des deux champs si une seule source historique — **à décider** : défaut annuel seul + mensuel NULL interdit jusqu’à saisie club, ou copie identique dans les deux champs avec **avertissement** admin).
  - **Retirer** la contrainte **NotNull** / FK **groupe** sur le produit cotisation ; pour les lignes historiques, conserver ou nullear `dynamicGroupId` **sans** repurposer pour le nouveau flux.
- **Rétention des groupes dynamiques** : aucun changement sur la **finalité** hors tarif ; les écrans d’affectation membre ↔ groupe **restent**.

## 8. Tests ciblés (critères d’acceptation)

- Éligibilité hybride : formule ouverte sans critère ; formule restreinte avec critères.
- Cotisation **annuel** + prorata (si activé) vs **mensuel** sans prorata, **mois courant plein**.
- Frais unique : refus des ajustements non exceptionnels ; exceptionnelle OK si règles respectées.
- Brouillon **1 cotisation + N frais** ; totaux cohérents.
- Absence de dépendance tarifaire au groupe dynamique sur les **nouveaux** produits cotisation.

## 9. Hors périmètre / à trancher au plan

- Ligne **entièrement manuelle** hors catalogue si **aucune** formule n’est éligible (comportement UI/API exact).
- *Rounding* et échéancier **mensuel** (nombre d’échéances, calendrier) jusqu’au niveau **prélèvement / encaissement** — la présente spec fixe le **montant de base** et les **remises** sur la **ligne** du brouillon ; la répartition temporelle peut être l’objet d’une **phase** ultérieure si non déjà couverte.

---

**Document prêt pour** : plan d’implémentation (`writing-plans`) après revue technique et validation finale du demandeur sur ce fichier.
