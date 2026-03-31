# Famille étendue & facturation partagée — Plan d’implémentation

> **Pour agents :** utiliser @superpowers:subagent-driven-development ou @superpowers:executing-plans pour exécuter ce plan tâche par tâche. Les étapes utilisent la syntaxe `- [ ]` pour le suivi.

**Objectif :** introduire `HouseholdGroup` (foyer étendu), rattacher plusieurs `Family`, unifier la facturation côté groupe, étendre `viewerProfiles` et `viewerFamilyBillingSummary` selon la spec §3.1.1, tracer `paidByMemberId` sur les paiements, et livrer les écrans admin / portail MVP décrits dans `docs/superpowers/specs/2026-03-31-famille-etendue-facturation-partagee-design.md`.

**Architecture :** migration Prisma incrémentale (spec §6.2) : schéma groupe + colonnes optionnelles, services de résolution « factures du groupe » avec repli `familyId` (foyer porteur), règles viewer isolées dans `FamiliesService` + helpers testables (minorité selon spec §3.1.1, appartenance au groupe). Pas de PDF serveur tant qu’aucune lib n’existe — livrer d’abord les **données** (GraphQL) pour reçus / exports ; PDF en itération.

**Stack :** NestJS, Prisma, GraphQL (Apollo), Jest, apps `admin` (Vite/React), `member-portal`.

**Spec source de vérité :** `docs/superpowers/specs/2026-03-31-famille-etendue-facturation-partagee-design.md`

---

## Carte des fichiers (cible)

| Zone | Fichiers principaux | Rôle |
|------|---------------------|------|
| Schéma | `apps/api/prisma/schema.prisma`, nouvelle migration SQL | `HouseholdGroup`, `Family.householdGroupId`, `Invoice.householdGroupId`, `Payment.paidByMemberId`, indexes |
| Domaine foyer | `apps/api/src/families/families.service.ts`, nouveaux `*.spec.ts` | CRUD groupe (admin), résolution groupe, `listViewerProfiles` filtré §3.1.1 |
| Helpers | `apps/api/src/families/viewer-profile-rules.ts` (nouveau) | `isMinor`, `memberInHouseholdGroup`, pure functions TDD |
| Viewer | `apps/api/src/viewer/viewer.service.ts`, `viewer-family-billing.model.ts`, `viewer.resolver.ts` | Agrégation factures groupe ; `isPayerView` → tout adulte avec `userId` dans une `Family` du groupe (spec §4.2) |
| Paiements | `apps/api/src/payments/payments.service.ts`, `record-manual-payment.input.ts`, `payment.model.ts`, `stripe-webhook.controller.ts` | Validation `paidByMemberId`, Stripe intent + webhook |
| GraphQL admin | `apps/api/src/families/families.resolver.ts`, DTO inputs | Mutations création groupe, rattachement `Family`, porteur |
| Admin UI | `apps/admin/src/pages/members/FamiliesPage.tsx`, drawer détail foyer, évent. nouveau formulaire | Création / édition groupe étendu |
| Portail | `apps/member-portal/src/pages/FamilyPage.tsx` (ou équivalent) | Solde groupe, historique, colonne « payé par » si données exposées |

---

### Task 1 : Modèle Prisma `HouseholdGroup` (Phase A)

**Fichiers :**
- Modifier : `apps/api/prisma/schema.prisma`
- Créer : `apps/api/prisma/migrations/<timestamp>_household_group/migration.sql` (via `npx prisma migrate dev`)

**Contenu schéma (indicatif) :**
- `model HouseholdGroup { id, clubId, label?, carrierFamilyId? (optional FK Family), createdAt, updatedAt }` — `carrierFamilyId` = foyer porteur transitoire (§6.1).
- `Family` : `householdGroupId String?` + relation + `@@index([householdGroupId])`.
- `Invoice` : `householdGroupId String?` + relation + index `(clubId, householdGroupId, status)`.
- `Payment` : `paidByMemberId String?` + relation `Member` + `@@index([paidByMemberId])`.

- [ ] **Étape 1 :** Ajouter les modèles/champs dans `schema.prisma`, relier `Club` ↔ `HouseholdGroup`.
- [ ] **Étape 2 :** `cd apps/api; npx prisma migrate dev --name household_group` — vérifier migration appliquée en local.
- [ ] **Étape 3 :** `npx prisma generate` ; `npm run build` dans `apps/api`.
- [ ] **Étape 4 :** Commit : `feat(api): household group schema and payment paidByMemberId`

---

### Task 2 : Helpers profils viewer (TDD)

**Fichiers :**
- Créer : `apps/api/src/families/viewer-profile-rules.ts`
- Créer : `apps/api/src/families/viewer-profile-rules.spec.ts`

- [ ] **Étape 1 :** Tests : `isViewerSelectableChild(parentMemberId, childMember, sameGroupIds, now)` — cas OK mineur avec `birthDate`, cas refus majeur, refus sans `birthDate`, refus statut non ACTIVE.
- [ ] **Étape 2 :** `npm test -- viewer-profile-rules.spec.ts` → FAIL.
- [ ] **Étape 3 :** Implémenter fonctions pures (calcul âge : UTC ou timezone — documenter choix aligné club).
- [ ] **Étape 4 :** `npm test -- viewer-profile-rules.spec.ts` → PASS.
- [ ] **Étape 5 :** Commit.

---

### Task 3 : `listViewerProfiles` avec `HouseholdGroup`

**Fichiers :**
- Modifier : `apps/api/src/families/families.service.ts`
- Créer ou modifier : test ciblé `apps/api/src/families/families-viewer-profiles.spec.ts` (mock Prisma ou prisma test db selon convention repo)

**Logique :**
- Résoudre les `householdGroupId` pour chaque `Family` où le user a un `Member`.
- Pour chaque groupe : collecter les `Member` via toutes les `Family` du groupe.
- Inclure profil « soi » : tout membre `userId === user`.
- Inclure enfant : appliquer helpers Task 2 ; **exclure** autres adultes du même groupe (pas co-parent comme profil sélectionnable).
- Legacy : foyers sans `householdGroupId` → comportement actuel (tous les membres des familles), **sauf** si on affine : documenter équivalence « groupe singleton » (spec §6.2 phase B) — **YAGNI** pour V1 : garder parité stricte sans groupe.

- [ ] Écrire tests d’intégration ou unitaires avec prisma mock pour 2 familles / 1 groupe / 2 parents / 1 enfant.
- [ ] Implémenter ; `npm test` ciblé.
- [ ] Vérifier `auth.service` / login renvoie bien la liste filtrée.
- [ ] Commit.

---

### Task 4 : Service « factures du groupe »

**Fichiers :**
- Créer : `apps/api/src/families/household-billing.scope.ts` (ou sous `payments/`) — `resolveInvoiceScopeForHouseholdGroup(clubId, householdGroupId | null, carrierFamilyId | null)`
- Modifier : `apps/api/src/viewer/viewer.service.ts`

**Comportement :**
- Si `householdGroupId` sur factures : `where: { clubId, householdGroupId, status }`.
- Sinon (transitoire) : utiliser `carrierFamilyId` du groupe ou `familyId` du foyer porteur pour agréger les factures ouvertes identiques à aujourd’hui pour ce foyer.
- Mettre à jour `createInvoice` (admin) pour accepter optionnel `householdGroupId` et remplir `familyId` porteur si besoin.

- [ ] Tests unitaires sur le construit `where` Prisma (objets attendus).
- [ ] Brancher `viewerFamilyBillingSummary` :
  - **Vue facturation** : tout `Member` avec `userId` dans une `Family` du **même** `HouseholdGroup` que le `memberId` actif (profil courant), pas seulement `PAYER`.
  - Garder un indicateur `isPayerView` renommé ou sémantique `canManageHouseholdBilling` pour compat UI.
- [ ] `npm test` + e2e viewer si présent.
- [ ] Commit.

---

### Task 5 : Paiements — `paidByMemberId`

**Fichiers :**
- Modifier : `apps/api/src/payments/dto/record-manual-payment.input.ts`
- Modifier : `apps/api/src/payments/payments.service.ts`
- Modifier : `apps/api/src/payments/models/payment.model.ts`
- Modifier : `apps/api/src/payments/payments.resolver.ts` (si champ exposé)
- Modifier : `apps/api/src/payments/stripe-webhook.controller.ts` — lier l’intent au membre initiateur si stocké en metadata

**Règles :**
- Si `paidByMemberId` fourni : doit appartenir au `HouseholdGroup` de la facture (résolution via `invoice.householdGroupId` ou via `invoice.familyId` → famille → groupe).
- Admin saisie sans payeur : `paidByMemberId` null + audit (user admin) — enum motif optionnel en V2.
- Portail : **toujours** renseigner `paidByMemberId` = membre actif du JWT (profil sélectionné).

- [ ] Tests : `payments-record-manual.spec.ts` + nouveau cas rejet payeur hors groupe.
- [ ] Implémenter validation dans `recordManualPayment` et équivalent Stripe.
- [ ] Commit.

---

### Task 6 : GraphQL admin — CRUD `HouseholdGroup`

**Fichiers :**
- Modifier : `apps/api/src/families/families.resolver.ts`
- Créer : DTO `create-household-group.input.ts`, `update-household-group.input.ts`, `attach-club-family-to-household-group.input.ts` (noms à harmoniser)
- Modifier : `families.service.ts` — transactions : ne pas permettre qu’une `Family` soit dans deux groupes à la fois.

- [ ] Mutations : `createHouseholdGroup`, `setFamilyHouseholdGroup`, `setHouseholdGroupCarrierFamily` (admin guard).
- [ ] Tests resolver ou service.
- [ ] Commit.

---

### Task 7 : Admin UI — gestion groupe étendu

**Fichiers :**
- Modifier : `apps/admin/src/pages/members/FamiliesPage.tsx`, `FamilyDetailDrawer.tsx` (ou pages dédiées)

**MVP :**
- Liste des groupes ou section dans drawer famille : rattacher à un groupe, choisir foyer porteur.
- Libellés alignés spec (éviter « § » en UI utilisateur).

- [ ] Maquettes minimales cohérentes admin existant.
- [ ] Commit.

---

### Task 8 : Portail — espace famille / facturation groupe

**Fichiers :**
- Modifier : `apps/member-portal/src/pages/FamilyPage.tsx` (ou route sous `/famille`)

**MVP :**
- Afficher solde + factures via query mise à jour ; tableau ou liste des paiements avec **payeur** si `Payment` expose `paidByMember` (prénom/nom public).
- Masquer sections selon module paiement (existant).

- [ ] Commit.

---

### Task 9 : Reçu / export (données, sans PDF si absent)

**Fichiers :**
- Optionnel : query `viewerPaymentReceipt(paymentId)` ou champ sur type `Payment` avec snapshot `{ payerFirstName, payerLastName, amountCents, ... }` pour futur PDF.

- [ ] Si aucun moteur PDF : documenter dans README interne que le critère d’acceptation §7.6 est couvert par **données** + gabarit front ; PDF = milestone suivante.
- [ ] Commit si query ajoutée.

---

### Task 10 : Jeux de données & e2e

**Fichiers :**
- Modifier : `apps/api/prisma/seed.ts` (scénario 2 parents, 2 foyers, 1 groupe, 1 facture)
- Modifier : `apps/api/test/jest-e2e.json` + spec e2e viewer si pipeline prêt

- [ ] Scénario e2e : login parent A → `viewerProfiles` contient enfant, **pas** parent B ; parent B idem ; billing identique.
- [ ] `npm run test:e2e` dans `apps/api`.
- [ ] Commit.

---

### Task 11 : Documentation & release

- [ ] Mettre à jour `docs/superpowers/specs/2026-03-31-famille-etendue-facturation-partagee-design.md` statut si besoin (« impl en cours »).
- [ ] Note CHANGELOG ou section roadmap `docs/superpowers/roadmap/` si le repo le prévoit.
- [ ] Commit final doc.

---

## Ordre d’exécution recommandé

1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9 → 10 → 11  

Les tâches 6–8 peuvent être parallélisées **après** 4–5 si deux agents : une personne sur API admin, une sur portail.

---

## Commandes utiles

```bash
cd apps/api
npm test -- <fichier.spec.ts>
npm run test:e2e
npx prisma migrate dev
npx prisma studio
```

---

*Plan généré pour implémentation alignée sur la spec famille étendue (2026-03-31).*
