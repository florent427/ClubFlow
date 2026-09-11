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

- [x] `AccountingEntrySource` : `BANK_IMPORT`. `AccountingAuditAction` :
  `STATEMENT_IMPORT`, `RECONCILE`, `UNRECONCILE`. `ClubFinancialAccount.csvMappingJson Json?`.
- [x] `register-enums.ts`. `db push`.

### Task 1.2 : Parseurs (fonctions pures)

- [x] `ofx-parser.ts` : SGML et XML ; `STMTTRN` (`DTPOSTED` → date, `TRNAMT` →
  centimes, `FITID`, `NAME`/`MEMO` → libellé, `REFNUM` → référence) ;
  `LEDGERBAL` → solde de fin daté ; solde de début = fin − Σ. Encodage
  UTF-8 ou cp1252 (`TextDecoder('windows-1252')`, natif Node).
- [x] `csv-parser.ts` : détection du séparateur (`;` ou `,`), du BOM, de
  l'encodage, du format de date et du séparateur décimal ; détection des
  colonnes par mots-clés d'en-tête (date, libellé, débit, crédit, montant,
  solde) ; mapping explicite `{ dateCol, labelCol, debitCol?, creditCol?, amountCol?, balanceCol?, dateFormat, decimalSeparator }`
  mémorisé sur le compte financier ; renvoie un aperçu pour confirmation.
- [x] Fixtures anonymisées de deux banques dans `__fixtures__/` ; tests
  table-driven `ofx-parser.spec.ts`, `csv-parser.spec.ts` (montants négatifs,
  virgule décimale, dates `dd/mm/yyyy`, libellés multi-lignes).

### Task 1.3 : `BankStatementService`

- [x] `importStatement(clubId, userId, input)` : charge le `MediaAsset` (kind
  `DOCUMENT`, privé, `ownerKind = 'BANK_STATEMENT'`), choisit le parseur,
  crée relevé + lignes en une transaction, calcule l'intégrité, pose le statut.
  Gardes : compte financier du club et de kind `BANK` ; `accountingStartsOn`
  défini (sinon `BadRequest` qui renvoie vers les paramètres) ; pas de
  chevauchement ; chaînage ; lignes antérieures à la reprise → `IGNORED` /
  `BEFORE_TAKEOVER`.
- [x] `statement-integrity.ts` (pur) : `check(opening, lines, closing, previousClosing)`
  → `{ ok, deltaCents, chainOk }`.
- [x] **Invariant** : `transitionAfterIntegrity(statementId)` est l'unique
  chemin vers `READY`. Test : un relevé dont le delta ≠ 0 ne peut pas être
  `READY` ; mutation (poser `READY` ailleurs) → rouge.
- [x] `updateLine` / `addLine` / `removeLine` : permis tant que la ligne n'a
  aucun match ; recalcul de l'intégrité et du statut après chaque édition.
- [x] `deleteStatement` : refusé s'il existe une ligne `MATCHED` ; sinon
  supprime en cascade et libère le chaînage du suivant (qui repasse en
  `NEEDS_CHECK`).
- [x] Garde du lot 0 : `accountingStartsOn` ne peut plus reculer après le
  premier relevé.

### Task 1.4 : `BankReconciliationService`

- [x] `autoMatch(statementId)` : candidats = écritures `POSTED` ou `LOCKED` du
  même `financialAccountId`, ligne 51x avec `bankReconciledAt` nul,
  `occurredAt` dans ± `MATCH_WINDOW_DAYS` (10), même montant, sens cohérent
  (crédit de la ligne ↔ débit du 51x sur l'écriture).
- [x] Clés fortes, dans l'ordre : libellé contenant « STRIPE » et écriture avec
  `stripePayoutId` ; n° de remise dans le libellé (lot 5) ;
  `Payment.externalRef` égal à la référence de la ligne ; sinon candidat
  unique sur montant + date. Clé forte ou candidat unique → `MATCHED`
  (`origin AUTO`) ; plusieurs candidats → `SUGGESTED` avec `candidateEntryIds` ;
  aucun → `UNMATCHED`.
- [x] `match(lineId, [{ entryId, amountCents }], userId)` : Σ = |montant de la
  ligne| pour N écritures ↔ 1 ligne ; une écriture peut être couverte par
  plusieurs lignes (1 ↔ N), chaque match portant sa part ; `bankReconciledAt`
  posé sur la ligne 51x quand l'écriture est entièrement couverte.
  `unmatch(lineId)` retire les matches et **efface** `bankReconciledAt`.
- [x] Écriture d'un mois verrouillé : rapprochable (commentaire explicite dans
  le service, test dédié).
- [x] Audit `RECONCILE` / `UNRECONCILE` avec `metadata { lineId, entryIds }`.
- [x] Tests : bornes de fenêtre ; sens ; unique contre ambigu ; N ↔ 1 ; 1 ↔ N ;
  `unmatch` efface le flag (mutation : oublier l'effacement → rouge) ; écriture
  verrouillée rapprochable ; ligne hors reprise ignorée.

### Task 1.5 : GraphQL (`bank-import.resolver.ts`)

- [x] Types `BankStatementGraph`, `BankStatementLineGraph` (avec `matches`,
  `candidates`), `BankStatementIntegrityGraph`, `ReconciliationSummaryGraph`.
- [x] Queries : `clubBankStatements(financialAccountId?)`, `clubBankStatement(id)`,
  `bankLineCandidates(lineId)` (écritures de la fenêtre, tout montant, pour
  le rapprochement manuel), `clubReconciliationSummary` (par compte : dernier
  relevé, lignes à traiter, écritures non rapprochées).
- [x] Mutations : `importBankStatement(input)`, `previewCsvStatement(mediaAssetId, mapping?)`,
  `updateBankStatementLine`, `addBankStatementLine`, `removeBankStatementLine`,
  `deleteBankStatement`, `autoMatchBankStatement(id)`, `matchBankLine`,
  `unmatchBankLine`, `ignoreBankLine(lineId, reason)`, `unignoreBankLine`.
- [x] Test de construction du schéma.

### Task 1.6 : Admin

- [x] Routes `/comptabilite/rapprochement` et `/comptabilite/rapprochement/:statementId`
  dans `App.tsx` ; sous-entrée dans `nav-config.ts` (le préfixe
  `/comptabilite` est déjà mappé sur le module `ACCOUNTING` dans
  `club-modules-nav.ts`).
- [x] `pages/accounting/reconciliation/ReconciliationPage.tsx` : par compte
  financier, chaîne des relevés avec statut, bouton « Déposer un relevé ».
- [x] `ImportStatementDialog.tsx` : compte, format déduit de l'extension,
  aperçu CSV avec sélection des colonnes, saisie des soldes de début et de fin
  pour le CSV, upload via `/media/upload?kind=document&ownerKind=BANK_STATEMENT`.
- [x] `StatementDetailPage.tsx` : bandeau d'intégrité (delta, chaînage,
  chevauchement) ; tableau des lignes filtrable par statut ; actions par ligne
  (rapprocher, détacher, ignorer, corriger) ; `MatchDrawer.tsx` avec la liste
  des candidats, cases à cocher, montants et somme courante.
- [x] `AccountingPage.tsx` : pastille « Rapproché » sur les écritures dont la
  ligne 51x porte `bankReconciledAt` (touche minimale, le fichier fait déjà
  2 700 lignes ; ne rien y ajouter d'autre).

### Task 1.7 : Vérification staging

- [x] Déposer un OFX réel anonymisé sur le club démo ; intégrité OK ; un
  virement Stripe et un virement manuel rapprochés automatiquement ; un
  rapprochement N ↔ 1 manuel ; détacher ; vérifier
  `select status, count(*) from "BankStatementLine" group by status` et
  `bankReconciledAt` sur les lignes 51x.

### Réalisé (2026-09-11)

- [x] Fait sur `staging` le 2026-09-11 sur `club-demo`, dans la session Chrome
  de Florent. OFX de septembre (3 lignes, soldes 1 234,56 → 1 328,66 €) :
  contrôle OK, chaînage sur le solde d'ouverture du compte, ligne « ANNULATION
  REMISE CHQ R-2026-0001 » rapprochée automatiquement par clé forte
  (`CHEQUE_DEPOSIT` + « REMISE »), fichier archivé (`application/x-ofx`) ;
  ligne EDF ignorée avec motif ; deux cotisations manuelles de 100 et 150 €
  rapprochées N ↔ 1 sur le virement de 250 € (parts dans
  `BankStatementLineMatch`, audit RECONCILE avec allocations) ; détacher
  (audit UNRECONCILE, flag effacé) puis « Relancer l'automatique »
  (re-rapprochée, `origin AUTO`) ; relevé `RECONCILED`. CSV d'octobre (`;`,
  en-tête, débit/crédit, virgule) : mapping détecté puis mémorisé sur le
  compte ; soldes saisis ; un premier dépôt avec un solde de fin faux →
  `NEEDS_CHECK` (écart −11,24 €) → suppression (lignes et fichier supprimés,
  audit STATEMENT_DELETE) → redépôt juste → `READY`, chaîné sur la fin du
  relevé OFX ; « + Ligne manquante » → écart −3,50 € → « Retirer » → `READY`.
  `select status, count(*)` : MATCHED 2, IGNORED 1 (septembre) ;
  `bankReconciledAt` posé sur les trois lignes 512000, pastille « Rapproché »
  visible dans Écritures. Aucune erreur API (13 avant, 13 après).
- [x] Garde de la date de reprise vérifiée dans Paramètres → Comptabilité →
  Exercice : « Un relevé bancaire a déjà été déposé … » ; même date resoumise
  acceptée.
- [x] Un bug trouvé et corrigé en vérifiant : `createClubAccountingEntry`
  renvoyait « la plus récente du club » au lieu de l'écriture créée
  (`accounting-manual-entry-return.spec.ts`).

### Écarts par rapport au plan

- Le fichier OFX/CSV est envoyé en base64 dans la mutation (limite JSON
  portée à 8 Mo) et archivé côté serveur après lecture, au lieu d'un upload
  média préalable : un seul aller-retour, pas d'orphelin si la lecture échoue.
  `previewCsvStatement(contentBase64, mapping?)` de même.
- L'intégrité est portée par le relevé (`integrityDeltaCents`, `chainOk`,
  `chainExpectedCents`) plutôt que par un `BankStatementIntegrityGraph`
  séparé ; le mapping CSV mémorisé est exposé sur
  `ClubFinancialAccountGraph.csvMapping`.
- Fixtures de banques inline dans les specs (BFCOI, Banque Postale, Qonto)
  plutôt qu'un dossier `__fixtures__/`.
- La date de reprise est figée dans les deux sens dès qu'un relevé existe (pas
  seulement « ne peut plus reculer ») : dans les deux cas les lignes déjà
  découpées deviendraient fausses sans signal.
- Le rapprochement automatique ne journalise pas chaque ligne (l'import est
  journalisé, les matches portent `origin AUTO`) ; seuls les rapprochements
  manuels et les détachements produisent RECONCILE / UNRECONCILE.
- `ImportStatementDialog` → `ImportStatementDrawer` (tiroir, comme le reste de
  l'admin). Apollo ajoute `__typename` aux objets lus : le mapping est recopié
  avant renvoi (pitfall `apollo-typename-dans-les-inputs`).

### À faire plus tard

- Modifier les soldes saisis d'un relevé CSV sans le supprimer.

---

## Lot 2 — Lecture PDF par deux modèles

**Livrable staging :** dépôt d'un relevé PDF ; deux lectures indépendantes ;
lignes divergentes mises en évidence ; contrôle bloquant.

### Task 2.1 : Extraction de l'outillage OCR

- [x] Sortir de `receipt-ocr.service.ts` vers `ocr-shared.ts` : `extractPdfText`,
  `loadPdfToImg`, rastérisation et tuilage, `pickVisionModel`,
  `VISION_CAPABLE_MODELS`. Les specs existantes de l'OCR reçus restent
  vertes sans modification.

### Task 2.2 : `BankStatementOcrService`

- [x] Deux lectures en parallèle (`Promise.allSettled`) : modèle A =
  `pickVisionModel(textModel)` ; modèle B = `textFallbackModel` s'il est
  vision et différent de A, sinon `DEFAULT_VISION_MODEL_B = 'google/gemini-2.5-flash'`.
  Prompt : JSON strict `{ iban?, periodStart, periodEnd, openingBalanceCents, closingBalanceCents, lines: [{ bookedOn, valueOn?, label, amountCents, balanceAfterCents? }] }`,
  texte natif du PDF fourni comme vérité textuelle quand il existe ; relevés
  longs traités page par page avec continuité du solde courant.
- [x] `merge-readings.ts` (pur) : appariement par (date, montant) puis
  similarité de libellé ; lignes appariées → `readingAgreement = true` ;
  présentes d'un seul côté ou en désaccord de montant ou de date → incluses
  avec `readingAgreement = false` et `divergenceJson { kind: ONLY_IN_A | ONLY_IN_B | AMOUNT | DATE, a, b }` ;
  soldes comparés de la même façon.
- [x] Puis `statement-integrity.check` : le relevé n'est `READY` que par
  `transitionAfterIntegrity`. Les deux lectures en échec → `FAILED` avec
  message, relance ou dépôt en CSV proposés.
- [x] Budget : `AiBudgetService.checkBudget` avant ; coût journalisé sous
  `AiUsageFeature.BANK_STATEMENT_OCR` (nouvelle valeur) via `logUsage` et
  `incrementUsage` ; cap atteint → PDF refusé avec message, OFX et CSV
  intacts.
- [x] Persistance de `readingAJson`, `readingBJson`, modèles, coût.
- [x] Tests : `merge-readings.spec.ts` (accord, présence d'un seul côté,
  désaccord de montant) ; intégrité après fusion ; budget bloqué ; un cas où
  les deux lectures concordent mais l'arithmétique est fausse → `NEEDS_CHECK`
  (c'est le test qui prouve que le contrôle est le juge, pas l'accord).

### Task 2.3 : GraphQL et admin

- [x] `importBankStatement` en format PDF lance la lecture en arrière-plan
  (statut `PARSING`, même schéma que `aiProcessingStartedAt` des reçus) ; le
  client sonde `clubBankStatement` ; mutation `rerunBankStatementReading(id)`.
- [x] `StatementDetailPage` : lignes divergentes surlignées, image de la page
  (URL signée du média) en regard, édition inline, bouton « Relancer le
  contrôle ».

### Task 2.4 : Vérification staging

- [ ] Deux PDF réels de banques différentes ; delta 0 ; fausser une ligne à la
  main → `NEEDS_CHECK` ; corriger → `READY` ; vérifier le coût dans
  `AiUsageLog`.

### Réalisé (2026-09-11)

- [x] Lecture réelle vérifiée en local (clé OpenRouter du poste, script
  temporaire `ts-node` dans `apps/api`) sur un relevé PDF synthétique d'une
  page : 7 lignes de tableau dont « ancien solde » et « nouveau solde » en
  tête et pied. Sonnet 4.5 et Gemini 2.5 Flash rendent les 6 opérations
  identiques, signes et centimes justes, soldes 1 234,56 → 1 384,26 €,
  delta 0, 13 s, ~1 centime. Le texte natif de ce PDF (généré par pdfkit)
  n'a pas pu être extrait (« bad XRef entry » de pdf-parse v1) : l'image
  seule a suffi.
- [x] Tests : fusion (accord, ONLY_IN_A/B, DATE, AMOUNT, lecture unique,
  soldes divergents), analyse tolérante de la réponse, prompt, service avec
  doubles (READY ; arithmétique fausse malgré l'accord → NEEDS_CHECK ;
  divergence de date à delta 0 → NEEDS_CHECK ; un modèle en échec ; deux en
  échec → FAILED ; chevauchement ; budget). Deux mutations à la main (garde
  des divergences retirée ; budget non vérifié) → rouge.
- [x] Vérifié de bout en bout sur staging le 2026-09-11, une fois la clé
  OpenRouter ajoutée par Florent au club démo : le premier dépôt a échoué
  (« Asset introuvable » : le fichier privé était lu sans le contexte du
  club — corrigé, test ajouté) ; après relance, le PDF synthétique
  (`releve-demo-2026-09.pdf`) est lu par Sonnet 4.5 et Gemini 2.5 Flash en
  ≈ 25 s : 6 lignes identiques, soldes 1 234,56 → 1 384,26 €, delta 0,
  chaîné sur le solde d'ouverture, `READY`, ligne « REMISE » rapprochée
  automatiquement, coût 2 c journalisé (`AiUsageLog` × 2, `AiMonthlyUsage`
  sous `BANK_STATEMENT_OCR`), audit PARSING → RERUN → READ. Deux vrais PDF
  de banques différentes restent à passer quand Florent en aura.
- [x] Deuxième trou trouvé en vérifiant : un relevé déposé APRÈS un relevé
  plus récent (CSV d'octobre déposé avant le PDF de septembre) laissait
  celui-ci chaîné sur le solde d'ouverture du compte, donc « à vérifier ».
  Chaînage et contrôle sortent dans `BankStatementIntegrityService`
  (partagé import OFX/CSV et lecture PDF) ; le premier relevé suivant est
  recalculé après chaque arrivée. Test de non-régression (mutation → rouge).
  Sur staging, le CSV d'octobre a été remis dans la continuité du PDF
  (soldes 1 384,26 → 1 444,36 €) : `READY`.
- [x] Vérifié sur staging le 2026-09-11 : PDF refusé sans clé (aucun relevé
  ni fichier créé, message vers OFX/CSV) ; « Corriger les soldes » sur le
  relevé CSV d'octobre (solde de fin faux → « À vérifier », écart −11,24 € ;
  rétabli → « À rapprocher », audit UPDATE avant/après) ; « Relancer le
  contrôle ». Mutations et champs présents à l'introspection, valeur
  `BANK_STATEMENT_OCR` en base. Aucune erreur API.


### Écarts par rapport au plan

- Lecture par paquets de 3 pages (solde courant transmis au paquet suivant)
  plutôt que strictement page par page ; au-delà de 10 pages, le reste n'est
  pas lu.
- Les désaccords sur les soldes ne bloquent pas par eux-mêmes : la lecture A
  est retenue et le désaccord affiché, c'est l'arithmétique qui tranche. Les
  divergences de ligne bloquent jusqu'à confirmation, correction ou retrait
  (`deriveStatementStatus` reste l'unique chemin vers READY).
- Le PDF est affiché en regard via l'URL signée du fichier (iframe), pas une
  image rasterisée par page.
- « Corriger les soldes » (renvoyé « à plus tard » au lot 1) est livré ici :
  indispensable pour un PDF dont les soldes ne sont pas lus.
- Pas de `BankStatementIntegrityGraph` : mêmes choix qu'au lot 1.

---

## Lot 3 — Catégorisation des lignes orphelines

**Livrable staging :** chaque ligne `UNMATCHED` reçoit une proposition (règle
ou IA), l'IA pose une question quand ce n'est pas clair, le trésorier valide
ligne par ligne ou en lot, les validations créent des règles.

### Task 3.1 : Schéma

- [x] `AccountingCategorizationRule { id, clubId, pattern, matchKind CONTAINS|STARTS_WITH|REGEX, direction CREDIT|DEBIT|ANY, accountCode, projectId?, label?, source LEARNED|MANUAL, hitCount, lastHitAt?, isActive, createdByUserId, createdAt, updatedAt } @@index([clubId, isActive])`.
- [x] `BankStatementLine` : `aiProposalJson?`, `aiQuestion?`, `aiConversationJson?`,
  `aiAttempts Int @default(0)`, `aiExhausted Boolean @default(false)`,
  `ruleId?`, `proposedEntryId?`.

### Task 3.2 : Moteur de règles (pur, `categorization-rules.ts`)

- [x] Normalisation du libellé : majuscules, retrait des dates, numéros et
  références, espaces réduits. Application par ordre de spécificité (motif le
  plus long d'abord) et de sens. Tests : « PRLV SEPA EDF 12/08 REF 123 » →
  règle « EDF » ; règle DEBIT ne s'applique pas à un crédit.

### Task 3.3 : `BankLineCategorizationService`

- [x] `categorize(lineId)` : 1) règles → proposition `{ accountCode, projectId?, label, confidence: 100, ruleId }` ;
  2) sinon deux modèles texte en parallèle (`textModel`, `textFallbackModel`) avec
  un prompt dérivé de `AccountingSuggestionService.buildPrompt` enrichi du sens,
  du compte financier, des règles du club, des 20 dernières lignes validées aux
  jetons proches (mémoire few-shot) et des tours de dialogue.
  **Clair** = deux réponses, même compte, confiance minimale ≥ 80 ; un seul
  modèle configuré → clair seulement si ≥ 90. Sinon le modèle le plus confiant
  formule **une** question (≤ 200 caractères) → `aiQuestion`.
- [x] `answerQuestion(lineId, answer)` : ajoute le tour, relance ; au troisième
  échec `aiExhausted = true`, saisie manuelle proposée.
- [x] **Matérialisation** : toute proposition (claire ou après dialogue) crée
  une écriture `NEEDS_REVIEW`, `source BANK_IMPORT`, `occurredAt = bookedOn`,
  `financialAccountId` du relevé, deux lignes (51x contrepartie + compte
  proposé avec `iaSuggestedAccountCode`, `iaReasoning`, `iaConfidencePct`) ;
  `proposedEntryId` sur la ligne ; sens : crédit → `INCOME`, débit →
  `EXPENSE`, compte 51x/53x → `TRANSFER`. Elle apparaît donc dans
  `clubAccountingReviewQueue` : **une seule boîte de réception**.
- [x] Validation : depuis l'écran de rapprochement (`acceptBankLineProposal`,
  avec surcharges compte/projet/libellé) ou depuis la file de revue existante.
  Dans les deux cas, le passage en `POSTED` appelle
  `BankReconciliationService.onEntryPosted(entryId)` qui crée le match et
  passe la ligne `MATCHED`, dans la même transaction. Refactor préalable : un
  seul point de passage vers `POSTED` dans `AccountingService` (`markPosted`),
  utilisé par `validateAccountingEntryLine` et `confirmExtraction`.
- [x] Rejet : `rejectBankLineProposal` supprime l'écriture `NEEDS_REVIEW` et
  remet la ligne `UNMATCHED` avec `aiExhausted = true`.
- [x] Apprentissage : à la validation, si aucune règle n'a servi, création
  d'une règle `LEARNED` sur le jeton de contrepartie normalisé ; si une règle
  a servi, `hitCount++`.
- [x] **Invariant** : `bulkAcceptBankLineProposals(lineIds)` n'accepte que les
  lignes dont la proposition est claire, **revérifié côté serveur** ; test par
  mutation (retirer la revérification → rouge).
- [x] Déclenchement : après `autoMatch`, les lignes `UNMATCHED` sont
  catégorisées en arrière-plan, séquentiellement, en respectant le budget ; le
  relevé expose l'avancement.

### Task 3.4 : GraphQL et admin

- [x] Mutations `categorizeBankLine`, `answerBankLineQuestion`,
  `acceptBankLineProposal`, `rejectBankLineProposal`,
  `bulkAcceptBankLineProposals` ; queries et mutations
  `clubCategorizationRules`, `upsertCategorizationRule`, `deleteCategorizationRule`.
- [x] `StatementDetailPage` : carte de proposition par ligne (compte, libellé,
  confiance, badge « règle » ou « IA » avec accord des deux modèles), boutons
  Valider / Modifier / Rejeter, bulle de question avec champ de réponse,
  bouton « Tout valider (n lignes sûres) ».
- [x] `pages/settings/accounting/CategorizationRulesTab.tsx` : liste, édition,
  désactivation, compteur d'utilisation.

### Task 3.5 : Vérification staging

- [x] Fait sur `staging` le 2026-09-11 sur `club-demo`, sur les 7 lignes
  restées à traiter après les lots 1 et 2. « Catégoriser 5 lignes » sur le
  relevé PDF : 4 propositions sûres (cotisation 706100, EDF 606100,
  subvention mairie 742000, frais bancaires 627000, toutes à 95 % avec un
  seul modèle configuré) et 1 question sur la ligne Decathlon — « qu'avez-vous
  acheté chez Decathlon pour 89,90 € ? ». Réponse « des tapis de sol pour le
  dojo, du petit équipement sportif » → proposition 606300. « Tout valider
  (5 sûres) » : 5 écritures POSTED `BANK_IMPORT`, 5 liaisons `PROPOSAL`,
  `bankReconciledAt` posé, relevé `RECONCILED`, 5 règles apprises.
- [x] Règles réutilisées sans IA : sur le relevé CSV, « CARTE 04/10 DECATHLON
  ST DENIS » est proposée par la règle à 100 % sans appel modèle (AiUsageLog
  inchangé), tandis que « VIR SEPA MARTIN PAUL COTISATION » consomme un appel
  et cite la décision passée sur DUPONT (mémoire few-shot). 7 appels et
  7 centimes au total pour les 8 lignes.
- [x] Rejet puis relance sur la ligne Decathlon : écriture supprimée, ligne
  rendue au traitement manuel, relance → la règle repropose → validée.
  `hitCount` de la règle DECATHLON à 2.
- [x] Une seule boîte de réception : les propositions apparaissent dans
  Comptabilité en « À valider » avec la source BANK_IMPORT ; valider depuis
  cet écran comptabilise ET rapproche la ligne (`markPosted` →
  `onEntryPosted`). Les deux relevés finissent `RECONCILED`, 8 lignes
  rapprochées, aucune erreur API.
- [x] Un trou trouvé en vérifiant : cette validation-là n'apprenait aucune
  règle. L'apprentissage est sorti dans `CategorizationLearningService`,
- [x] Déclenchement automatique vérifié : un relevé OFX de novembre déposé
  après le correctif (une ligne « PRLV SEPA ORANGE SA ») arrive avec sa
  proposition sans rien cliquer — 626000 Frais postaux et télécommunications
  à 95 %. Validée depuis la file de revue : écriture comptabilisée, ligne
  rapprochée, relevé `RECONCILED`, et règle « ORANGE » (DEBIT → 626000)
  apprise cette fois. 8 appels IA au total sur le club démo.
  appelé par les deux chemins ; test dédié de `onEntryPosted`.

### Écarts par rapport au plan

- « Clair » a une règle de plus que prévu : quand un seul des deux modèles
  répond (l'autre a échoué), on retombe sur le seuil du modèle unique, 90 %,
  au lieu de refuser toute proposition. Le recoupement manque, on exige
  davantage — plutôt que de poser une question qui n'apprendrait rien.
- Au troisième essai sans certitude, la meilleure réponse est tout de même
  matérialisée, marquée « à revoir » : elle n'est pas validable en lot mais
  fait gagner la saisie. Le plan la jetait.
- Un clic humain sur une ligne abandonnée rouvre le dossier (compteur
  d'essais remis à zéro, conversation conservée) ; le traitement de fond,
  lui, ne revient jamais dessus.
- `markPosted(tx, …)` renvoie l'identifiant du relevé touché plutôt que de
  rafraîchir lui-même son statut : le rafraîchissement a lieu après le
  commit, jamais dans la transaction.
- Détacher une ligne (`unmatch`) efface la proposition consommée, et une
  ligne qui porte une proposition ne peut pas être ignorée sans la trancher
  d'abord : sans cela l'écriture proposée resterait en revue sans rien pour
  la rattacher.
- Le compte visé par une règle est revérifié à chaque usage : une règle qui
  pointe un compte supprimé est ignorée et la ligne repart vers l'IA.
- La mémoire few-shot prend les décisions passées dont le libellé partage un
  jeton avec la ligne, pas les 20 dernières indistinctement.

---

## Lot 4 — Virements d'adhérents

**Livrable staging :** un virement identifié propose « encaisser la facture X
pour Y » ; un clic crée le paiement ; les virements non identifiés ont leur
filtre et se résolvent à la main ; N ↔ N.

### Task 4.1 : `member-transfer-matcher.ts`

- [x] Avant l'IA, pour les lignes **créditrices** : extraction des jetons de
  nom (retrait de « VIR », « SEPA », dates, références) ; comparaison
  normalisée (sans accents, casse) avec les membres, contacts et familles du
  club (pas de `pg_trgm` en base : comparaison en mémoire, un club a moins de
  quelques milliers de noms) ; candidats payeurs → factures `OPEN` du foyer
  avec solde > 0 ; score : montant = solde d'une facture (fort), = somme de
  deux factures, partiel ; `externalRef` égal à la référence (fort).
- [x] Sortie `payerProposal { memberId | contactId, allocations: [{ invoiceId, amountCents }], confidence }`.
- [x] Tests : libellés SEPA de trois banques ; exact ; somme de deux ; aucun
  candidat ; homonymes → `SUGGESTED` avec plusieurs payeurs, jamais choisi
  seul.

### Task 4.2 : `acceptBankLineMemberPayment(lineId, allocations)`

- [x] Pour chaque allocation, `PaymentsService.recordManualPayment` avec
  `method MANUAL_TRANSFER`, `externalRef = référence ou libellé`, payeur ; les
  gardes existantes s'appliquent (documents à signer, prélèvement en cours de
  dénouement, solde).
- [x] `RecordManualPaymentInput.financialAccountId?` (nouveau, optionnel) : le
  compte banque du relevé, pour qu'un club multi-banques comptabilise sur le
  bon 512x ; garde : kind `BANK` et club courant.
- [x] Les écritures créées par `tryRecordIncome` sont rapprochées de la ligne
  (recherche par `paymentId`). `recordManualPayment` n'est pas transactionnel
  avec la compta : traitement séquentiel, arrêt au premier échec, retour
  explicite de ce qui a été enregistré (jamais de succès partiel silencieux,
  cf. [échec silencieux](../../memory/pitfalls/echec-silencieux-chemin-erreur.md)).

### Task 4.3 : Non identifiés

- [x] Ligne créditrice sans candidat → `hint = UNIDENTIFIED_TRANSFER`, filtre
  dédié « Virements non identifiés », résolution manuelle : recherche d'un
  membre ou contact, choix des factures, montants.

### Task 4.4 : GraphQL, admin, staging

- [x] `bankLinePayerCandidates(lineId)`, `acceptBankLineMemberPayment`.
- [x] Carte « Encaisser la facture Cotisation Léa Dupont 2026-27 (250 €) pour
  Marie Dupont », éditeur de répartition multi-factures, résolveur manuel.
- [x] Fait sur `staging` le 2026-09-11 sur `club-demo`. Facture ouverte de
  120,00 € pour la famille Morel, relevé OFX de décembre avec deux virements
  reçus. Le premier, « VIR SEPA RECU /DE MOREL JOACHIM », est reconnu sans
  appel IA : « Virement de Joachim Morel · 100 % · le montant solde
  exactement cette facture » — le prénom départage Joachim de Florent, qui
  porte le même nom. « Encaisser » : paiement de 120,00 € MANUAL_TRANSFER au
  nom de Joachim avec le libellé du relevé en référence, facture `PAID`,
  écriture `AUTO_MEMBER_PAYMENT` sur Banque principale (le compte du relevé,
  pas la route par défaut du mode de paiement), `bankReconciledAt` posé et
  ligne `MATCHED` en `PROPOSAL`. Aucune erreur API.
- [x] Le second virement, « DE SARL BATIPRO », n'est reconnu par personne :
  il tombe dans l'onglet « Virements à identifier », la recherche de payeur
  répond en clair qu'aucun adhérent ni facture ne correspond, et la
  catégorisation ordinaire prend le relais avec sa question.
- [x] Deux trous trouvés en vérifiant : le payeur reconnu n'était pas
  transmis au paiement (donc ni nom sur l'encaissement, ni vérification de
  ses documents à signer), et les parts proposées repartaient avec le
  `__typename` d'Apollo — 400 silencieux, « Encaisser » sans effet. Le piège
  `__typename` est le même qu'au lot 1 ; sa fiche a été complétée.

### Écarts par rapport au plan

- La reconnaissance du payeur passe avant les RÈGLES autant qu'avant l'IA :
  une règle apprise sur un nom de famille aurait sinon transformé un
  encaissement d'adhérent en recette générique.
- Le service est coupé en deux : `BankPayerLookupService` (lecture seule,
  dans la comptabilité, utilisable par la catégorisation) et
  `BankMemberTransferService` (écriture, dans un module à part). Les
  paiements dépendent de la comptabilité ; loger l'encaissement dans la
  comptabilité aurait fermé le cercle.
- Pas de `hint = UNIDENTIFIED_TRANSFER` en base : un virement non identifié
  se reconnaît à ce qu'il est, une ligne créditrice à traiter sans payeur
  reconnu. L'onglet « Virements à identifier » filtre là-dessus, sans
  colonne de plus à tenir à jour.
- La proposition du payeur est mémorisée sur la ligne (`payerProposalJson`)
  pour l'affichage et le filtre, mais l'encaissement revalide tout par
  `recordManualPayment` : une facture soldée entre-temps est refusée avec
  son message.
- Aucun e-mail de confirmation n'est envoyé : ClubFlow n'en envoie pas non
  plus sur un encaissement manuel saisi à la main. Le plan l'annonçait ;
  c'est une fonctionnalité à part entière, pas un effet de bord du lot.

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

- [x] Clé forte : libellé contenant « REMISE », « CHQ » ou « CHEQ » sur une
  écriture `CHEQUE_DEPOSIT`, ou le n° de bordereau — porté par
  `paymentReference` de l'écriture, que `isStrong` cherche dans le libellé et
  la référence de la ligne. Montant = total et fenêtre de 10 jours →
  candidat unique fort → `MATCHED`, puis relevé `RECONCILED`.
  Cochée après coup le 2026-09-11 : le code était là depuis le lot 5, la case
  seule avait été oubliée.

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
  `payments-record-manual.spec.ts`).
- [x] Rapprochement de la ligne « REMISE » : rejoué au lot 1 le 2026-09-11
  (clé forte `CHEQUE_DEPOSIT` + « REMISE », `origin AUTO`).

---

## Lot 6 — Frais avancés par un bénévole

**Livrable staging :** un reçu peut être marqué « avancé par X », le club voit
sa dette par bénévole, un remboursement groupé solde plusieurs reçus et se
rapproche de la ligne banque.

### Task 6.1 : Schéma et seed

- [x] Seed `467100 Bénévoles, frais avancés à rembourser` (`LIABILITY`).
- [x] `AccountingEntry.advancedByMemberId?` + relation `Member` + index.
- [x] `VolunteerReimbursement { id, clubId, memberId, financialAccountId, paidOn @db.Date, totalCents, entryId?, status, createdByUserId, createdAt }`
  et `VolunteerReimbursementItem { id, reimbursementId, entryId, amountCents }`
  (`@@unique([reimbursementId, entryId])`).
- [x] `AccountingEntrySource.VOLUNTEER_REIMBURSEMENT`.

### Task 6.2 : `VolunteerAdvancesService`

- [x] `setAdvancedBy(entryId, memberId | null)` : en `NEEDS_REVIEW` (ou
  `DRAFT`), remplace la ligne de contrepartie 51x/53x par 467100 `CREDIT`
  (et inversement), met `financialAccountId` à nul (ou le restaure) ;
  en `POSTED`, refus : passer par contre-passation.
- [x] `balances(clubId)` : Σ crédits 467100 par `advancedByMemberId` − Σ
  remboursements ; `openItems(memberId)`.
- [x] `recordReimbursement({ memberId, financialAccountId, paidOn, entryIds })` :
  une transaction : écriture `TRANSFER` DÉBIT 467100 / CRÉDIT 512x du total,
  items, `source VOLUNTEER_REIMBURSEMENT`.
- [x] Tests : bascule de contrepartie ; solde ; remboursement partiel refusé
  si un item n'est pas ouvert ; transaction (mutation → rouge).

### Task 6.3 : Rapprochement (extension du lot 1)

- [x] Lignes **débitrices** dont le libellé contient le nom d'un membre à solde
  467 positif → proposition « Rembourser 3 notes de Jean Dupont = 87,40 € »
  quand la somme des items ouverts est égale ; sinon sélection manuelle des
  items ; accepter → `recordReimbursement` + rapprochement.
  Différée à la livraison du lot 6, faite le 2026-09-11.

**Vérifié sur staging.** Un reçu de 18,60 € avancé par Florent Morel, puis un
relevé CSV portant « VIR SEPA FLORENT MOREL REMB FRAIS BENEVOLE · −18,60 € ».
À l'import, la ligne reçoit sa proposition toute seule : bon bénévole, bon
reçu, `EXACT_ALL`, 100 %. Un clic sur « Rembourser 18,60 € » crée l'écriture
DÉBIT 467100 / CRÉDIT 512000 datée du relevé, rapproche la ligne, efface la
proposition et ramène le solde du bénévole à zéro. Aucun appel d'IA sur cette
ligne.

#### Écarts sur cette task

- **La reconnaissance passe avant les règles ET avant l'IA**, comme le
  virement d'adhérent. En faire une charge générique compterait la dépense
  deux fois : elle a déjà été comptabilisée le jour du reçu.
- **On ne propose rien quand deux jeux de reçus font le même total.** Choisir
  reviendrait à trancher pour le trésorier, et rembourser le mauvais reçu ne
  se voit pas sur un relevé. Au-delà de seize reçus ouverts, la recherche de
  sous-ensemble est abandonnée : trop de combinaisons se ressemblent.
- **Pas la même transaction que le rapprochement**, contrairement au texte du
  plan, et pour la raison déjà retenue au lot 4 : le remboursement est le fait
  durable — il éteint une dette réelle — alors que le rapprochement n'est
  qu'un lien, qu'un clic refait. Une transaction commune ferait perdre le
  remboursement parce qu'une liaison a échoué.
- Le rapprochement est souvent déjà fait quand on y arrive : `recordReimbursement`
  cherche lui-même une ligne de relevé correspondante (lot 7). L'acceptation ne
  repose donc un lien que si la ligne attend encore, et l'origine du
  rapprochement observée sur staging est `AUTO` plutôt que `PROPOSAL`.
- Si le remboursement ne couvre pas exactement la ligne, il est **quand même
  enregistré** mais la ligne n'est pas rapprochée : on ne pose pas une liaison
  de travers, et le trésorier voit ce qui reste.

### Task 6.4 : GraphQL et admin

- [x] `setAccountingEntryAdvancedBy`, `volunteerAdvanceBalances`,
  `volunteerOpenItems(memberId)`, `volunteerReimbursements(memberId)`,
  `recordVolunteerReimbursement`. Pas de
  `acceptBankLineVolunteerReimbursement` : il appartient à la task 6.3, non
  faite.
- [x] Le sélecteur « Changer le compte de contrepartie » de la file de revue
  gagne un groupe « Avancé par un bénévole » qui liste les membres actifs ;
  choisir un membre appelle `setAccountingEntryAdvancedBy`. C'est ce
  sélecteur, et non un champ « Payé depuis » séparé : la contrepartie est
  déjà ce que l'écran donne à changer.
- [x] `/comptabilite/benevoles` : soldes par bénévole, tiroir de
  remboursement (choix des reçus, du compte payeur, de la date), historique
  des remboursements passés. Pas de carte de proposition dans le détail de
  relevé (task 6.3).

### Task 6.5 : Vérification staging

- [x] Trois reçus du club démo (essence 45,10 €, repas arbitres 30,00 €,
  fournitures 12,30 €) marqués « avancés par Florent Morel » depuis la file
  de revue, puis comptabilisés : la contrepartie bascule bien sur 467100, le
  compte financier de l'écriture tombe à nul, et l'écran des bénévoles
  affiche 87,40 € dus sur 3 reçus.
- [x] « Rembourser… » depuis cet écran, les trois reçus cochés, payés depuis
  Banque principale : **une seule** écriture `VOLUNTEER_REIMBURSEMENT` de
  8 740 c, DÉBIT 467100 / CRÉDIT 512000, un `VolunteerReimbursement` POSTED
  avec ses trois items, une entrée d'audit `VOLUNTEER_REIMBURSEMENT`, et le
  solde tombé à zéro.
- [x] Boucle fermée **par le lot 1**, sans la task 6.3 : un quatrième reçu
  (péage 23,50 €) avancé puis remboursé le 15/01/2027, et un relevé CSV de
  janvier 2027 ne portant que « VIR SEPA FLORENT MOREL REMB FRAIS BENEVOLE »
  à −23,50 €. À l'import, le rapprochement automatique relie seul la ligne à
  l'écriture de remboursement (origine `AUTO`), pose `bankReconciledAt` sur
  la ligne 512000 et passe le relevé en `RECONCILED` — zéro catégorisation
  humaine, ce que promet l'écran des bénévoles.
- [x] Journal d'erreurs de l'API staging inchangé : 13 avant, 13 après.

### Écarts par rapport au plan

- La task 6.3 n'est pas faite — voir la note qui la suit. Le libellé de la
  task 6.5 (« CSV → proposition → accepter ») a donc été honoré par le
  chemin inverse, qui donne le même état final sans écrire une ligne de
  plus : remboursement enregistré, puis relevé importé qui rapproche seul.
- **Ordre inverse : limite relevée au lot 6, levée au lot 7.** Si le relevé
  est importé *avant* que le remboursement soit enregistré, la ligne restait
  orpheline : `onEntryPosted` ne rapproche que la ligne qui a *proposé*
  l'écriture, et un remboursement n'est proposé par aucune ligne. Le lot 7 a
  rencontré le même cas sur les dépôts d'espèces et l'a traité pour toutes
  les sources d'un coup — voir `matchExistingLineForEntry` dans les écarts du
  lot 7.
- `recordReimbursement` crée son écriture directement `POSTED`, sans passer
  par `markPosted` : ses deux lignes sont validées d'office et il n'y a rien
  à rapprocher à cet instant (cf. ci-dessus). La date de paiement est
  néanmoins soumise à `assertDateIsOpen`, donc un mois verrouillé ou un
  exercice clos la refuse.
- Rendre une dépense au club (`memberId` à nul) remet la contrepartie sur la
  banque **par défaut** du club, pas sur le compte d'origine : celui-ci n'est
  pas mémorisé avant la bascule. Sans banque par défaut, l'opération est
  refusée plutôt que de deviner.
- Ajout non prévu : la requête `volunteerReimbursements` et le tableau
  « Remboursements passés ». Sans lui, un remboursement enregistré
  disparaissait de l'écran sitôt le solde éteint, et rien ne permettait de
  vérifier ce qu'on venait de faire.
- `openEntries` exclut les reçus déjà portés par un remboursement POSTED via
  `reimbursementItems: { none: … }`. Le double de transaction des tests
  appliquait ce filtre de lui-même : la mutation qui le retirait restait
  verte. Double corrigé pour honorer la clause, la mutation fait tomber 3
  tests.
- Un remboursement ne peut prendre que des reçus ouverts **de ce bénévole**,
  garde portée par le service : le `@@unique([reimbursementId, entryId])` ne
  protège que du doublon à l'intérieur d'un même remboursement.

---

## Lot 7 — Livre de caisse

**Livrable staging :** par caisse, le livre avec solde courant, un comptage
qui fait office de relevé, l'écart validé comme écriture, dépôt et retrait
d'espèces rapprochables.

### Task 7.1 : Schéma et seed

- [x] `CashCount { id, clubId, financialAccountId, countedOn @db.Date, countedCents, expectedCents, deltaCents, note?, adjustmentEntryId?, validatedAt?, validatedByUserId?, countedByUserId, createdAt }`
  avec `@@unique([financialAccountId, countedOn])`.
- [x] Seed `658000 Charges diverses de gestion courante (écarts de caisse)`
  (`EXPENSE`) ; `758000` existe déjà pour les écarts positifs.
- [x] `AccountingEntrySource.CASH_ADJUSTMENT`, `CASH_TRANSFER`, et les actions
  d'audit `CASH_COUNT`, `CASH_COUNT_VALIDATE`, `CASH_TRANSFER`.

### Task 7.2 : `CashBookService`

- [x] `book(financialAccountId, from, to)` : mouvements du compte dans les
  deux sens, solde courant depuis `openingBalanceCents` (lot 0), et un
  drapeau quand ce solde d'ouverture manque.
- [x] `recordCount({ financialAccountId, countedOn, countedCents, note })` :
  calcule `expectedCents` à la date, `deltaCents` ; **ne crée aucune
  écriture**. `validateCashCount(countId)` crée l'écriture d'écart
  (658000 ou 758000 contre 53x) datée du comptage. Mutation vérifiée :
  faire créer une écriture à un écart nul fait tomber le test.
- [x] `recordCashTransfer({ fromAccountId, toAccountId, amountCents, on, note })` :
  `TRANSFER` 53 → 51 (dépôt) ou 51 → 53 (retrait), `source CASH_TRANSFER`,
  rapproché ensuite par la ligne banque « VERSEMENT ESPECES » / « RETRAIT ».

### Task 7.3 : GraphQL et admin

- [x] `clubCashBook`, `clubCashCounts`, `recordCashCount`, `validateCashCount`,
  `deleteCashCount`, `recordCashTransfer`.
- [x] `/comptabilite/caisse` : sélecteur de caisse et de période, livre,
  « Compter la caisse », « Déposer en banque », « Retirer de la banque »,
  historique des comptages avec « Valider l'écart » et « Jeter ».

### Task 7.4 : Vérification staging

- [x] Caisse principale du club démo : recette espèces 185,00 €, dépense
  24,50 €, livre à 219,50 € (59,00 € préexistants compris). Le compte 658000,
  absent du club, a été créé tout seul à l'ouverture de l'écran — c'est le
  rattrapage de plan comptable qui tourne sur les chemins de lecture.
- [x] Comptage à 215,00 € pour 219,50 € attendus : écart −4,50 € affiché,
  **aucune écriture créée**. Validation → une écriture `CASH_ADJUSTMENT`
  DÉBIT 658000 / CRÉDIT 530000 de 450 c, datée du comptage, et les deux
  entrées d'audit.
- [x] Dépôt de 120,00 € en banque : écriture `CASH_TRANSFER` DÉBIT 512000 /
  CRÉDIT 530000, portée par la BANQUE. Relevé CSV de février portant
  « VERSEMENT ESPECES » +120,00 → rapprochée seule à l'import.
- [x] **Les deux ordres.** Un second versement (+80,00 €) déjà sur le relevé
  avant d'être saisi n'a d'abord rien rapproché : deux défauts, corrigés et
  consignés ci-dessous. Après correction, un troisième essai en mars
  (+15,00 €) a rapproché la ligne seule, origine `AUTO`, en jetant la
  proposition de l'IA.
- [x] Caisse soldée à 0,00 € à la fin, journal d'erreurs de l'API staging
  inchangé : 13 avant, 13 après.

### Écarts par rapport au plan

- **Le solde d'une caisse se lit sur son compte PCG, pas sur le compte
  porteur de l'écriture.** Un dépôt d'espèces est porté par le compte
  BANCAIRE — c'est le relevé de la banque qui le confirmera — tout en vidant
  la caisse. Filtrer les mouvements par `financialAccountId` aurait fait
  disparaître tous les dépôts du livre de la caisse. Un test le fixe, et la
  mutation qui rétablit le mauvais filtre fait tomber 5 tests.
- `CashCount` gagne `validatedAt` / `validatedByUserId`. Le plan ne prévoyait
  que `adjustmentEntryId?`, qui ne distingue pas « validé, écart nul, rien à
  écrire » de « pas encore validé ».
- Une caisse ne se compte qu'une fois par jour (`@@unique`) : deux comptages
  du même jour se contrediraient sans qu'on sache lequel fait foi. Et un
  comptage non validé se jette (`deleteCashCount`) ; validé, il faut une
  contre-passation.
- **Ajout hors plan, réclamé par les lots 6 ET 7 :
  `matchExistingLineForEntry`.** Une écriture qui naît déjà comptabilisée
  hors relevé (remboursement de bénévole, dépôt d'espèces) ne rapprochait
  rien quand le relevé était déjà déposé. Elle va maintenant chercher la
  ligne qui lui correspond — même compte, montant signé identique, dans la
  fenêtre — et ne la prend que si elle est le seul candidat.
- **Deuxième défaut, trouvé dans la foulée sur staging : une proposition de
  l'IA restée en revue survivait au rapprochement.** La catégorisation tourne
  dès l'import, donc une ligne orpheline en porte presque toujours une. Sur
  le club démo, la proposition faite au versement d'espèces était une
  écriture IDENTIQUE au dépôt (DÉBIT 512000 / CRÉDIT 530000, 80,00 €, 95 % de
  confiance) : la valider aurait compté les 80 € deux fois. Désormais toute
  ligne qui devient rapprochée jette sa proposition en attente, quel que soit
  le chemin — `applyMatch` est le seul endroit qui rend une ligne MATCHED.
  Une proposition DÉJÀ comptabilisée, elle, est une décision humaine : on ne
  passe pas par-dessus. La règle vivait en double dans le lot 4, elle est
  maintenant partagée.
- La note d'un mouvement d'espèces vit sur les lignes de l'écriture :
  `AccountingEntry` n'a pas de champ note.
- Un mouvement d'espèces relie exactement une caisse et une banque. Rien
  n'empêche en revanche de déposer plus que ce que contient le tiroir : la
  caisse peut passer sous zéro, et c'est le comptage qui le fera voir.
- `clubCashBook` accepte n'importe quel compte financier, pas seulement une
  caisse ; l'écran ne propose que les caisses. Un livre de banque coûtait
  zéro ligne de plus.

---

## Lot 8 — Stripe par API

**Livrable staging :** le transit Stripe est vérifié tous les jours ; un
`payout.paid` manqué est rattrapé ; toute transaction Stripe inconnue de
ClubFlow devient une ligne à catégoriser sur le transit.

### Task 8.1 : `StripeTransitSyncService` (module `payments`)

- [x] Cron quotidien 04:30 `Indian/Reunion`, verrou `stripeTransitSync`
  (nouvelle clé dans `SCHEDULER_LOCK_KEYS`, distincte des verrous
  financiers, même raisonnement que `shopStockThresholdSweep`), plus un
  interrupteur d'urgence `STRIPE_TRANSIT_SYNC_DISABLED` qui se signale
  bruyamment.
- [x] Pour chaque club avec `stripeAccountId`, module compta actif et
  `accountingStartsOn` : `stripe.payouts.list({ arrival_date: { gte } }, { stripeAccount })`
  depuis la dernière synchro moins deux jours, ou la reprise ; virement
  `paid` sans écriture → `recordStripePayout` (rattrapage).
- [x] Par virement : `stripe.balanceTransactions.list({ payout, limit: 100, expand: ['data.source'] })`,
  classement : `charge`/`payment` → `Payment` par `stripeBalanceTransactionId`,
  à défaut par l'intention de paiement ; `refund` → `Payment` par
  `stripeRefundId` ; `stripe_fee` → couvert par `stripeFeeCents` ; `payout`
  lui-même ; **inconnu** → ligne d'un `BankStatement` synthétisé
  (`format STRIPE_API`, `financialAccountId` = transit, une période par
  mois).
- [x] Mutation `syncStripeTransit` pour un déclenchement manuel, et requête
  `stripeTransitStatus` pour afficher « vérifié le… » sans taper l'API.
- [x] Tests avec Stripe mocké, sur le modèle de `stripe-fees.service.spec.ts` :
  rattrapage idempotent, inconnue → ligne, connue → rien, repasser n'ajoute
  rien. Le classement est un module PUR testé à part, sans mocker Stripe.

### Task 8.2 : Admin et staging

- [x] `ReconciliationPage` gagne un panneau « Transit Stripe » avec
  « Vérifier maintenant » et la date de dernière vérification ; les relevés
  synthétisés apparaissent dans la liste des relevés déposés.
- [x] Staging (Stripe test), club `qa-test-club` — le seul de staging à
  avoir un compte Stripe branché : **synchro sans inconnue**, 3 virements
  lus, 0 rattrapage (tous déjà écrits), 0 inconnue, 0 écart d'arithmétique.
  Les trois lots tombent juste au centime : 1716+1716+1716+3216 = 8364,
  2877+9650+2394 = 14921, −4000+9650 = 5650.
- [x] **Inconnue → ligne à catégoriser** : le lien d'un remboursement a été
  délié le temps du test, rendant sa transaction inconnue de ClubFlow. La
  synchro a créé un relevé `STRIPE_API` de juillet 2026 sur le transit,
  portant « REFUND FOR CHARGE · réf. re_… · −40,00 € · à traiter », avec les
  mêmes actions que n'importe quelle ligne de relevé. Lien rétabli, relevé
  supprimé, accès temporaire retiré.
- [x] Journal d'erreurs de l'API staging inchangé : 13 avant, 13 après.

### Écarts par rapport au plan

- **Le marqueur de dernière synchro vit sur le compte de transit**
  (`ClubFinancialAccount.stripeSyncedAt`). C'est le compte qui est
  synchronisé, pas le club.
- **On relit toujours deux jours en arrière.** Filtrer sur « arrivés depuis
  la dernière synchro » laisse passer ce qui se glisse au bord de la
  fenêtre, et un virement manqué est une divergence silencieuse — ce que ce
  lot existe précisément pour éviter. Repasser ne coûte qu'un appel :
  l'écriture est idempotente par `stripePayoutId`, les lignes par leur
  identifiant de transaction. Le recouvrement ne remonte jamais avant la
  date de reprise comptable.
- Un encaissement est reconnu d'abord par sa transaction de solde, puis, à
  défaut, par son intention de paiement : les frais Stripe arrivent après,
  donc `stripeBalanceTransactionId` est souvent encore nul quand la synchro
  passe. Sans ce repli, tout encaissement récent deviendrait une fausse
  inconnue.
- Une ligne inconnue porte le **net**, pas le brut : pour une transaction
  qu'on ne connaît pas, brut et commission ne se distinguent pas. C'est au
  trésorier de trancher en catégorisant.
- **L'arithmétique du relevé synthétisé est vraie par construction** — son
  solde de fin est son solde de début plus ses lignes. Le contrôle qui
  compte est ailleurs, et il vient de Stripe : la somme des transactions
  d'un lot vaut exactement le virement. Un écart y est signalé sans
  interrompre, car il ne dit pas qu'une écriture est fausse mais qu'on n'a
  pas tout lu.
- **Correctif tiré de la vérification : un relevé synthétisé chaîne par
  construction.** Le compte de transit n'a pas de solde d'ouverture, donc le
  chaînage restait « inconnu » et le relevé arrivait « à vérifier » — sur un
  relevé sans fichier d'origine, que personne ne peut corriger. L'exception
  porte sur le chaînage seulement : un solde de fin qui ne suit pas ses
  propres lignes reste une anomalie.
- **Limite connue : une transaction inconnue n'apparaît qu'une fois versée.**
  La synchro lit les transactions PAR VIREMENT, ce qui lui donne son
  contrôle d'intégrité. Un encaissement fait depuis le tableau de bord
  Stripe reste donc invisible tant qu'il dort dans le solde en attente. Il
  remonte au premier virement qui l'emporte. C'est aussi pourquoi la
  vérification a simulé l'inconnue en déliant un remboursement déjà versé
  plutôt qu'en créant une charge de test, qui n'aurait été versée que des
  jours plus tard.
- `syncStripeTransit` est gaté sur COMPTABILITÉ et non sur PAIEMENT : c'est
  un écran de trésorier. Un club sans Stripe obtient un rapport « sans
  compte Stripe » plutôt qu'une erreur.
- Le panneau du transit se cache tout seul quand le club n'a ni compte
  Stripe ni compte de transit, plutôt que d'ajouter une ligne vide au
  tableau des comptes bancaires.
- Le détail d'un relevé synthétisé offre encore « Corriger les soldes » et
  « + Ligne manquante », qui n'ont pas de sens pour un relevé bâti par
  ClubFlow. Sans danger — la synchro suivante recalcule le solde de fin —
  mais à masquer un jour.
- La vérification a demandé deux écritures temporaires sur staging :
  `accountingStartsOn` renseignée sur `qa-test-club` (gardée : sans elle le
  balayage nocturne saute ce club) et un accès administrateur temporaire au
  compte principal de Florent (retiré après coup).

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
