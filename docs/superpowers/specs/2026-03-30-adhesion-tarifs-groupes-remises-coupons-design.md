# Spécification — Adhésion : tarifs par groupe dynamique, remises, coupons, lien paiement

**Date :** 2026-03-30  
**Statut :** validée par le demandeur (échanges 2026-03-30) ; revue interne 2026-03-30 (points §4.5 / §7 clarifiés)  
**Périmètre :** prolongement du module **Membres** (groupes dynamiques), nouveau sous-domaine **cotisation / formules**, évolution du module **Paiement** (factures structurées), administration (`apps/admin`) ; portail adhérent hors V1 sauf mention contraire.

## 1. Objectif

- Permettre des **cotisations d’adhésion** dont le **tarif de base** dépend d’une **formule** rattachée à un **groupe dynamique** (même concept que planning / communication : âge + niveaux de grade).
- Conserver des **groupes créables sans limite** par le club ; **seed** d’exemple recommandé : **Enfants**, **Adultes** (le club ajoute « ados », « enfant débutant », etc.).
- **Suggérer** les groupes pertinents lors de la saisie (âge + grade), tout en rendant l’**affectation modifiable** par l’admin.
- Gérer une **chaîne de remises cumulatives** avec **ordre d’application fixe** (paramétrable au niveau de la **formule d’adhésion**) : prorata saison → remise famille → coupon (dont **aides publiques** type Pass’Sport) → **remise exceptionnelle** (rôles restreints).
- Préparer l’**enchaînement** avec les **modes de paiement** via les **`ClubPricingRule`** existantes (ajustement après le total « métier »).
- **Un membre** peut relever de **plusieurs** groupes ; le **prix cotisation** pour une inscription donnée est toujours porté par **une** ligne métier explicite : **formule** + **un** `dynamicGroupId` de référence (choisi parmi les groupes pour lesquels la formule est valide / membre éligible).

## 2. Décisions produit (rappel)

| Sujet | Décision |
|--------|----------|
| Groupes tarifaires | **Extension des groupes dynamiques** (pas un catalogue séparé). |
| Nombre de groupes | **Illimité** ; critères **âge** et **niveau (grade)** combinables (ex. enfant débutant : blanche + 6–10 ans). |
| Seed initial | **Deux** groupes exemple : **Enfants**, **Adultes** (à créer en seed ou assistant d’onboarding club). |
| Cotisation vs appartenance | **Plusieurs** groupes possibles ; **une** formule / ligne de cotisation avec **un** groupe de tarif. |
| Cumul remises | **Oui**, avec **ordre fixe** paramétrable sur la **formule**. |
| Prorata « entrée en cours de saison » | **Saison** avec dates ; **% calculé par défaut** ; **modifiable** par le trésorier avant figement. |
| Coupons type Pass’Sport | **Type aide publique** : champs dédiés (organisme, référence dossier, montant subventionné, etc.) + **pièce jointe** optionnelle. |
| Remise exceptionnelle | **Trésorerie / bureau** uniquement en V1 ; **motif obligatoire** ; plafond à définir en implémentation. |
| Règle mode de paiement | Ajustement **`ClubPricingRule`** **après** le total des remises « métier » (voir §7). |

## 3. État actuel (baseline)

- **Prisma** : `DynamicGroup` (`minAge`, `maxAge`, `DynamicGroupGradeLevel`), `Member` (`birthDate`, `gradeLevelId`), `Family` / `FamilyMember`, `Invoice` (**montants globaux** `baseAmountCents`, `amountCents`, sans lignes), `ClubPricingRule` (par `ClubPaymentMethod`), `Payment`.
- **Matching** : fonction pure `memberMatchesDynamicGroup` — l’appartenance **n’est pas** stockée en table de liaison **aujourd’hui** ; les effectifs groupe sont dérivés.
- **Gaps** : pas de **saison sportive** club, pas de **produit / formule d’adhésion**, pas de **lignes d’ajustement** typées, pas de coupon aide publique.

## 4. Modèle de données (cible conceptuelle)

### 4.1 Affectation membre ↔ groupe dynamique

Pour honorer la **suggestion** et la **modification** manuelle (y compris cas hors critères stricts si le club l’autorise), introduire une liaison **persistée** :

- **`MemberDynamicGroup`** (ou équivalent) : `memberId`, `dynamicGroupId`, `clubId`, timestamps ; **unique** (`memberId`, `dynamicGroupId`).
- **Règle** : les groupes listés pour un membre = **union** des lignes persistées (l’admin ajoute / retire). L’API de **suggestion** pré-remplit des propositions **sans écraser** les choix existants sans action explicite (détail UX en implémentation).
- **Alternative rejetée pour la spec** : membre « uniquement calculé » sans table — insuffisant pour **override** métier sans bricolage sur grade/âge.

### 4.2 Saison

- **`ClubSeason`** (nom suggéré) : `clubId`, `label`, `startsOn`, `endsOn`, `isActive`.
- **V1 — contrainte stricte** : **au plus une** saison avec `isActive === true` par club (validation API + migration des données existantes si besoin). Pas seulement une recommandation UI.
- Sert au **prorata** : calcul du **% par défaut** = f(date d’effet d’adhésion, bornes saison) — **méthode exacte** (jours calendaires vs mois entamés) **à documenter dans le plan d’implémentation** ; une seule méthode pour tout le produit.

### 4.3 Formule d’adhésion

- **`MembershipProduct`** (nom technique à valider dans le plan) : `clubId`, `label`, `baseAmountCents`, `dynamicGroupId` (**obligatoire** : ce groupe définit la « clé tarifaire » de la formule), `discountStepOrder` (JSON ou relation ordonnée vers types d’ajustement), flags d’activation (ex. prorata / famille / coupon / exceptionnelle utilisables sur ce produit), `archivedAt` optionnel.
- Une formule est **sélectionnable** pour un membre si le membre possède une ligne **`MemberDynamicGroup`** pour le `dynamicGroupId` de la formule (éligibilité simple en V1).

### 4.4 Facture et lignes

- **`Invoice`** : conserver l’agrégat ; introduire **`clubSeasonId`** (obligatoire pour les factures d’adhésion V1) afin d’ancrer le **comptage remise famille** et le **prorata** ; comportement si **aucune saison active** : **blocage** de la création de cotisation avec message explicite (pas de repli implicite en V1).
- **`InvoiceLine`** (au minimum une ligne par cotisation) : `invoiceId`, `kind` (ex. `MEMBERSHIP`), `memberId`, `membershipProductId`, `dynamicGroupId` (redondance contrôlée pour audit), `baseAmountCents`, séquence d’**ajustements** ou sous-modèle.
- **`InvoiceLineAdjustment`** (ou équivalent) : `lineId`, `type` (`PRORATA_SEASON`, `FAMILY`, `PUBLIC_AID`, `EXCEPTIONAL`, …), `amountCents` (négatif ou signe convenu), `percentBp` optionnel, **métadonnées** JSON pour aide publique (organisme, ref dossier, montant subvention, URL fichier), `reason` (obligatoire pour exceptionnelle), `createdByUserId`, ordre d’application, `finalAfterStepCents` optionnel pour relecture.
- **Workflow facture V1 (décision unique pour le plan)** — voir aussi §7 :
  1. Étendre `InvoiceStatus` avec **`DRAFT`** (ou enum équivalent) : en `DRAFT`, montants et lignes sont **recalculables** ; passage à **`OPEN`** **fige** `baseAmountCents`, chaque ligne, chaque ajustement et **`amountCents`** (total dû après application des `ClubPricingRule` **si** le mode de paiement est déjà connu à ce moment — voir §7).
  2. Tant que `DRAFT`, le total affiché peut être un **aperçu** ; la persistance finale doit être **reproductible** à partir des lignes figées à l’ouverture.

### 4.5 Remise famille

- **V1 — période de comptage (décision produit)** : le seuil « **n-ième** membre du foyer payant » s’applique sur la **saison sportive active** (`ClubSeason.isActive`), c.-à-d. les cotisations / factures d’adhésion rattachées à cette saison. **Pas** d’entité « campagne cotisation » distincte en V1 (évolution possible si le club exige des campagnes chevauchées).
- Paramètre club ou produit : seuil **n-ième**, type **% ou montant fixe**.
- Les factures **`VOID`** ne comptent **pas** dans le seuil.

## 5. Règles métier — ordre des remises

Ordre **par défaut** (surcharge permise par formule dans la limite des types autorisés) :

1. **Prorata saison** : % défaut issu du calcul ; **éditable** par trésorier avant figement.
2. **Remise famille** : selon règle foyer + période.
3. **Coupon** : en V1, **au plus une** aide publique par ligne de cotisation (éviter cumul de deux aides sans besoin exprimé).
4. **Remise exceptionnelle** : réservée **trésorerie / bureau** ; **motif obligatoire** ; plafond paramétrable.

**Arrondis** : une seule politique produit (ex. arrondi **au centime** le plus proche à chaque étape, ou sur le total) — **à fixer** dans le plan d’implémentation et couverte par tests unitaires.

## 6. API (surface attendue — à affiner au plan)

- `suggestDynamicGroupsForMember(memberId)` ou input âge + grade : retourne groupes dont critères matchent (tri par « spécificité » recommandé).
- CRUD **affectations** `MemberDynamicGroup` (guards admin membre).
- CRUD **`ClubSeason`** ; lecture **saison active**.
- CRUD **`MembershipProduct`**.
- `previewMembershipInvoice(input)` : membre, produit, date d’effet, options remises → **totaux intermédiaires** sans persistance.
- `createMembershipInvoice(input)` / `finalizeInvoice(id)` : persistance, passage au statut figé.
- Guards : modules **`MEMBERS`** + **`PAYMENT`** selon opérations ; remise exceptionnelle : rôle **trésorerie / bureau** (mapping sur rôles club existants ou futurs — **à lier** au modèle d’autorisation).

## 7. Intégration module Paiement — `ClubPricingRule`

**Ordre de calcul (inchangé)** :

1. Sous-total **cotisation** = ligne après toutes les remises **métier** (§5).  
2. **Ajustement mode de paiement** : `ClubPricingRule` pour le `ClubPaymentMethod` choisi, **après** le métier.  
3. **`Invoice.amountCents`** = total **dû** après étape 2, **au moment du passage `DRAFT` → `OPEN`**.

**V1 — décision unique (évite double application et écarts d’encaissement)** :

- **Chemin admin / saisie manuelle** : le trésorier fournit **`preferredPaymentMethod`** à la **finalisation** (`OPEN`). Le serveur calcule une fois les `ClubPricingRule`, stocke le **total final** dans `amountCents`, et **persiste** le mode retenu sur la facture (champ à ajouter, ex. `lockedPaymentMethod`).
- **Chemin paiement en ligne (Stripe)** : la facture est **`OPEN`** avec `lockedPaymentMethod = STRIPE_CARD` **dès l’émission** ; `amountCents` inclut déjà la règle carte. Si le payeur **change** de mode après coup, **interdit** en V1 sans annulation / nouvelle facture (ou workflow « void + recréer » documenté au plan) — pas de recalcul silencieux sur une facture `OPEN`.
- En **`DRAFT`**, ne pas persister de `amountCents` définitif sans recalcul explicite ; les aperçus utilisent le même moteur que la finalisation.

Le **plan d’implémentation** doit traiter **dans un seul chapitre** : enum `Invoice` (lignes + `DRAFT`), figement, `lockedPaymentMethod`, et application unique de `ClubPricingRule`.

## 8. Interface administration (V1)

- Écran **groupes dynamiques** : inchangé dans l’esprit ; mention que ces groupes servent aussi **adhésion**.
- **Affectations** sur fiche membre : liste des groupes (cases / liste) + bouton « **suggérer** ».
- **Saisons** : liste / édition / saison active.
- **Formules d’adhésion** : CRUD, montant, groupe obligatoire, ordre des étapes de remise.
- **Cotisation** : assistant membre + formule → aperçu → ajustement prorata / validation trésorier → émission facture.

## 9. Tests et qualité

- Tests unitaires : fonction d’**enchaînement** des remises, **prorata** sur bornes de saison, **plafond** exceptionnelle, comptage **foyer**.
- Tests d’intégration : création facture **DRAFT** → **OPEN**, idempotence des suggestions.

## 10. Hors périmètre / évolutions

- Portail adhérent : **hors V1** pour ce périmètre sauf lecture facture déjà couverte ailleurs.
- **Plusieurs** aides publiques sur une même ligne.
- TVA / mentions légales factures : suivre module comptabilité / juridique existant.

## 11. Dépendances modules

- **Membres** (obligatoire) : `Member`, `DynamicGroup`, familles.
- **Paiement** : facturation, encaissement, `ClubPricingRule`.

---

*Document rédigé suite au brainstorming validé section par section (2026-03-30).*
