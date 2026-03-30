# Formules cotisation (annuel / mensuel) et frais uniques — Plan d’implémentation

> **Pour agents :** SOUS-COMPÉTENCE REQUISE : utiliser @superpowers/subagent-driven-development (recommandé) ou @superpowers/executing-plans pour implémenter ce plan tâche par tâche. Les étapes utilisent la syntaxe `- [ ]` pour le suivi.

**Goal :** Mettre en œuvre la spec [2026-03-30-formules-cotisation-frais-uniques-design.md](../specs/2026-03-30-formules-cotisation-frais-uniques-design.md) : deux montants libres par formule cotisation, catalogue séparé des frais uniques, découplage tarif / groupes dynamiques, éligibilité hybride sur la formule, rythme annuel vs mensuel (sans prorata saison en mensuel), brouillon multi‑lignes, remises limitées sur les frais uniques.

**Architecture :** Évoluer **Prisma** (`MembershipProduct` sans `dynamicGroupId`, critères optionnels âge/grades sur la formule ; nouveau `MembershipOneTimeFee` ; `InvoiceLine` avec kind étendu + rythme + FK optionnelle frais unique). Logique pure d’**éligibilité** (réutilise les mêmes règles métier que `memberMatchesDynamicGroup` mais sur des critères embarqués dans le produit). **`computeMembershipAdjustments`** inchangé en structure mais appelé avec `allowProrata: false` pour toute ligne **mensuelle** ; nouvelle fonction minimale pour **ligne frais unique** (ajustements exceptionnels seulement). **NestJS GraphQL** : étendre inputs / resolvers dans `apps/api/src/membership`. **Admin React** : scinder l’UI paramètres adhésion et enrichir l’assistant sur fiche membre (`documents.ts` + composants).

**Tech Stack :** Node 20+, NestJS, Prisma, PostgreSQL, GraphQL code-first, Apollo Client (admin), Jest.

**Références :** Spec validée ci-dessus ; ancienne spec groupes tarifaires [2026-03-30-adhesion-tarifs-groupes-remises-coupons-design.md](../specs/2026-03-30-adhesion-tarifs-groupes-remises-coupons-design.md) — **supplantée** sur le lien formule↔groupe pour le tarif.

---

## Structure des fichiers (cible)

| Chemin | Rôle |
|--------|------|
| `apps/api/prisma/schema.prisma` | Modèles `MembershipProduct` (annual/monthly, critères, grades), `MembershipProductGradeLevel`, `MembershipOneTimeFee`, enums `InvoiceLineKind`, `SubscriptionBillingRhythm`, évolution `InvoiceLine` |
| `apps/api/prisma/migrations/*` | Migration données : copier `baseAmountCents` → annuel+ mensuel ; retirer FK groupe ; renommer enum ligne si besoin |
| `apps/api/src/membership/membership-eligibility.ts` | `memberMatchesMembershipProduct` + types critères (fonction pure) |
| `apps/api/src/membership/membership-eligibility.spec.ts` | Tests éligibilité hybride |
| `apps/api/src/membership/membership-pricing.ts` | `computeOneTimeFeeAdjustments` (exceptionnelle seule) ; évent. refactor param `applyProrata` explicite |
| `apps/api/src/membership/membership-pricing.spec.ts` | Tests prorata absent si mensuel / pipeline frais unique |
| `apps/api/src/membership/membership.service.ts` | CRUD formules + frais uniques ; brouillon multi‑lignes ; validations §6 spec |
| `apps/api/src/membership/membership.resolver.ts` | Queries/mutations GraphQL |
| `apps/api/src/membership/dto/create-membership-product.input.ts` | Champs annuel/mensuel, critères, `gradeLevelIds` |
| `apps/api/src/membership/dto/membership-one-time-fee.input.ts` | CRUD frais unique (create / update) |
| `apps/api/src/membership/dto/create-membership-invoice-draft.input.ts` | `billingRhythm`, `oneTimeFeeIds` (ou lignes structurées) |
| `apps/api/src/membership/models/*.model.ts` | Modèles GraphQL alignés Prisma |
| `apps/api/src/graphql/register-enums.ts` | Enregistrer nouveaux enums |
| `apps/admin/src/lib/documents.ts` | Requêtes/mutations |
| `apps/admin/src/lib/types.ts` | Types TS générés ou manuels |
| `apps/admin/src/pages/settings/AdhesionSettingsPage.tsx` | Deux sections catalogues |
| `apps/admin/src/pages/members/MemberAdhesionPanels.tsx` | Rythme, frais optionnels, preview |

**Décision migration (verrouillée dans ce plan) :** `baseAmountCents` existant → **`annualAmountCents`** et **`monthlyAmountCents`** recevoir **la même valeur** (le club ajustera ensuite si besoin). Suppression de **`dynamicGroupId`** sur `MembershipProduct` après migration ; les lignes `InvoiceLine` historiques peuvent conserver `dynamicGroupId` **en données** mais le code ne s’en sert plus pour l’éligibilité.

**Hors V1 (spec §9) :** ligne **entièrement manuelle** hors catalogue si aucune formule éligible — implémenter un **message clair** côté UI + lien vers paramètres cotisations (pas de mutation « montant libre » saucisson).

---

### Task 1 : Schéma Prisma et migration SQL

**Fichiers :**
- Modifier : `apps/api/prisma/schema.prisma`
- Créer : `apps/api/prisma/migrations/<timestamp>_membership_products_dual_pricing_and_one_time_fees/migration.sql` (généré ou édité après `prisma migrate dev`)

- [ ] **Step 1.1 : Modifier `MembershipProduct`**

- Retirer la relation `dynamicGroup` / champ `dynamicGroupId`.
- Remplacer `baseAmountCents` par `annualAmountCents Int` et `monthlyAmountCents Int`.
- Ajouter `minAge Int?`, `maxAge Int?` (éligibilité optionnelle).
- Ajouter modèle de liaison `MembershipProductGradeLevel` (`membershipProductId`, `gradeLevelId`, `@@id([membershipProductId, gradeLevelId])`) miroir de `DynamicGroupGradeLevel`.
- Retirer `membershipProducts` de `DynamicGroup` si Prisma exige (nettoyer relation inverse).

- [ ] **Step 1.2 : Ajouter `MembershipOneTimeFee`**

- Champs : `id`, `clubId`, `label`, `amountCents`, `archivedAt`, timestamps ; relation `Club` ; index `clubId`.

- [ ] **Step 1.3 : Évolution `InvoiceLine` et enums**

- Étendre `InvoiceLineKind` : renommer `MEMBERSHIP` en `MEMBERSHIP_SUBSCRIPTION` **ou** garder `MEMBERSHIP` comme alias subscription — **préférence plan** : valeurs explicites `MEMBERSHIP_SUBSCRIPTION` et `MEMBERSHIP_ONE_TIME` (migration PostgreSQL `ALTER TYPE ... RENAME VALUE` puis `VALUE` nouveau).
- Ajouter enum `SubscriptionBillingRhythm { ANNUAL MONTHLY }` ; champ optionnel `subscriptionBillingRhythm` sur `InvoiceLine` (null si kind one-time).
- Ajouter `membershipOneTimeFeeId String?` + relation ; garder `membershipProductId` pour lignes subscription.
- Contrainte métier **application** : exactement une des deux FKs produit renseignées selon `kind` (pas obligatoirement une contrainte CHECK SQL au MVP si Prisma complique).

- [ ] **Step 1.4 : Script de migration données**

Dans la migration, **après** ajout des colonnes :

```sql
-- Exemple : après ajout annual/monthly et avant DROP baseAmountCents
UPDATE "MembershipProduct" SET "annualAmountCents" = "baseAmountCents", "monthlyAmountCents" = "baseAmountCents";
-- Puis drop baseAmountCents et dynamicGroupId selon ordre sûr (FK).
```

- Lignes `InvoiceLine` existantes : `kind` → `MEMBERSHIP_SUBSCRIPTION` ; `subscriptionBillingRhythm` → `ANNUAL` (comportement legacy = annuel avec prorata possible).

- [ ] **Step 1.5 : Inventaire code après changement d’`InvoiceLineKind`**

Rechercher dans tout le dépôt (au minimum `apps/api` et `apps/admin`) les occurrences de `MEMBERSHIP` (kind de ligne), `InvoiceLineKind`, et mettre à jour **systématiquement** : `membership.service.ts`, comptages famille, seeds éventuels, tests e2e, requêtes GraphQL admin si le kind est exposé. Ne pas se limiter aux fichiers listés dans le tableau ci-dessus.

- [ ] **Step 1.6 : Appliquer et vérifier**

```powershell
Set-Location c:\Users\flore\ClubFlow\apps\api
npx prisma migrate dev --name membership_dual_pricing_one_time
npx prisma generate
```

Attendu : migration OK, client généré sans erreur.

- [ ] **Step 1.7 : Commit**

```powershell
Set-Location c:\Users\flore\ClubFlow
git add apps/api/prisma
git commit -m "feat(api): schema cotisation dual tarif et frais uniques"
```

---

### Task 2 : Éligibilité formule (fonction pure + tests)

**Fichiers :**
- Créer : `apps/api/src/membership/membership-eligibility.ts`
- Créer : `apps/api/src/membership/membership-eligibility.spec.ts`

- [ ] **Step 2.1 : Test failing — formule ouverte (aucun critère)**

```typescript
// membership-eligibility.spec.ts
import { memberMatchesMembershipProduct } from './membership-eligibility';
import { MemberStatus } from '@prisma/client';

it('sans critère tout membre actif éligible', () => {
  const ok = memberMatchesMembershipProduct(
    { status: MemberStatus.ACTIVE, birthDate: null, gradeLevelId: null },
    { minAge: null, maxAge: null, gradeLevelIds: [] },
    new Date('2026-09-01'),
  );
  expect(ok).toBe(true);
});
```

Run :

```powershell
Set-Location c:\Users\flore\ClubFlow\apps\api
npx jest src/membership/membership-eligibility.spec.ts --no-cache
```

Attendu : échec (module ou fonction absent).

- [ ] **Step 2.2 : Implémenter** en réutilisant la logique de `apps/api/src/members/dynamic-group-matcher.ts` (importer `ageInYears` ou dupliquer minimalement pour éviter dépendance circulaire — **préférence** : importer depuis `../members/dynamic-group-matcher` si les modules Nest l’autorisent).

- [ ] **Step 2.3 : Tests âge / grades** (critères présents, membre hors bornes ou mauvais grade → false).

- [ ] **Step 2.4 : Commit**

```powershell
git add apps/api/src/membership/membership-eligibility.ts apps/api/src/membership/membership-eligibility.spec.ts
git commit -m "test(api): éligibilité formule cotisation hybride"
```

---

### Task 3 : Tarification — frais unique + prorata mensuel

**Fichiers :**
- Modifier : `apps/api/src/membership/membership-pricing.ts`
- Modifier : `apps/api/src/membership/membership-pricing.spec.ts`

- [ ] **Step 3.1 : Ajouter `computeOneTimeFeeAdjustments`**

Entrée : `baseAmountCents`, `allowExceptional`, `exceptionalCapPercentBp`, `exceptional?`. Sortie : `{ adjustments, subtotalAfterBusinessCents }` avec **au plus** une ligne `EXCEPTIONAL`.

- [ ] **Step 3.2 : Tests**

- Frais 100 € + exceptionnel −10 € → sous-total 90 €.
- Documenter dans les tests que `computeMembershipAdjustments` avec `allowProrata: false` **ne pousse pas** `PRORATA_SEASON` (déjà le cas si `allowProrata` false — ajouter un test d’intégration « mensuel » : `allowProrata: false`, ordre famille → aide inchangé).

- [ ] **Step 3.3 : Commit**

```powershell
git add apps/api/src/membership/membership-pricing.ts apps/api/src/membership/membership-pricing.spec.ts
git commit -m "feat(api): tarification frais unique et garde-fous prorata mensuel"
```

---

### Task 4 : DTO et modèles GraphQL (produits)

**Fichiers :**
- Modifier : `apps/api/src/membership/dto/create-membership-product.input.ts`
- Créer : `apps/api/src/membership/dto/membership-one-time-fee.input.ts` (create/update)
- Modifier : `apps/api/src/membership/models/membership-product.model.ts`
- Créer : `apps/api/src/membership/models/membership-one-time-fee.model.ts`
- Modifier : `apps/api/src/graphql/register-enums.ts`
- Modifier : `apps/api/src/membership/membership.module.ts` si besoin d’exports

- [ ] **Step 4.1 : Remplacer `baseAmountCents` / `dynamicGroupId`** par `annualAmountCents`, `monthlyAmountCents`, `minAge`, `maxAge`, `gradeLevelIds: string[]` (create/update).

- [ ] **Step 4.2 : Enregistrer enums** `SubscriptionBillingRhythm`, kinds de ligne mis à jour.

- [ ] **Step 4.3 : `npm run build` dans `apps/api`**

Attendu : compilation OK.

- [ ] **Step 4.4 : Commit**

```powershell
git add apps/api/src/membership/dto apps/api/src/membership/models apps/api/src/graphql/register-enums.ts
git commit -m "feat(api): DTO GraphQL formules et frais uniques"
```

---

### Task 5 : Service — CRUD et brouillon multi‑lignes

**Fichiers :**
- Modifier : `apps/api/src/membership/membership.service.ts`
- Modifier : `apps/api/src/membership/dto/create-membership-invoice-draft.input.ts`

- [ ] **Step 5.1 : CRUD `MembershipOneTimeFee`** (list/create/update/archive/delete — aligner sur pattern produits existant).

- [ ] **Step 5.2 : Adapter `createMembershipProduct` / `update`** : valider grades appartiennent au club ; **ne plus** valider `dynamicGroupId`.

- [ ] **Step 5.3 : Étendre `CreateMembershipInvoiceDraftInput`**

- `billingRhythm: SubscriptionBillingRhythm` (obligatoire pour la cotisation).
- `oneTimeFeeIds: string[]` optionnel (ids `MembershipOneTimeFee` actifs du club).
- **Remise exceptionnelle sur frais uniques (spec §3 / §8)** : champ optionnel du type `oneTimeExceptionals: [{ feeId, amountCents, reason }]`. Pour chaque entrée : une seule fois `assertExceptionalDiscountAllowed` si **au moins** une exceptionnelle frais ou cotisation est demandée ; **motif et montant obligatoires** par entrée ; appliquer `computeOneTimeFeeAdjustments` **par ligne** avec `exceptionalCapPercentBp: null` (pas de plafond catalogue sur frais unique en V1). Sans entrée pour un frais → ligne au **montant catalogue**, sans ajustement.

- [ ] **Step 5.4 : Refactor `createMembershipInvoiceDraft`**

- Charger le produit avec `gradeLevels` / critères ; appeler `memberMatchesMembershipProduct` ; sinon `BadRequestException` explicite.
- **Retirer** la vérification `memberDynamicGroup` sur `product.dynamicGroupId`.
- **Base cotisation** : `annualAmountCents` si `ANNUAL`, sinon `monthlyAmountCents`.
- **Prorata** : calculer `factorBp` seulement si `billingRhythm === ANNUAL` ; sinon ne pas passer de prorata (`allowProrata` effectif = `product.allowProrata && rhythm === ANNUAL`).
- Construire **tableau** `lines.create` : première ligne subscription, puis une ligne par frais unique ; `kind` = `MEMBERSHIP_ONE_TIME`, `membershipOneTimeFeeId`, `baseAmountCents` = montant catalogue ; appliquer **par ligne** les ajustements issus de `computeOneTimeFeeAdjustments` (exceptionnelle uniquement, si présente dans `oneTimeExceptionals`).
- **Remise exceptionnelle cotisation** : conserver le bloc existant (`exceptionalAmountCents` / `exceptionalReason`) pour la **ligne subscription** uniquement.
- **Totaux facture** : `invoice.baseAmountCents` = **somme** des sous-totaux métier de **toutes** les lignes après ajustements.

- [ ] **Step 5.5 : `countPriorMembershipLinesForFamily`** : filtrer `kind: MEMBERSHIP_SUBSCRIPTION` seulement.

- [ ] **Step 5.6 : Valider ajustements** lors d’éventuelles mutations d’ajustement futures ; à la création du brouillon, rejeter toute combinaison incohérente (tests manuels ou test e2e).

- [ ] **Step 5.7 : Commit**

```powershell
git add apps/api/src/membership/membership.service.ts apps/api/src/membership/dto/create-membership-invoice-draft.input.ts
git commit -m "feat(api): brouillon adhésion multi-lignes et éligibilité sans groupe tarifaire"
```

---

### Task 6 : Resolver GraphQL

**Fichiers :**
- Modifier : `apps/api/src/membership/membership.resolver.ts`

- [ ] **Step 6.1 : Queries** `membershipOneTimeFees` ; mutations create/update/delete/archive mirror.

- [ ] **Step 6.2 : Vérifier auth / guards** identiques aux mutations produits existantes.

- [ ] **Step 6.3 : Tests e2e** — étendre `apps/api/test/app.e2e-spec.ts` : créer formule + frais + brouillon avec `billingRhythm` `MONTHLY` et `ANNUAL`.

- [ ] **Step 6.4 : Commit**

```powershell
git add apps/api/src/membership/membership.resolver.ts apps/api/test/app.e2e-spec.ts
git commit -m "feat(api): GraphQL frais uniques et brouillon enrichi"
```

---

### Task 7 : Admin — documents GraphQL et types

**Fichiers :**
- Modifier : `apps/admin/src/lib/documents.ts`
- Modifier : `apps/admin/src/lib/types.ts`

- [ ] **Step 7.1 : Ajouter** query `membershipOneTimeFees`, mutations frais unique, champs mis à jour sur `MembershipProduct`, arguments `createMembershipInvoiceDraft`.

- [ ] **Step 7.2 : `npm run build` dans `apps/admin`**

Attendu : build OK.

- [ ] **Step 7.3 : Commit**

```powershell
git add apps/admin/src/lib/documents.ts apps/admin/src/lib/types.ts
git commit -m "feat(admin): documents GraphQL cotisation et frais uniques"
```

---

### Task 8 : Admin — `AdhesionSettingsPage`

**Fichiers :**
- Modifier : `apps/admin/src/pages/settings/AdhesionSettingsPage.tsx`

- [ ] **Step 8.1 : Section cotisations** : formulaire avec annuel + mensuel, âges optionnels, multi-select grades (réutiliser patterns du projet pour groupes dynamiques si existant).

- [ ] **Step 8.2 : Section frais uniques** : tableau + dialog création/édition (libellé, montant).

- [ ] **Step 8.3 : Retirer** sélecteur **groupe dynamique** obligatoire sur la formule.

- [ ] **Step 8.4 : Commit**

```powershell
git add apps/admin/src/pages/settings/AdhesionSettingsPage.tsx
git commit -m "feat(admin): paramètres cotisations et frais uniques séparés"
```

---

### Task 9 : Admin — assistant adhésion fiche membre

**Fichiers :**
- Modifier : `apps/admin/src/pages/members/MemberAdhesionPanels.tsx`

- [ ] **Step 9.1 : Filtrer** produits cotisation : **préférence** query `eligibleMembershipProducts(memberId)` côté API (réutilise `memberMatchesMembershipProduct`) pour une seule source de vérité. **À défaut** : exposer les critères sur `MembershipProductGraph` et **dupliquer** la logique — documenter que les mêmes cas que `membership-eligibility.spec.ts` doivent être couverts côté admin ou ajouter un mini helper partagé dans `apps/api` exporté vers admin si le monorepo le permet.

- [ ] **Step 9.2 : UI rythme** radio Annuel / Mensuel ; masquer contrôle prorata / texte d’aide si Mensuel.

- [ ] **Step 9.3 : Checkboxes** frais uniques (catalogue complet).

- [ ] **Step 9.3b : Remise exceptionnelle par frais** — si les rôles le permettent : UI optionnelle (ex. expansion par ligne ou icône « remise ») pour renseigner `amountCents` + `reason` par `feeId` sélectionné, mappée vers `oneTimeExceptionals` dans la mutation `createMembershipInvoiceDraft`.

- [ ] **Step 9.4 : Commit**

```powershell
git add apps/admin/src/pages/members/MemberAdhesionPanels.tsx
git commit -m "feat(admin): assistant adhésion rythme et frais uniques"
```

---

### Task 10 : QA finale

- [ ] **Step 10.1 : Tests API**

```powershell
Set-Location c:\Users\flore\ClubFlow\apps\api
npm test
npm run test:e2e
```

Attendu : tous verts.

- [ ] **Step 10.2 : Lint (si configuré)**

```powershell
npm run lint
```

- [ ] **Step 10.3 : Commit correctifs** si nécessaire.

---

## Revue de plan

Après fusion locale, lancer une revue documentaire (sous-agent) selon `plan-document-reviewer-prompt.md` avec :

- Plan : `docs/superpowers/plans/2026-03-30-formules-cotisation-frais-uniques-implementation.md`
- Spec : `docs/superpowers/specs/2026-03-30-formules-cotisation-frais-uniques-design.md`

---

## Livraison

**Plan enregistré dans** `docs/superpowers/plans/2026-03-30-formules-cotisation-frais-uniques-implementation.md`. Deux modes d’exécution possibles :

1. **Subagent-Driven (recommandé)** — un sous-agent par tâche, relecture entre tâches ; suivre @superpowers/subagent-driven-development.  
2. **Inline** — enchaîner les tâches dans une session avec @superpowers/executing-plans.

**Laquelle préférez-vous ?**
