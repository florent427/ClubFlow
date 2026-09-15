# Crédit du payeur : avances encaissées sans facture, puis imputées sur ses factures — plan d'implémentation par lots

> **Pour agents :** cocher les étapes (`- [ ]`) au fil de l'eau. Chaque lot se
> livre **seul** sur `staging`, s'y vérifie en conditions réelles, puis se promeut
> vers `main` (cf. [workflows/promouvoir-une-branche-partagee.md](../../memory/workflows/promouvoir-une-branche-partagee.md)).
> **Aucun commit sans demande explicite de Florent.**

**Décision de référence :** [ADR-0022](../../memory/decisions/0022-credit-du-payeur.md).

**Goal :** un membre ou un contact verse une avance, sans facture, par n'importe
quel moyen. Son crédit s'affiche et sert à régler ses factures : adhésion,
boutique, frais. Ce qui reste peut lui être remboursé.

**Architecture :**
- **L'avance** : un reçu `Invoice.purpose = PAYER_CREDIT_DEPOSIT`, créé payé avec son `Payment`.
- **L'utilisation** : un `Payment` `PAYER_CREDIT` sur la facture réglée.
- **Le solde** : calculé à partir de ces paiements, par une seule fonction.
- **La comptabilité** : l'avance va en 419100, et devient une recette au moment où le crédit est utilisé.

**Tech stack :** NestJS 11, Prisma 6 (`prisma db push`, cf.
[ADR-0003](../../memory/decisions/0003-prisma-db-push.md)), GraphQL code-first,
admin et portail React + Vite + Apollo, Expo, pdfkit, Jest, Vitest.

---

## Garde-fous

- **[Garantie derrière un effet de bord](../../memory/pitfalls/garantie-derriere-effet-de-bord.md)** :
  - reçu, paiement et fiche chèque sont créés dans **une** transaction ;
  - une utilisation du crédit, son paiement et les effets sur la facture tiennent dans **une** transaction, sous verrou ;
  - l'écriture comptable suit le commit, comme pour tout encaissement.
- **[Une supposition qui survit à la décision](../../memory/pitfalls/une-supposition-survit-a-la-decision.md)** :
  **une** fonction calcule le crédit. Aucun écran ne transmet un solde que la
  mutation croirait : l'utilisation relit le crédit et le reste dû sous verrou.
- **[`$queryRaw` sur une fonction qui retourne `void`](../../memory/pitfalls/prisma-executeraw-pour-retour-void.md)** :
  `pg_advisory_xact_lock` s'appelle par `$executeRaw`, et le verrou se vérifie
  une fois sur la vraie base (staging).
- **[Un solde de facture calculé sans les avoirs](../../memory/pitfalls/solde-facture-sans-les-avoirs.md)** :
  le reste dû vient de `resolveInvoiceBalance`.
- **[Test qui vérifie la forme](../../memory/pitfalls/test-verifie-la-forme-pas-le-comportement.md)**
  et **[double qui ignore une clause du `where`](../../memory/pitfalls/double-ignore-une-clause-du-where.md)** :
  - chaque test se termine par le fait qui compte : le crédit ne se dépense pas deux fois, la recette n'est pas comptée deux fois ;
  - les doubles sont écrits en face des requêtes ;
  - les mutations à la main sont notées dans la PR.
- **[Compta non seedée](../../memory/pitfalls/compta-non-seedee-webhook-500.md)** :
  `seedIfEmpty` avant tout accès à 419100.

Multi-tenant : `clubId` dans chaque requête, relations traversées comprises. La
personne, la facture et le compte financier appartiennent au même club.
`apps/mobile-admin` : hors périmètre.

---

## Ordre des lots et dépendances

| Lot | Contenu | Dépend de | Valeur livrée seule |
|---|---|---|---|
| 1 | Avance au guichet : reçu d'avance, solde et historique, écriture 419100, fiches membre et contact | — | le club encaisse et suit les avances |
| 2 | Régler une facture avec le crédit (admin) : moyen `PAYER_CREDIT`, utilisation sous verrou, crédit rendu, factures sans foyer | 1 | le crédit sert à payer |
| 3 | Portail et appli : solde, « Utiliser mon crédit », « Créditer mon compte » par carte | 1, 2 | les membres s'en servent seuls |
| 4 | Trop-perçu et sortie : part d'un virement mise au crédit, surplus d'un encaissement, remboursement du crédit | 1, 2 | plus aucun argent refusé ou bloqué |

---

## Lot 1 — Avance au guichet

### Task 1.1 : Schéma

- [x] `enum InvoicePurpose { CHARGE PAYER_CREDIT_DEPOSIT }`, avec
  `Invoice.purpose InvoicePurpose @default(CHARGE)` et `@@index([clubId, purpose])`.
- [x] `Invoice.payerCreditMemberId String?` et `payerCreditContactId String?` :
  - relations `Member` et `Contact` en `onDelete: Restrict`, puisqu'une personne qui porte un crédit ne se supprime pas ;
  - un index par colonne.
- [ ] Sur la **vraie base** (staging, après `db push`) : colonnes et index présents, factures existantes lues `CHARGE`.

### Task 1.2 : Comptabilité

- [x] 419100 « Adhérents, avances et acomptes reçus » (LIABILITY) ajouté à
  `DEFAULT_ACCOUNTS`, avec un test : le compte arrive chez un club déjà seedé.
- [x] `recordIncomeFromPayment` : pour un reçu d'avance, écriture **TRANSFER**
  (DÉBIT trésorerie / CRÉDIT 419100), sens explicites, sans allocation analytique.

### Task 1.3 : Service

- [x] `PayerCreditService.credit` rend le solde et l'historique : la formule de
  l'ADR, §4. La personne englobe le membre et le contact d'un même `userId`.
- [x] `PaymentsService.recordPayerCreditDeposit(clubId, { memberId | contactId, amountCents, method, chèque, compte bancaire }, userId)`,
  à côté de la saisie manuelle, dont il reprend la fiche chèque et l'écriture :
  - moyens acceptés : espèces, chèque ou virement ;
  - en une transaction : reçu PAID, `Payment` et fiche chèque ; l'écriture suit ;
  - montant > 0, exactement une personne, et du club.
- [x] Refusés sur un reçu :
  - encaissement manuel, avoir manuel et annulation : garde explicite ;
  - échéancier, mode verrouillé et session de paiement : ces chemins exigent une
    facture `OPEN`. Or un reçu naît `PAID`, et aucun chemin ne le rouvre : l'émission
    part d'un brouillon.
- [x] Suppression refusée d'un membre ou d'un contact qui porte des avances :
  garde explicite, et `onDelete: Restrict` en base.
- [x] GraphQL admin : `clubPayerCredit(memberId | contactId)` (solde et
  historique) et `recordPayerCreditDeposit`.
- [x] Tableau de bord : les reçus n'entrent pas dans le taux de factures payées
  à temps.
- [ ] Tests :
  - versement en espèces, par chèque (fiche en portefeuille) et par virement ;
  - le solde d'un membre inclut le contact du même utilisateur, et aucun autre ;
  - chacun des refus listés plus haut ;
  - écriture TRANSFER sur 419100 ;
  - mutations à la main notées.

### Task 1.4 : PDF et admin

- [x] PDF « Reçu d'avance » : mention « crédit utilisable sur les prochaines
  factures », sans « reste dû ».
- [x] Fiche membre (onglet Adhésion) et tiroir du contact : bloc « Crédit »
  (solde, historique, reçu PDF) et bouton « Encaisser une avance ».
- [x] Facturation :
  - badge « Avance » et onglet « Avances », hors des indicateurs ;
  - tiroir d'un reçu sans action d'encaissement ni d'avoir.
- [x] Vitest : formulaire (montant, moyen, chèque) et libellés.

### Task 1.5 : Recette staging

- [ ] Sur club-demo :
  - avance en espèces, puis par chèque, avec le chèque en portefeuille puis remis en banque ;
  - reçu PDF, solde et historique ;
  - écritures TRANSFER sur 419100 vérifiées en base ;
  - annulation du reçu refusée ;
  - fiche contact et fiche membre d'un même utilisateur : même crédit.

---

## Lot 2 — Régler une facture avec le crédit (admin)

### Task 2.1 : Effets d'encaissement partagés

- [ ] Extraire de `recordManualPayment` la séquence qui suit les gardes
  (paiement, fiche chèque, PAID, commande boutique ; puis échéancier et
  écriture) en une fonction qui reçoit la transaction.
- [ ] Faire dépendre le passage PAID du solde après avoirs, et non plus de
  l'égalité au montant nominal.
- [ ] La saisie manuelle prend le verrou de la facture et relit le reste dû dans
  la transaction : aujourd'hui, deux saisies simultanées peuvent surpayer.

### Task 2.2 : Moyen `PAYER_CREDIT`

- [ ] Enum Prisma et `schema.gql`. Libellé « Crédit » dans l'admin
  (`payment-labels.ts`, tiroir facture), le portail (`BillingPage`) et le PDF.
- [ ] Refus explicites :
  - saisie manuelle ;
  - mode verrouillé de `createInvoice` et de `finalizeMembershipInvoice` ;
  - `viewerLockInvoicePaymentChoice` et panier ;
  - routes de paiement et règles tarifaires.
  Exclu aussi des listes admin correspondantes.
- [ ] `resolveForPayment` ne reçoit jamais `PAYER_CREDIT`, sinon son défaut
  débiterait une banque fantôme. Un test le vérifie.
- [ ] Tableau de bord (`revenueLast30Cents`) et `sumRevenueCentsInMonth` :
  paiements `PAYER_CREDIT` exclus.
- [ ] Plan de remboursement boutique : un kind qui rend le crédit.

### Task 2.3 : Utilisation du crédit

- [ ] `PayerCreditService.apply(clubId, userId, { invoiceId, memberId | contactId, amountCents? })` :
  1. ouvre une transaction ;
  2. prend les verrous de la personne puis de la facture (`$executeRaw` et `pg_advisory_xact_lock`) ;
  3. relit le crédit et le reste dû ;
  4. vérifie montant ≤ min(crédit, reste dû), puis le payeur ;
  5. applique la fonction partagée de la tâche 2.1.
- [ ] Contrôle du payeur étendu aux factures sans foyer : acheteur de la
  commande boutique, membre des lignes d'adhésion.
- [ ] Écriture INCOME : DÉBIT 419100 / CRÉDIT produit, allocations au prorata,
  sans compte financier.
- [ ] Crédit rendu :
  - un avoir ou une annulation boutique sur une facture réglée par crédit crée un `Payment` négatif `PAYER_CREDIT` ;
  - la contre-passation se fait sur 419100 : `createContraEntryForCreditNote` ne se rabat plus sur la banque.
- [ ] GraphQL admin `applyPayerCreditToInvoice`. Tiroir facture : « Régler avec
  le crédit de … » (payeurs autorisés qui ont du crédit, montant proposé).
- [ ] Tests :
  - le crédit n'est jamais dépensé deux fois : deux utilisations concurrentes, le double reproduit le verrou ;
  - une facture ne peut pas être surpayée ;
  - mêmes effets qu'un encaissement manuel ;
  - la recette n'est pas comptée deux fois ;
  - mutations à la main notées.

### Task 2.4 : Recette staging

- [ ] Adhésion réglée par une avance, en partie puis pour le solde.
- [ ] Commande boutique d'un contact sans foyer réglée par crédit, puis annulée :
  le crédit revient.
- [ ] Écritures vérifiées en base.
- [ ] Verrou vérifié sur PostgreSQL : deux utilisations simultanées.

---

## Lot 3 — Portail et appli

### Task 3.1 : Consultation

- [ ] `viewerPayerCredit` pour le profil actif : solde et historique, en tête de
  `/factures` et sur la page famille. Appli : écran Famille.
- [ ] Admin : dans le tiroir foyer, total des crédits de ses payeurs, en lecture
  seule.

### Task 3.2 : « Utiliser mon crédit »

- [ ] `viewerApplyPayerCredit(invoiceId, amountCents?)` : périmètre payeur du
  portail, puis `PayerCreditService.apply`.
- [ ] Bouton sur une facture ouverte, au portail et dans l'appli.

### Task 3.3 : « Créditer mon compte » par carte

- [ ] Session Stripe sans facture préalable, avec en metadata l'objet, la
  personne et le club. Montant borné : 1 € minimum, maximum à fixer.
- [ ] Webhook `payment_intent.succeeded`, branche « avance » :
  - crée le reçu PAID et le paiement ; `stripePaymentIntentId`, unique, garantit l'idempotence ;
  - écriture TRANSFER vers 512300 ;
  - frais Stripe comme d'habitude.
- [ ] Retour de paiement dans l'appli par schéma custom (cf. pitfall
  `openauthsession-exige-scheme-custom`).

### Task 3.4 : Recette staging

- [ ] Avance par carte de test depuis le portail et depuis l'appli, puis
  utilisation sur une facture. Webhook rejoué : pas de doublon.

---

## Lot 4 — Trop-perçu et sortie du crédit

### Task 4.1 : Trop-perçu

- [ ] Rapprochement d'un virement : une part mise « au crédit de » la personne
  (reçu PAID sur la banque du relevé).
- [ ] Encaissement en espèces ou par virement supérieur au reste dû : proposer
  de verser le surplus au crédit, dans la même transaction. Chèque hors
  périmètre, car une fiche chèque ne correspond qu'à un paiement.

### Task 4.2 : Rembourser le crédit

- [ ] Par carte : remboursement d'une avance plafonné au crédit disponible, sous
  verrou. Contre-passation **TRANSFER** : DÉBIT 419100 / CRÉDIT trésorerie.
- [ ] En espèces ou par virement : paiement négatif sur le reçu et avoir, avec
  la même contre-passation, sur le modèle du remboursement boutique
  ([ADR-0019](../../memory/decisions/0019-boutique-annulation-remboursement.md)).

### Task 4.3 : Recette staging

- [ ] Virement de 150 € pour une facture de 100 €.
- [ ] Remboursement du crédit restant à un membre qui quitte le club.
