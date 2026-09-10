# Rapprochement bancaire, chèques, caisse et bénévoles — plan d'implémentation par lots

> **Pour agents :** cocher les étapes (`- [ ]`) au fil de l'eau. Chaque lot se
> livre **seul** sur `staging`, s'y vérifie avec de vrais fichiers, puis se
> promeut vers `main` (cf. [workflows/promouvoir-une-branche-partagee.md](../../memory/workflows/promouvoir-une-branche-partagee.md)).
> **Aucun commit sans demande explicite de Florent.**

**Décisions de référence :**
[ADR-0014](../../memory/decisions/0014-rapprochement-bancaire-par-releves.md) (rapprochement par relevés),
[ADR-0015](../../memory/decisions/0015-cheques-a-encaisser-5112.md) (chèques 5112 et remises),
[ADR-0016](../../memory/decisions/0016-frais-avances-benevoles-467.md) (frais avancés par un bénévole).

**Goal :** une mise en comptabilité par simple dépôt de documents. Le trésorier
fixe son exercice, dépose les relevés de chaque banque (OFX, CSV ou PDF lu par
deux modèles), tient sa caisse dans l'app, fait ses remises de chèques dans
l'app. Chaque ligne de relevé est rapprochée d'une écriture existante
(virements Stripe, paiements, reçus, remises, remboursements de bénévoles) ou
part dans une file « à catégoriser » où l'IA propose, questionne, puis laisse la
main. Rien n'est comptabilisé sans validation humaine.

**Architecture :** un module `bank-import` dans `apps/api/src/accounting/`
porte le relevé (`BankStatement`), ses lignes (`BankStatementLine`) et la
liaison N↔N vers les écritures (`BankStatementLineMatch`). Les parseurs OFX et
CSV sont des fonctions pures ; la lecture PDF réutilise l'outillage de
`receipt-ocr.service.ts` (texte natif, rastérisation, tuilage) avec deux modèles
vision en parallèle et une fusion déterministe. Le contrôle d'intégrité
(soldes, chaînage, non-chevauchement) est **le seul** chemin qui rend un relevé
exploitable. Les chèques passent par un compte de transit 511200 imité de
512300, les frais avancés par 467100. La catégorisation applique d'abord les
règles apprises du club, puis deux modèles texte, puis un dialogue, et
matérialise chaque proposition comme une écriture `NEEDS_REVIEW` pour que la
file de revue existante reste l'unique boîte de réception.

**Tech stack :** NestJS 11, Prisma 6 (`prisma db push`, cf.
[ADR-0003](../../memory/decisions/0003-prisma-db-push.md)), GraphQL code-first,
admin React + Vite + Apollo, OpenRouter via `OpenrouterService`, pdfkit
(déjà en dépendance) pour le bordereau, Jest.

---

## Garde-fous (les quatre pièges sans symptôme)

- **[Garantie derrière un effet de bord](../../memory/pitfalls/garantie-derriere-effet-de-bord.md)** :
  une seule fonction fait passer un relevé en `READY` et elle n'accepte que le
  résultat du contrôle d'intégrité ; l'écriture de remise et le passage des
  chèques en `DEPOSITED` sont dans la même transaction ; l'acceptation d'une
  proposition et le rapprochement de la ligne sont dans la même transaction.
- **[Test qui vérifie la forme](../../memory/pitfalls/test-verifie-la-forme-pas-le-comportement.md)** :
  chaque invariant listé ci-dessous a un test dont on a vérifié qu'il **rougit**
  quand on retire la garantie (mutation à la main, notée dans la PR).
- **[`$queryRaw` sur du `void`](../../memory/pitfalls/prisma-executeraw-pour-retour-void.md)** :
  la numérotation des remises et l'éventuel verrou par club passent par
  `$executeRaw`, testés sur la vraie base en e2e.
- **[Verdict sur un signal non vérifié](../../memory/pitfalls/juge-non-fiable-verdict-sans-valeur.md)** :
  la double lecture n'est pas un juge ; le contrôle arithmétique l'est. Un
  relevé « OK » selon les deux modèles mais faux à l'arithmétique est refusé.

Multi-tenant : `clubId` dénormalisé sur chaque nouvelle table et filtré dans
chaque requête. Audit : toute action de rapprochement passe par
`AccountingAuditService`.

---

## Ordre des lots et dépendances

| Lot | Contenu | Dépend de | Valeur livrée seule |
|---|---|---|---|
| 0 | Exercice, date de reprise, soldes d'ouverture | — | clôture annuelle sur le bon exercice |
| 1 | Relevés OFX et CSV, contrôle d'intégrité, écran, rapprochement automatique et manuel | 0 | pointage banque avec les exports de la banque |
| 2 | Lecture PDF par deux modèles | 1 | relevés papier et PDF |
| 3 | Catégorisation : règles, deux modèles, dialogue, validation, « tout valider » | 1 | plus de ligne orpheline |
| 4 | Virements d'adhérents : payeur, facture, encaissement en un clic, N↔N | 1 (3 utile) | encaissements sans ressaisie |
| 5 | Chèques 511200, fiche avec photo, remises, bordereau PDF | 0 | remises dans l'app, solde banque juste |
| 6 | Frais avancés par un bénévole, remboursement groupé | 0 (1 pour le rapprochement) | dette envers les bénévoles visible |
| 7 | Livre de caisse, comptage, dépôt et retrait d'espèces | 0 | caisse tenue dans l'app |
| 8 | Stripe par API : transit synthétisé, rattrapage des virements | 1 | transit vérifié, paiements hors ClubFlow visibles |

**Lot 5 à tirer en avant**, juste après le lot 0 et en parallèle du lot 1 :
chaque chèque comptabilisé en banque avant l'existence de 511200 est une ligne
de plus que le rapprochement devra démêler à la main.

---

## Carte des fichiers (prévue)

| Zone | Fichiers |
|---|---|
| Schéma | `apps/api/prisma/schema.prisma` (`db push`, pas de fichier de migration, cf. ADR-0003) |
| Enums GraphQL | `apps/api/src/graphql/register-enums.ts` |
| Exercice | `apps/api/src/accounting/accounting-fiscal-year.service.ts` (+ spec), `accounting-period.service.ts` (clôture sur l'exercice) |
| Import de relevés | `apps/api/src/accounting/bank-import/` : `ofx-parser.ts`, `csv-parser.ts`, `statement-integrity.ts`, `bank-statement.service.ts`, `bank-statement-ocr.service.ts`, `merge-readings.ts`, `__fixtures__/` |
| Rapprochement | `apps/api/src/accounting/bank-import/bank-reconciliation.service.ts`, `bank-line-categorization.service.ts`, `categorization-rules.ts`, `member-transfer-matcher.ts`, `bank-import.resolver.ts`, `dto/`, `models/` |
| OCR partagé | `apps/api/src/accounting/ocr-shared.ts` (extraction depuis `receipt-ocr.service.ts`, tests inchangés) |
| Chèques | `apps/api/src/accounting/cheques/cheques.service.ts`, `cheque-deposits.service.ts`, `cheques.resolver.ts` ; `apps/api/src/pdf/cheque-deposit-pdf.service.ts`, `cheque-deposit-pdf.controller.ts` |
| Bénévoles | `apps/api/src/accounting/volunteers/volunteer-advances.service.ts`, `volunteer-advances.resolver.ts` |
| Caisse | `apps/api/src/accounting/cash/cash-book.service.ts`, `cash-book.resolver.ts` |
| Stripe | `apps/api/src/payments/stripe-transit-sync.service.ts` (+ spec), `apps/api/src/scheduling/scheduling.constants.ts` |
| Seed | `apps/api/src/accounting/accounting-seed.service.ts` (511200, 467100, 658000, compte financier `CHEQUE_TRANSIT`, redirection de route) |
| Routage | `apps/api/src/accounting/club-financial-accounts.service.ts` (`kindFromMethod`) |
| Paiements | `apps/api/src/payments/payments.service.ts`, `dto/record-manual-payment.input.ts` |
| Admin | `apps/admin/src/App.tsx`, `components/nav-config.ts`, `pages/accounting/reconciliation/`, `pages/accounting/cheques/`, `pages/accounting/cash/`, `pages/accounting/volunteers/`, `pages/settings/accounting/FiscalYearSettingsTab.tsx`, `pages/settings/accounting/CategorizationRulesTab.tsx`, `pages/accounting/AccountingReviewDrawer.tsx`, `pages/billing/InvoiceDetailDrawer.tsx` |
| Mobile admin | `apps/mobile-admin/src/screens/billing/RecordPaymentScreen.tsx` (champs chèque + photo, lot 5) |

---

## Conventions transverses

- Schéma : éditer `schema.prisma`, puis `npx prisma db push` et
  `npx prisma generate` dans `apps/api` (sous Windows, cf.
  [pitfall prisma-generate-eperm-windows](../../memory/pitfalls/prisma-generate-eperm-windows.md)).
- Tout nouveau resolver a son test de construction du schéma, sur le modèle de
  `apps/api/src/push/push.resolver.schema.spec.ts`.
- Typecheck avant tout commit : `npm run typecheck` dans `apps/api` **et**
  `apps/admin` (jamais `npx tsc --noEmit` seul dans `apps/admin`, cf. règle d'or 8).
- Commits Conventional FR, scopes `accounting`, `db`, `admin`, `ocr`, `api` ;
  un commit par tâche.
- Style `apps/api` : simple quotes, trailing commas, pas de reformatage de
  masse (Prettier n'y est pas appliqué).

---

## Lot 0 — Exercice comptable, date de reprise, soldes d'ouverture

**Livrable staging :** Paramètres → Comptabilité → onglet « Exercice » ; la
clôture annuelle se calcule sur l'exercice du club.

### Task 0.1 : Schéma

- [x] `Club` : `fiscalYearStartMonth Int @default(1)`, `fiscalYearStartDay Int @default(1)`,
  `accountingStartsOn DateTime? @db.Date`.
- [x] `ClubFinancialAccount` : `openingBalanceCents Int?`, `openingBalanceOn DateTime? @db.Date`.
- [x] `db push` + `generate`.

### Task 0.2 : `AccountingFiscalYearService`

- [x] `boundsFor(clubId, year)` → `{ startsOn, endsOn }` (fin incluse, veille du
  début suivant) ; `yearFor(clubId, date)` ; `label(year, settings)` →
  « 2026 » si 1er janvier, « 2026-2027 » sinon.
- [x] `AccountingPeriodService.closeFiscalYear` utilise `boundsFor` et
  verrouille les 12 mois **de l'exercice** (« 2026-09 » … « 2027-08 »).
- [x] Validation de `updateFiscalSettings` : jour valide pour le mois (pas de
  30/02) ; `accountingStartsOn` ≤ aujourd'hui ; interdiction de **reculer**
  `accountingStartsOn` après le premier relevé déposé (garde posée au lot 1).
- [x] Tests `accounting-fiscal-year.service.spec.ts` : bornes pour 01/09
  (2026-09-01 → 2027-08-31) ; 01/01 inchangé ; `closeFiscalYear` verrouille
  « 2026-09 » … « 2027-08 » et **pas** « 2026-01 » (mutation : revenir à
  l'année civile doit rougir).

### Task 0.3 : GraphQL

- [x] Query `clubAccountingFiscalSettings` ; mutations
  `updateClubAccountingFiscalSettings(input)` et
  `setClubFinancialAccountOpeningBalance(financialAccountId, balanceCents, on)`.
- [x] `closeClubAccountingFiscalYear` : `year` = année de début ; exposer
  `label` sur les clôtures.
- [x] Test de construction du schéma.

### Task 0.4 : Admin

- [x] `AccountingSettingsPage.tsx` : `TabKey` gagne `FISCAL` ; nouveau
  `pages/settings/accounting/FiscalYearSettingsTab.tsx` : jour/mois de début,
  date de reprise, tableau des comptes financiers avec solde d'ouverture.
- [x] Verrou mensuel et clôture annuelle : les mutations existent côté API mais
  aucun écran admin ne les appelle (vérifié le 2026-09-10 par grep). Les
  ajouter dans cet onglet, avec le libellé « Exercice 2026-2027 (01/09/2026 →
  31/08/2027) ».

### Task 0.5 : Vérification staging

- [x] Fait le 2026-09-10 sur `club-demo` (staging) : 01/09, reprise
  2026-09-01, solde d'ouverture 1 234,56 € au 01/09/2026 sur « Banque
  principale », verrou août 2026 posé puis retiré ; persistance vérifiée en
  base par `psql`. La clôture annuelle n'a été vérifiée que par tests
  unitaires : pas de club jetable sur staging, et la clôture ne se défait pas.
- [x] Trouvé en vérifiant : course de `seedIfEmpty` entre les trois requêtes
  de l'écran → « Comptes (0) » au premier chargement. Corrigé (`createMany
  skipDuplicates`), cf.
  [pitfall](../../memory/pitfalls/seed-concurrent-p2002-comptes-zero.md).

---

## Lot 1 — Relevés OFX et CSV, intégrité, écran, rapprochement

**Livrable staging :** dépôt d'un export OFX ou CSV, contrôle bloquant, lignes
rapprochées automatiquement avec les écritures existantes (virements Stripe,
paiements manuels, reçus), rapprochement manuel N↔N, ignorer, détacher.

### Task 1.1 : Schéma

```prisma
enum BankStatementFormat { OFX CSV PDF STRIPE_API }
/// PARSING (lecture en cours) → NEEDS_CHECK (intégrité KO ou divergences) →
/// READY (intégrité OK) → RECONCILED (plus aucune ligne à traiter). FAILED =
/// lecture impossible, relancer ou déposer un autre format.
enum BankStatementStatus { PARSING NEEDS_CHECK READY RECONCILED FAILED }
enum BankStatementLineStatus { UNMATCHED SUGGESTED MATCHED IGNORED }
enum BankStatementLineIgnoreReason { BEFORE_TAKEOVER DUPLICATE NOT_CLUB OTHER }
enum BankMatchOrigin { AUTO MANUAL PROPOSAL }

model BankStatement {
  id, clubId, financialAccountId, mediaAssetId?, format, status,
  periodStart @db.Date, periodEnd @db.Date,
  openingBalanceCents Int, closingBalanceCents Int,
  lineCount Int, integrityDeltaCents Int?, chainOk Boolean?,
  previousStatementId?, readingAJson?, readingBJson?, readingModelA?, readingModelB?,
  aiCostCents Int @default(0), error?, importedByUserId, createdAt, updatedAt
  @@index([clubId, financialAccountId, periodStart])
}
model BankStatementLine {
  id, clubId, statementId, financialAccountId, lineIndex Int,
  bookedOn @db.Date, valueOn? @db.Date, label, rawLabel, reference?,
  counterpartyName?, amountCents Int /* signé : + crédit, − débit */,
  balanceAfterCents Int?, fitId? /* OFX */,
  status, ignoreReason?, readingAgreement Boolean @default(true), divergenceJson?,
  candidateEntryIds String[] @default([]),
  resolvedAt?, resolvedByUserId?, createdAt, updatedAt
  @@index([clubId, statementId]) @@index([clubId, status])
}
model BankStatementLineMatch {
  id, clubId, lineId, entryId, amountCents Int, origin BankMatchOrigin,
  matchedByUserId?, createdAt
  @@unique([lineId, entryId]) @@index([clubId, entryId])
}
```

- [ ] `AccountingEntrySource` : `BANK_IMPORT`. `AccountingAuditAction` :
  `STATEMENT_IMPORT`, `RECONCILE`, `UNRECONCILE`. `ClubFinancialAccount.csvMappingJson Json?`.
- [ ] `register-enums.ts`. `db push`.

### Task 1.2 : Parseurs (fonctions pures)

- [ ] `ofx-parser.ts` : SGML et XML ; `STMTTRN` (`DTPOSTED` → date, `TRNAMT` →
  centimes, `FITID`, `NAME`/`MEMO` → libellé, `REFNUM` → référence) ;
  `LEDGERBAL` → solde de fin daté ; solde de début = fin − Σ. Encodage
  UTF-8 ou cp1252 (`TextDecoder('windows-1252')`, natif Node).
- [ ] `csv-parser.ts` : détection du séparateur (`;` ou `,`), du BOM, de
  l'encodage, du format de date et du séparateur décimal ; détection des
  colonnes par mots-clés d'en-tête (date, libellé, débit, crédit, montant,
  solde) ; mapping explicite `{ dateCol, labelCol, debitCol?, creditCol?, amountCol?, balanceCol?, dateFormat, decimalSeparator }`
  mémorisé sur le compte financier ; renvoie un aperçu pour confirmation.
- [ ] Fixtures anonymisées de deux banques dans `__fixtures__/` ; tests
  table-driven `ofx-parser.spec.ts`, `csv-parser.spec.ts` (montants négatifs,
  virgule décimale, dates `dd/mm/yyyy`, libellés multi-lignes).

### Task 1.3 : `BankStatementService`

- [ ] `importStatement(clubId, userId, input)` : charge le `MediaAsset` (kind
  `DOCUMENT`, privé, `ownerKind = 'BANK_STATEMENT'`), choisit le parseur,
  crée relevé + lignes en une transaction, calcule l'intégrité, pose le statut.
  Gardes : compte financier du club et de kind `BANK` ; `accountingStartsOn`
  défini (sinon `BadRequest` qui renvoie vers les paramètres) ; pas de
  chevauchement ; chaînage ; lignes antérieures à la reprise → `IGNORED` /
  `BEFORE_TAKEOVER`.
- [ ] `statement-integrity.ts` (pur) : `check(opening, lines, closing, previousClosing)`
  → `{ ok, deltaCents, chainOk }`.
- [ ] **Invariant** : `transitionAfterIntegrity(statementId)` est l'unique
  chemin vers `READY`. Test : un relevé dont le delta ≠ 0 ne peut pas être
  `READY` ; mutation (poser `READY` ailleurs) → rouge.
- [ ] `updateLine` / `addLine` / `removeLine` : permis tant que la ligne n'a
  aucun match ; recalcul de l'intégrité et du statut après chaque édition.
- [ ] `deleteStatement` : refusé s'il existe une ligne `MATCHED` ; sinon
  supprime en cascade et libère le chaînage du suivant (qui repasse en
  `NEEDS_CHECK`).
- [ ] Garde du lot 0 : `accountingStartsOn` ne peut plus reculer après le
  premier relevé.

### Task 1.4 : `BankReconciliationService`

- [ ] `autoMatch(statementId)` : candidats = écritures `POSTED` ou `LOCKED` du
  même `financialAccountId`, ligne 51x avec `bankReconciledAt` nul,
  `occurredAt` dans ± `MATCH_WINDOW_DAYS` (10), même montant, sens cohérent
  (crédit de la ligne ↔ débit du 51x sur l'écriture).
- [ ] Clés fortes, dans l'ordre : libellé contenant « STRIPE » et écriture avec
  `stripePayoutId` ; n° de remise dans le libellé (lot 5) ;
  `Payment.externalRef` égal à la référence de la ligne ; sinon candidat
  unique sur montant + date. Clé forte ou candidat unique → `MATCHED`
  (`origin AUTO`) ; plusieurs candidats → `SUGGESTED` avec `candidateEntryIds` ;
  aucun → `UNMATCHED`.
- [ ] `match(lineId, [{ entryId, amountCents }], userId)` : Σ = |montant de la
  ligne| pour N écritures ↔ 1 ligne ; une écriture peut être couverte par
  plusieurs lignes (1 ↔ N), chaque match portant sa part ; `bankReconciledAt`
  posé sur la ligne 51x quand l'écriture est entièrement couverte.
  `unmatch(lineId)` retire les matches et **efface** `bankReconciledAt`.
- [ ] Écriture d'un mois verrouillé : rapprochable (commentaire explicite dans
  le service, test dédié).
- [ ] Audit `RECONCILE` / `UNRECONCILE` avec `metadata { lineId, entryIds }`.
- [ ] Tests : bornes de fenêtre ; sens ; unique contre ambigu ; N ↔ 1 ; 1 ↔ N ;
  `unmatch` efface le flag (mutation : oublier l'effacement → rouge) ; écriture
  verrouillée rapprochable ; ligne hors reprise ignorée.

### Task 1.5 : GraphQL (`bank-import.resolver.ts`)

- [ ] Types `BankStatementGraph`, `BankStatementLineGraph` (avec `matches`,
  `candidates`), `BankStatementIntegrityGraph`, `ReconciliationSummaryGraph`.
- [ ] Queries : `clubBankStatements(financialAccountId?)`, `clubBankStatement(id)`,
  `bankLineCandidates(lineId)` (écritures de la fenêtre, tout montant, pour
  le rapprochement manuel), `clubReconciliationSummary` (par compte : dernier
  relevé, lignes à traiter, écritures non rapprochées).
- [ ] Mutations : `importBankStatement(input)`, `previewCsvStatement(mediaAssetId, mapping?)`,
  `updateBankStatementLine`, `addBankStatementLine`, `removeBankStatementLine`,
  `deleteBankStatement`, `autoMatchBankStatement(id)`, `matchBankLine`,
  `unmatchBankLine`, `ignoreBankLine(lineId, reason)`, `unignoreBankLine`.
- [ ] Test de construction du schéma.

### Task 1.6 : Admin

- [ ] Routes `/comptabilite/rapprochement` et `/comptabilite/rapprochement/:statementId`
  dans `App.tsx` ; sous-entrée dans `nav-config.ts` (le préfixe
  `/comptabilite` est déjà mappé sur le module `ACCOUNTING` dans
  `club-modules-nav.ts`).
- [ ] `pages/accounting/reconciliation/ReconciliationPage.tsx` : par compte
  financier, chaîne des relevés avec statut, bouton « Déposer un relevé ».
- [ ] `ImportStatementDialog.tsx` : compte, format déduit de l'extension,
  aperçu CSV avec sélection des colonnes, saisie des soldes de début et de fin
  pour le CSV, upload via `/media/upload?kind=document&ownerKind=BANK_STATEMENT`.
- [ ] `StatementDetailPage.tsx` : bandeau d'intégrité (delta, chaînage,
  chevauchement) ; tableau des lignes filtrable par statut ; actions par ligne
  (rapprocher, détacher, ignorer, corriger) ; `MatchDrawer.tsx` avec la liste
  des candidats, cases à cocher, montants et somme courante.
- [ ] `AccountingPage.tsx` : pastille « Rapproché » sur les écritures dont la
  ligne 51x porte `bankReconciledAt` (touche minimale, le fichier fait déjà
  2 700 lignes ; ne rien y ajouter d'autre).

### Task 1.7 : Vérification staging

- [ ] Déposer un OFX réel anonymisé sur le club démo ; intégrité OK ; un
  virement Stripe et un virement manuel rapprochés automatiquement ; un
  rapprochement N ↔ 1 manuel ; détacher ; vérifier
  `select status, count(*) from "BankStatementLine" group by status` et
  `bankReconciledAt` sur les lignes 51x.

---

## Lot 2 — Lecture PDF par deux modèles

**Livrable staging :** dépôt d'un relevé PDF ; deux lectures indépendantes ;
lignes divergentes mises en évidence ; contrôle bloquant.

### Task 2.1 : Extraction de l'outillage OCR

- [ ] Sortir de `receipt-ocr.service.ts` vers `ocr-shared.ts` : `extractPdfText`,
  `loadPdfToImg`, rastérisation et tuilage, `pickVisionModel`,
  `VISION_CAPABLE_MODELS`. Les specs existantes de l'OCR reçus restent
  vertes sans modification.

### Task 2.2 : `BankStatementOcrService`

- [ ] Deux lectures en parallèle (`Promise.allSettled`) : modèle A =
  `pickVisionModel(textModel)` ; modèle B = `textFallbackModel` s'il est
  vision et différent de A, sinon `DEFAULT_VISION_MODEL_B = 'google/gemini-2.5-flash'`.
  Prompt : JSON strict `{ iban?, periodStart, periodEnd, openingBalanceCents, closingBalanceCents, lines: [{ bookedOn, valueOn?, label, amountCents, balanceAfterCents? }] }`,
  texte natif du PDF fourni comme vérité textuelle quand il existe ; relevés
  longs traités page par page avec continuité du solde courant.
- [ ] `merge-readings.ts` (pur) : appariement par (date, montant) puis
  similarité de libellé ; lignes appariées → `readingAgreement = true` ;
  présentes d'un seul côté ou en désaccord de montant ou de date → incluses
  avec `readingAgreement = false` et `divergenceJson { kind: ONLY_IN_A | ONLY_IN_B | AMOUNT | DATE, a, b }` ;
  soldes comparés de la même façon.
- [ ] Puis `statement-integrity.check` : le relevé n'est `READY` que par
  `transitionAfterIntegrity`. Les deux lectures en échec → `FAILED` avec
  message, relance ou dépôt en CSV proposés.
- [ ] Budget : `AiBudgetService.checkBudget` avant ; coût journalisé sous
  `AiUsageFeature.BANK_STATEMENT_OCR` (nouvelle valeur) via `logUsage` et
  `incrementUsage` ; cap atteint → PDF refusé avec message, OFX et CSV
  intacts.
- [ ] Persistance de `readingAJson`, `readingBJson`, modèles, coût.
- [ ] Tests : `merge-readings.spec.ts` (accord, présence d'un seul côté,
  désaccord de montant) ; intégrité après fusion ; budget bloqué ; un cas où
  les deux lectures concordent mais l'arithmétique est fausse → `NEEDS_CHECK`
  (c'est le test qui prouve que le contrôle est le juge, pas l'accord).

### Task 2.3 : GraphQL et admin

- [ ] `importBankStatement` en format PDF lance la lecture en arrière-plan
  (statut `PARSING`, même schéma que `aiProcessingStartedAt` des reçus) ; le
  client sonde `clubBankStatement` ; mutation `rerunBankStatementReading(id)`.
- [ ] `StatementDetailPage` : lignes divergentes surlignées, image de la page
  (URL signée du média) en regard, édition inline, bouton « Relancer le
  contrôle ».

### Task 2.4 : Vérification staging

- [ ] Deux PDF réels de banques différentes ; delta 0 ; fausser une ligne à la
  main → `NEEDS_CHECK` ; corriger → `READY` ; vérifier le coût dans
  `AiUsageLog`.

---

## Lot 3 — Catégorisation des lignes orphelines

**Livrable staging :** chaque ligne `UNMATCHED` reçoit une proposition (règle
ou IA), l'IA pose une question quand ce n'est pas clair, le trésorier valide
ligne par ligne ou en lot, les validations créent des règles.

### Task 3.1 : Schéma

- [ ] `AccountingCategorizationRule { id, clubId, pattern, matchKind CONTAINS|STARTS_WITH|REGEX, direction CREDIT|DEBIT|ANY, accountCode, projectId?, label?, source LEARNED|MANUAL, hitCount, lastHitAt?, isActive, createdByUserId, createdAt, updatedAt } @@index([clubId, isActive])`.
- [ ] `BankStatementLine` : `aiProposalJson?`, `aiQuestion?`, `aiConversationJson?`,
  `aiAttempts Int @default(0)`, `aiExhausted Boolean @default(false)`,
  `ruleId?`, `proposedEntryId?`.

### Task 3.2 : Moteur de règles (pur, `categorization-rules.ts`)

- [ ] Normalisation du libellé : majuscules, retrait des dates, numéros et
  références, espaces réduits. Application par ordre de spécificité (motif le
  plus long d'abord) et de sens. Tests : « PRLV SEPA EDF 12/08 REF 123 » →
  règle « EDF » ; règle DEBIT ne s'applique pas à un crédit.

### Task 3.3 : `BankLineCategorizationService`

- [ ] `categorize(lineId)` : 1) règles → proposition `{ accountCode, projectId?, label, confidence: 100, ruleId }` ;
  2) sinon deux modèles texte en parallèle (`textModel`, `textFallbackModel`) avec
  un prompt dérivé de `AccountingSuggestionService.buildPrompt` enrichi du sens,
  du compte financier, des règles du club, des 20 dernières lignes validées aux
  jetons proches (mémoire few-shot) et des tours de dialogue.
  **Clair** = deux réponses, même compte, confiance minimale ≥ 80 ; un seul
  modèle configuré → clair seulement si ≥ 90. Sinon le modèle le plus confiant
  formule **une** question (≤ 200 caractères) → `aiQuestion`.
- [ ] `answerQuestion(lineId, answer)` : ajoute le tour, relance ; au troisième
  échec `aiExhausted = true`, saisie manuelle proposée.
- [ ] **Matérialisation** : toute proposition (claire ou après dialogue) crée
  une écriture `NEEDS_REVIEW`, `source BANK_IMPORT`, `occurredAt = bookedOn`,
  `financialAccountId` du relevé, deux lignes (51x contrepartie + compte
  proposé avec `iaSuggestedAccountCode`, `iaReasoning`, `iaConfidencePct`) ;
  `proposedEntryId` sur la ligne ; sens : crédit → `INCOME`, débit →
  `EXPENSE`, compte 51x/53x → `TRANSFER`. Elle apparaît donc dans
  `clubAccountingReviewQueue` : **une seule boîte de réception**.
- [ ] Validation : depuis l'écran de rapprochement (`acceptBankLineProposal`,
  avec surcharges compte/projet/libellé) ou depuis la file de revue existante.
  Dans les deux cas, le passage en `POSTED` appelle
  `BankReconciliationService.onEntryPosted(entryId)` qui crée le match et
  passe la ligne `MATCHED`, dans la même transaction. Refactor préalable : un
  seul point de passage vers `POSTED` dans `AccountingService` (`markPosted`),
  utilisé par `validateAccountingEntryLine` et `confirmExtraction`.
- [ ] Rejet : `rejectBankLineProposal` supprime l'écriture `NEEDS_REVIEW` et
  remet la ligne `UNMATCHED` avec `aiExhausted = true`.
- [ ] Apprentissage : à la validation, si aucune règle n'a servi, création
  d'une règle `LEARNED` sur le jeton de contrepartie normalisé ; si une règle
  a servi, `hitCount++`.
- [ ] **Invariant** : `bulkAcceptBankLineProposals(lineIds)` n'accepte que les
  lignes dont la proposition est claire, **revérifié côté serveur** ; test par
  mutation (retirer la revérification → rouge).
- [ ] Déclenchement : après `autoMatch`, les lignes `UNMATCHED` sont
  catégorisées en arrière-plan, séquentiellement, en respectant le budget ; le
  relevé expose l'avancement.

### Task 3.4 : GraphQL et admin

- [ ] Mutations `categorizeBankLine`, `answerBankLineQuestion`,
  `acceptBankLineProposal`, `rejectBankLineProposal`,
  `bulkAcceptBankLineProposals` ; queries et mutations
  `clubCategorizationRules`, `upsertCategorizationRule`, `deleteCategorizationRule`.
- [ ] `StatementDetailPage` : carte de proposition par ligne (compte, libellé,
  confiance, badge « règle » ou « IA » avec accord des deux modèles), boutons
  Valider / Modifier / Rejeter, bulle de question avec champ de réponse,
  bouton « Tout valider (n lignes sûres) ».
- [ ] `pages/settings/accounting/CategorizationRulesTab.tsx` : liste, édition,
  désactivation, compteur d'utilisation.

### Task 3.5 : Vérification staging

- [ ] Lignes connues (EDF, loyer) → proposition claire ; ligne ambiguë →
  question → réponse → proposition ; valider ; réimporter le mois suivant →
  règles appliquées sans IA (nombre de lignes dans `AiUsageLog` inchangé).

---

## Lot 4 — Virements d'adhérents

**Livrable staging :** un virement identifié propose « encaisser la facture X
pour Y » ; un clic crée le paiement ; les virements non identifiés ont leur
filtre et se résolvent à la main ; N ↔ N.

### Task 4.1 : `member-transfer-matcher.ts`

- [ ] Avant l'IA, pour les lignes **créditrices** : extraction des jetons de
  nom (retrait de « VIR », « SEPA », dates, références) ; comparaison
  normalisée (sans accents, casse) avec les membres, contacts et familles du
  club (pas de `pg_trgm` en base : comparaison en mémoire, un club a moins de
  quelques milliers de noms) ; candidats payeurs → factures `OPEN` du foyer
  avec solde > 0 ; score : montant = solde d'une facture (fort), = somme de
  deux factures, partiel ; `externalRef` égal à la référence (fort).
- [ ] Sortie `payerProposal { memberId | contactId, allocations: [{ invoiceId, amountCents }], confidence }`.
- [ ] Tests : libellés SEPA de trois banques ; exact ; somme de deux ; aucun
  candidat ; homonymes → `SUGGESTED` avec plusieurs payeurs, jamais choisi
  seul.

### Task 4.2 : `acceptBankLineMemberPayment(lineId, allocations)`

- [ ] Pour chaque allocation, `PaymentsService.recordManualPayment` avec
  `method MANUAL_TRANSFER`, `externalRef = référence ou libellé`, payeur ; les
  gardes existantes s'appliquent (documents à signer, prélèvement en cours de
  dénouement, solde).
- [ ] `RecordManualPaymentInput.financialAccountId?` (nouveau, optionnel) : le
  compte banque du relevé, pour qu'un club multi-banques comptabilise sur le
  bon 512x ; garde : kind `BANK` et club courant.
- [ ] Les écritures créées par `tryRecordIncome` sont rapprochées de la ligne
  (recherche par `paymentId`). `recordManualPayment` n'est pas transactionnel
  avec la compta : traitement séquentiel, arrêt au premier échec, retour
  explicite de ce qui a été enregistré (jamais de succès partiel silencieux,
  cf. [échec silencieux](../../memory/pitfalls/echec-silencieux-chemin-erreur.md)).

### Task 4.3 : Non identifiés

- [ ] Ligne créditrice sans candidat → `hint = UNIDENTIFIED_TRANSFER`, filtre
  dédié « Virements non identifiés », résolution manuelle : recherche d'un
  membre ou contact, choix des factures, montants.

### Task 4.4 : GraphQL, admin, staging

- [ ] `bankLinePayerCandidates(lineId)`, `acceptBankLineMemberPayment`.
- [ ] Carte « Encaisser la facture Cotisation Léa Dupont 2026-27 (250 €) pour
  Marie Dupont », éditeur de répartition multi-factures, résolveur manuel.
- [ ] Staging : facture ouverte sur le club démo, CSV avec la ligne de virement
  correspondante, accepter → facture `PAID`, écriture rapprochée, mail de
  confirmation reçu (cf. [test e-mail staging](../../memory/INDEX.md)).

---

## Lot 5 — Chèques à encaisser, remises, bordereau, photos

**Livrable staging :** chaque chèque saisi (avec ou sans facture) va en
portefeuille 511200 avec sa photo ; une remise groupe N chèques, produit
l'écriture 512 / 5112 et un bordereau PDF ; la ligne banque « REMISE » se
rapproche de la remise.

**Réalisé le 2026-09-10 — écarts par rapport au plan :**
- Module à part `apps/api/src/cheques/` et non `accounting/cheques/` : il
  dépend de la compta, des subventions et du sponsoring, des médias et du
  PDF, et rien ne dépend de lui.
- Pas de contrôleur REST pour le bordereau : PDF généré à la remise, archivé
  en média privé, exposé en URL signée, régénérable par
  `generateChequeDepositSlip`.
- Numérotation `R-<exercice>-NNNN` par « dernier + 1 » dans la transaction,
  contrainte unique et reprise sur collision : pas de verrou `$executeRaw`.
- Task 5.4 (clé forte de rapprochement) reportée au lot 1, qui porte le
  moteur.
- Rattachement d'un chèque à une tranche de subvention ou de sponsoring :
  exposé par l'API, pas encore dans l'écran admin.
- Chèque impayé (`BOUNCED`) non livré, comme prévu.
- Le double de transaction des tests a d'abord été trop généreux, cf.
  [pitfall](../../memory/pitfalls/double-transaction-rollback-trop-genereux.md).

### Task 5.1 : Schéma et seed

- [x] `ClubFinancialAccountKind.CHEQUE_TRANSIT` ; seed du compte PCG `511200
  Chèques à encaisser` (`ASSET`) et du compte financier « Chèques à
  encaisser » (`isDefault`) dans `seedIfEmpty`, sur le modèle du
  `STRIPE_TRANSIT` ; `kindFromMethod(MANUAL_CHECK)` → `CHEQUE_TRANSIT` ;
  `repointCheckRouteToTransit` copie de `repointStripeRouteToTransit` (route
  `isDefault` **et** pointant sur la banque par défaut) ; spec miroir de
  `accounting-seed-transit.spec.ts`.
- [x] Modèles :

```prisma
enum ChequeStatus { PENDING DEPOSITED BOUNCED CANCELLED }
model Cheque {
  id, clubId, number?, drawerName, bankName?, amountCents Int,
  receivedOn @db.Date, status, paymentId? @unique, entryId?, depositId?,
  imageAssetId?, notes?, createdByUserId, createdAt, updatedAt
  @@index([clubId, status])
}
enum ChequeDepositStatus { DEPOSITED RECONCILED CANCELLED }
model ChequeDeposit {
  id, clubId, number String /* "R-2026-0007" */, financialAccountId,
  depositedOn @db.Date, totalCents Int, chequeCount Int, status,
  entryId?, bordereauAssetId?, createdByUserId, createdAt
  @@unique([clubId, number])
}
```

- [x] `AccountingEntrySource.CHEQUE_DEPOSIT` ; `AccountingAuditAction.CHEQUE_DEPOSIT`.

### Task 5.2 : `ChequesService` et `ChequeDepositsService`

- [x] `RecordManualPaymentInput.cheque?: { number?, drawerName?, bankName?, receivedOn?, imageAssetId? }` ;
  `recordManualPayment` en `MANUAL_CHECK` crée toujours un `Cheque`
  (à défaut : n° = `externalRef`, émetteur = payeur de la facture, date = jour)
  pour que les appelants existants — admin, mobile admin — ne perdent rien.
- [x] `createStandaloneCheque(input)` : chèque sans facture ; crée l'écriture
  `INCOME` (contrepartie 511200, compte 7xx choisi ou suggéré par
  `suggestAccountingCategorization`) ; lien optionnel vers un
  `GrantInstallment` ou un `SponsorshipInstallment` (`accountingEntryId`,
  `receivedAt`, `receivedAmountCents`).
- [x] `attachChequeImage(chequeId, mediaAssetId)` ; upload via
  `/media/upload?kind=image&ownerKind=CHEQUE&ownerId=<chequeId>`.
- [x] `createDeposit({ financialAccountId, depositedOn, chequeIds })` : gardes
  (tous `PENDING`, même club, banque de kind `BANK`, date ≥ chaque
  `receivedOn`, mois ouvert) ; **une transaction** : numéro séquentiel par
  club (`$executeRaw` avec verrou de ligne sur un compteur par club, testé
  en e2e), remise, écriture `TRANSFER` DÉBIT 512x / CRÉDIT 511200 libellée
  « Remise de chèques R-2026-0007 (n chèques) » datée du dépôt,
  `source CHEQUE_DEPOSIT`, chèques → `DEPOSITED` avec `depositId`.
- [x] `cancelDeposit` : seulement sans rapprochement bancaire et mois ouvert ;
  contre-passation, chèques → `PENDING`.
- [x] Tests : seed et redirection conditionnelle ; transaction de remise
  (mutation : sortir le passage des chèques de la transaction → rouge) ;
  numérotation sans doublon sous concurrence (e2e) ; gardes.

### Task 5.3 : Bordereau PDF

- [x] `apps/api/src/pdf/cheque-deposit-pdf.service.ts` (pdfkit, comme
  `invoice-pdf.service.ts`) : club, IBAN du compte banque, n° et date de
  remise, tableau (n° chèque, émetteur, banque, montant), total, nombre,
  cadre signature. Contrôleur `GET /cheque-deposits/:id/pdf` sur le modèle de
  `invoice-pdf.controller.ts` (auth et club).
- [x] Le PDF est rendu à la création et stocké en `MediaAsset` privé
  (`bordereauAssetId`) : la remise est l'unité d'archive, avec les photos.

### Task 5.4 : Rapprochement (extension du lot 1)

- [ ] Clé forte : libellé contenant « REMISE » ou les chiffres du n° de
  bordereau, montant = total, dans la fenêtre → `MATCHED`, remise →
  `RECONCILED`.

### Task 5.5 : GraphQL et admin

- [x] `clubCheques(status)`, `clubCheque(id)`, `createStandaloneCheque`,
  `updateCheque`, `attachChequeImage`, `clubChequeDeposits`,
  `clubChequeDeposit(id)`, `createChequeDeposit`, `cancelChequeDeposit` ;
  extension de `recordManualPayment`. Test de construction du schéma.
- [x] `/comptabilite/cheques` : onglets « En portefeuille » (sélection →
  « Créer la remise »), « Remises » (détail avec chèques, photos, lien PDF),
  « Nouveau chèque » (formulaire libre avec photo).
- [x] `pages/billing/InvoiceDetailDrawer.tsx` : quand la méthode est chèque,
  champs n°, émetteur, banque, date de réception, photo.
- [x] `apps/mobile-admin/src/screens/billing/RecordPaymentScreen.tsx` : mêmes
  champs, photo par la caméra (le chèque se photographie au moment où on le
  reçoit, souvent au dojo).

### Task 5.6 : Vérification staging

- [x] Fait le 2026-09-10 sur `club-demo` (staging), dans la session Chrome de
  Florent : au premier chargement des réglages, le seed a créé le compte
  « Chèques à encaisser » (511200) et redirigé la route chèque depuis la
  banque ; chèque hors facture « Mairie de Saint-Denis » 120,00 € sur 754000
  (écriture 511200 débit / 754000 crédit, audit CREATE) ; remise
  `R-2026-0001` sur Banque principale (écriture 512000 débit / 511200 crédit,
  chèque DEPOSITED, bordereau PDF archivé en média privé et servi en URL
  signée, 200 `application/pdf`) ; annulation motivée (contre-passation
  inversée, chèque de retour en portefeuille, remise CANCELLED, audit
  CHEQUE_DEPOSIT_CANCEL). Aucune erreur API sur ces opérations.
- [x] Deux bugs trouvés et corrigés en vérifiant : le journal d'audit écrivait
  hors de la transaction de l'appelant (P2003, transaction annulée) ; le mode
  et la référence de paiement d'une écriture manuelle n'étaient jamais
  persistés.
- [ ] Non rejoué sur staging : paiement de facture par chèque (aucune facture
  ouverte sur `club-demo` ; chemin couvert par
  `payments-record-manual.spec.ts`) ; rapprochement de la ligne « REMISE »
  (lot 1).

---

## Lot 6 — Frais avancés par un bénévole

**Livrable staging :** un reçu peut être marqué « avancé par X », le club voit
sa dette par bénévole, un remboursement groupé solde plusieurs reçus et se
rapproche de la ligne banque.

### Task 6.1 : Schéma et seed

- [ ] Seed `467100 Bénévoles, frais avancés à rembourser` (`LIABILITY`).
- [ ] `AccountingEntry.advancedByMemberId?` + relation `Member` + index.
- [ ] `VolunteerReimbursement { id, clubId, memberId, financialAccountId, paidOn @db.Date, totalCents, entryId?, status, createdByUserId, createdAt }`
  et `VolunteerReimbursementItem { id, reimbursementId, entryId, amountCents }`
  (`@@unique([reimbursementId, entryId])`).
- [ ] `AccountingEntrySource.VOLUNTEER_REIMBURSEMENT`.

### Task 6.2 : `VolunteerAdvancesService`

- [ ] `setAdvancedBy(entryId, memberId | null)` : en `NEEDS_REVIEW` (ou
  `DRAFT`), remplace la ligne de contrepartie 51x/53x par 467100 `CREDIT`
  (et inversement), met `financialAccountId` à nul (ou le restaure) ;
  en `POSTED`, refus : passer par contre-passation.
- [ ] `balances(clubId)` : Σ crédits 467100 par `advancedByMemberId` − Σ
  remboursements ; `openItems(memberId)`.
- [ ] `recordReimbursement({ memberId, financialAccountId, paidOn, entryIds })` :
  une transaction : écriture `TRANSFER` DÉBIT 467100 / CRÉDIT 512x du total,
  items, `source VOLUNTEER_REIMBURSEMENT`.
- [ ] Tests : bascule de contrepartie ; solde ; remboursement partiel refusé
  si un item n'est pas ouvert ; transaction (mutation → rouge).

### Task 6.3 : Rapprochement (extension du lot 1)

- [ ] Lignes **débitrices** dont le libellé contient le nom d'un membre à solde
  467 positif → proposition « Rembourser 3 notes de Jean Dupont = 87,40 € »
  quand la somme des items ouverts est égale ; sinon sélection manuelle des
  items ; accepter → `recordReimbursement` + match, même transaction.

### Task 6.4 : GraphQL et admin

- [ ] `setAccountingEntryAdvancedBy`, `volunteerAdvanceBalances`,
  `volunteerOpenItems(memberId)`, `recordVolunteerReimbursement`,
  `acceptBankLineVolunteerReimbursement`.
- [ ] `AccountingReviewDrawer.tsx` : « Payé depuis » gagne l'option « Avancé
  par un bénévole » avec sélecteur de membre.
- [ ] `/comptabilite/benevoles` : soldes, détail des items, « Enregistrer un
  remboursement » ; carte de proposition dans le détail de relevé.

### Task 6.5 : Vérification staging

- [ ] Trois reçus « avancés par » un membre du club démo ; solde affiché ;
  CSV avec le virement de remboursement → proposition → accepter → solde 0,
  ligne rapprochée.

---

## Lot 7 — Livre de caisse

**Livrable staging :** par caisse, le livre avec solde courant, un comptage
qui fait office de relevé, l'écart validé comme écriture, dépôt et retrait
d'espèces rapprochables.

### Task 7.1 : Schéma et seed

- [ ] `CashCount { id, clubId, financialAccountId, countedOn @db.Date, countedCents, expectedCents, deltaCents, note?, adjustmentEntryId?, countedByUserId, createdAt }`.
- [ ] Seed `658000 Charges diverses de gestion courante (écarts de caisse)`
  (`EXPENSE`) ; `758000` existe déjà pour les écarts positifs.
- [ ] `AccountingEntrySource.CASH_ADJUSTMENT`, `CASH_TRANSFER`.

### Task 7.2 : `CashBookService`

- [ ] `book(financialAccountId, from, to)` : écritures du compte dans les deux
  sens, solde courant depuis `openingBalanceCents` (lot 0).
- [ ] `recordCount({ financialAccountId, countedOn, countedCents, note })` :
  calcule `expectedCents` à la date, `deltaCents` ; **ne crée aucune
  écriture**. `validateCashCount(countId)` crée l'écriture d'écart
  (658000 ou 758000 contre 53x) datée du comptage. Test : compter ne
  comptabilise pas (mutation → rouge).
- [ ] `recordCashTransfer({ fromAccountId, toAccountId, amountCents, on, note })` :
  `TRANSFER` 53 → 51 (dépôt) ou 51 → 53 (retrait), `source CASH_TRANSFER`,
  rapproché ensuite par la ligne banque « VERSEMENT ESPECES » / « RETRAIT ».

### Task 7.3 : GraphQL et admin

- [ ] `clubCashBook`, `clubCashCounts`, `recordCashCount`, `validateCashCount`,
  `recordCashTransfer`.
- [ ] `/comptabilite/caisse` : sélecteur de caisse, livre, « Compter la
  caisse », « Déposer en banque », « Retirer de la banque », historique des
  comptages.

### Task 7.4 : Vérification staging

- [ ] Encaissement espèces, dépense en caisse, comptage avec écart, validation,
  dépôt en banque, CSV avec « VERSEMENT ESPECES » → rapproché.

---

## Lot 8 — Stripe par API

**Livrable staging :** le transit Stripe est vérifié tous les jours ; un
`payout.paid` manqué est rattrapé ; toute transaction Stripe inconnue de
ClubFlow devient une ligne à catégoriser sur le transit.

### Task 8.1 : `StripeTransitSyncService` (module `payments`)

- [ ] Cron quotidien 04:30 `Indian/Reunion`, verrou `stripeTransitSync`
  (nouvelle clé dans `SCHEDULER_LOCK_KEYS`, distincte des verrous
  financiers, même raisonnement que `shopStockThresholdSweep`).
- [ ] Pour chaque club avec `stripeAccountId`, module compta actif et
  `accountingStartsOn` : `stripe.payouts.list({ arrival_date: { gte } }, { stripeAccount })`
  depuis la dernière synchro ou la reprise ; virement `paid` sans écriture →
  `recordStripePayout` (rattrapage).
- [ ] Par virement : `stripe.balanceTransactions.list({ payout, limit: 100 }, { stripeAccount })`,
  classement : `charge`/`payment` → `Payment` par `stripeBalanceTransactionId`
  ou `externalRef` ; `refund` → `Payment` négatif par `stripeRefundId` ;
  `stripe_fee` → couvert par `stripeFeeCents` ; `payout` lui-même ; **inconnu**
  → ligne d'un `BankStatement` synthétisé (`format STRIPE_API`,
  `financialAccountId` = transit, une période par mois, `READY` direct car
  l'arithmétique est fournie par Stripe : Σ connues + inconnues = net du
  virement).
- [ ] Mutation `syncStripeTransit` pour un déclenchement manuel.
- [ ] Tests avec Stripe mocké, sur le modèle de `stripe-fees.service.spec.ts` :
  rattrapage idempotent (`@@unique([clubId, stripePayoutId])`), inconnue →
  ligne, connue → rien.

### Task 8.2 : Admin et staging

- [ ] `ReconciliationPage` liste le compte de transit avec ses relevés
  synthétisés et « Vérifier maintenant ».
- [ ] Staging (Stripe test) : synchro sans inconnue ; paiement créé depuis le
  dashboard Stripe test → ligne à catégoriser sur le transit.

---

## Scénario de recette de bout en bout (après le lot 8)

Sur le club démo staging, un mois complet : encaissements Stripe, deux chèques
remis, un virement d'adhérent, trois reçus avancés par un bénévole, une
dépense en caisse et un dépôt d'espèces, puis dépôt du relevé bancaire PDF du
mois. Attendu : intégrité OK, toutes les lignes rapprochées ou catégorisées,
soldes 511200 et 467100 à 0 après remise et remboursement, solde 512x de
ClubFlow égal au solde de fin du relevé.

## Hors périmètre, noté pour plus tard

- Chèque impayé (`BOUNCED`) avec contre-passation et réouverture de facture.
- Abandon de créance d'un bénévole et reçu fiscal (Cerfa 11580).
- Agrégateur bancaire (ADR-0014, « Quand reconsidérer »).
- Saisie de relevés depuis l'app mobile ; seule la photo de chèque y est prévue.
