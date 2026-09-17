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
- [x] Sur la **vraie base** (staging, après `db push`) : colonnes et index présents, factures existantes lues `CHARGE`.
  Vérifié le 2026-09-15 : 3 colonnes, 3 index, clés étrangères en `RESTRICT`, 66 factures `CHARGE`.

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
- [x] Tests :
  - versement en espèces, par chèque (fiche en portefeuille) et par virement ;
  - le solde d'un membre inclut le contact du même utilisateur, et aucun autre ;
  - chacun des refus listés plus haut ;
  - écriture TRANSFER sur 419100 ;
  - mutations à la main : 43 tuées sur 46. Les 3 survivantes sont équivalentes :
    l'émetteur du chèque, et deux filtres de club doublés par des identifiants
    déjà pris dans le club.

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

- [x] Sur club-demo, le 2026-09-15 (commit `a179f00`) :
  - avance en espèces, puis par chèque, avec le chèque en portefeuille puis remis en banque ;
  - reçu PDF, solde et historique ;
  - écritures TRANSFER sur 419100 vérifiées en base ;
  - annulation du reçu refusée ;
  - fiche contact et fiche membre d'un même utilisateur : même crédit ;
  - en plus :
    - avoir, encaissement manuel et suppression du membre refusés ;
    - Facturation : onglet « Avances », indicateurs inchangés ;
    - tiroir d'un reçu sans avoir ni annulation.
- [x] En prod le 2026-09-15 : v0.67.0 (PR #239, release #240).

---

## Lot 2 — Régler une facture avec le crédit (admin)

### Task 2.1 : Effets d'encaissement partagés

- [x] Extraire de `recordManualPayment` la séquence qui suit les gardes
  (paiement, fiche chèque, PAID, commande boutique ; puis échéancier et
  écriture) en une fonction qui reçoit la transaction.
  Deux fonctions en sortent : `settleInvoicePaymentInTx` dans la transaction,
  `afterInvoicePaymentCommit` après le commit (échéancier clos avant
  l'écriture).
- [x] Faire dépendre le passage PAID du solde après avoirs, et non plus de
  l'égalité au montant nominal.
- [x] La saisie manuelle prend le verrou de la facture et relit le reste dû dans
  la transaction : aujourd'hui, deux saisies simultanées peuvent surpayer.

### Task 2.2 : Moyen `PAYER_CREDIT`

- [x] Enum Prisma. `schema.gql` est engendré au démarrage et ignoré par git
  (`apps/api/.gitignore`) : rien à y écrire. Libellé « Crédit » dans l'admin
  (`payment-labels.ts`, tiroir facture), le portail (`BillingPage`) et le PDF
  (« crédit »).
- [x] Refus explicites, par `assertNotPayerCreditMethod` :
  - saisie manuelle ;
  - mode verrouillé de `finalizeMembershipInvoice`. `createInvoice` n'a pas de
    mode verrouillé : c'est le moyen servant à son tarif (`pricingMethod`) qui
    est refusé ;
  - `viewerLockInvoicePaymentChoice` et validation du panier (contrôle placé
    en premier) ;
  - routes de paiement et règles tarifaires.
  Exclu aussi des listes admin correspondantes.
- [x] `resolveForPayment` ne reçoit jamais `PAYER_CREDIT`, sinon son défaut
  débiterait une banque fantôme. Un test le vérifie.
- [x] Tableau de bord : encaissé du mois et tendances à 30 et 60 jours hors
  `PAYER_CREDIT`. `sumRevenueCentsInMonth` n'avait plus aucun appelant :
  supprimée plutôt que corrigée.
- [x] Plan de remboursement boutique : kind `CREDIT`, rendu par un paiement
  négatif `PAYER_CREDIT`.

### Task 2.3 : Utilisation du crédit

- [x] `PaymentsService.applyPayerCredit(clubId, { invoiceId, memberId | contactId, amountCents? })`,
  et non `PayerCreditService.apply` : la fonction partagée de la tâche 2.1 est
  privée à `PaymentsService`. Sans montant, il règle le plus petit du crédit et
  du reste dû.
  1. ouvre une transaction ;
  2. prend les verrous de la personne puis de la facture (`$executeRaw` et `pg_advisory_xact_lock`) ;
  3. relit le crédit, le reste dû et le statut de la facture ;
  4. vérifie montant ≤ min(crédit, reste dû). Le payeur est contrôlé juste
     avant la transaction ;
  5. applique la fonction partagée de la tâche 2.1.
- [x] Contrôle du payeur étendu aux factures sans foyer : acheteur de la
  commande boutique, membre des lignes d'adhésion.
- [x] Écriture INCOME : DÉBIT 419100 / CRÉDIT produit, allocations au prorata,
  sans compte financier.
- [x] Crédit rendu :
  - un avoir ou une annulation boutique sur une facture réglée par crédit crée un `Payment` négatif `PAYER_CREDIT` ;
  - la contre-passation se fait sur 419100 : `createContraEntryForCreditNote` ne se rabat plus sur la banque ;
  - un avoir éteint d'abord le reste dû. Il ne rend que ce qui a été payé
    au-delà, `min(avoir, max(0, payé net − max(0, montant − avoirs)))`, en
    rendant les imputations de la plus récente à la plus ancienne ;
  - la contre-passation se partage : la part rendue sur 419100
    (`createContraEntryForCreditNote` reçoit la part), le reste sur
    l'encaissement d'origine. Sans paiement désigné, elle ne prend jamais une
    imputation.
- [x] GraphQL admin `applyPayerCreditToInvoice`, et
  `clubInvoicePayerCredits(invoiceId)` pour les payeurs autorisés qui ont du
  crédit : même contrôle que l'imputation. Tiroir facture : « Régler avec le
  crédit » (personne, montant proposé) ; l'avoir d'une facture réglée par
  crédit annonce la part rendue. Bloc « Crédit » : liste « Utilisations ».
- [x] Tests :
  - le crédit n'est jamais dépensé deux fois : deux utilisations concurrentes, le double reproduit le verrou ;
  - une facture ne peut pas être surpayée ;
  - mêmes effets qu'un encaissement manuel ;
  - la recette n'est pas comptée deux fois ;
  - mutations à la main : 54 tuées sur 54.
    - Premier passage : 48 tuées, 3 survivantes, et 2 mutants qui ne
      compilaient pas (rejoués sous une forme valide : tués).
    - Retirer le verrou de la facture, à la saisie comme à l'imputation,
      restait vert : le double prenait l'état APRÈS la latence de lecture, et
      la course n'avait aucune fenêtre. Double corrigé, les deux sont tuées
      (cf. [pitfall](../../memory/pitfalls/double-transaction-rollback-trop-genereux.md)).
    - Ignorer le statut relu sous verrou n'était pas équivalent : une facture
      annulée entre le premier contrôle et le verrou garde un reste dû positif.
      Un test d'annulation la tue, avec son pendant sur la saisie manuelle.

Limite connue, hors lot : les chemins qui annulent une facture ne prennent pas
son verrou. Une annulation qui passerait entre la relecture et le commit
laisserait un règlement sur une facture annulée. Levée par la tâche 2.5.

### Task 2.4 : Recette staging

- [x] Adhésion réglée par une avance, en partie puis pour le solde.
- [x] Commande boutique d'un contact sans foyer réglée par crédit, puis annulée :
  le crédit revient.
- [x] Écritures vérifiées en base.
- [x] Verrou vérifié sur PostgreSQL : deux utilisations simultanées.

Sur club-demo, le 2026-09-15 (commit `1bc5958`), avec le crédit de 50 € de
Florent laissé par le lot 1 :
- **Facture du foyer** : une facture libre de 50 € sur son foyer, dont son
  membre est payeur (pas un panier d'adhésion : le contrôle du payeur est le
  même).
  - Deux imputations simultanées de 30 € : l'une passe, l'autre est refusée
    (« Au plus 20,00 € : crédit disponible 20,00 €, reste à encaisser
    20,00 € »). La refusée a répondu la première, mais elle a lu l'écriture de
    l'autre : elle a attendu son commit sous le verrou.
  - Les 20 € restants réglés depuis le tiroir (« Régler avec le crédit »,
    montant proposé 20,00) : facture PAYÉE.
- **Commande boutique** : club-demo n'a ni contact ni membre sans foyer. Vente
  au comptoir au nom du contact de Florent, dont la facture n'a pas de foyer.
  - Avance de 10 €, puis règlement par crédit : payeur proposé, le contact ;
    commande PAYÉE et servie.
  - Annulation depuis le tiroir, qui annonce « Crédit : 10,00 € rendus au
    crédit du payeur » : crédit revenu à 10 €, stock revenu.
- **En base** :
  - imputations en INCOME, DÉBIT 419100 / CRÉDIT 706100 ou 708000, sans
    compte financier ;
  - paiement négatif `PAYER_CREDIT` qui désigne l'imputation rendue ;
  - contre-passation DÉBIT 708000 / CRÉDIT 419100, rattachée à l'écriture de
    l'imputation ;
  - aucune erreur nouvelle dans le log de l'API.
- **Fiche membre**, bloc Crédit : les utilisations et le crédit rendu sont
  listés.

### Task 2.5 : Annulations sous le verrou de la facture

Limite de la tâche 2.3 : une annulation qui passait entre la relecture d'un
règlement et son commit laissait le paiement sur une facture annulée.

- [x] Les verrous passent dans `payments/settlement-locks.ts`, partagé par les
  paiements, la boutique et l'adhésion. `lockInvoicesInTx` prend plusieurs
  factures, chacune une fois, dans l'ordre de leurs identifiants.
- [x] Les six chemins qui passent une facture VOID prennent son verrou dans leur
  transaction, puis relisent statut et paiements avant d'écrire :
  - `voidInvoice` ouvre une transaction et relit la facture ;
  - `reopenCart` relit `reopenBlockedReason` dans la sienne ;
  - `cancelOrder` et `cancelOrderForViewer` verrouillent les factures ouvertes
    de la commande avant de la réclamer. Leurs gardes « aucun encaissement »
    s'évaluent sous le verrou, et le nombre de factures annulées doit être celui
    des factures verrouillées ;
  - `cancelAndRefund` et `adjust` verrouillent les factures du plan.
    `assertUnchangedInTx` compare aussi leur statut, et `applyInTx` lève si une
    facture à annuler ne s'annule pas.
- [x] Les factures se verrouillent avant toute écriture sur la commande : un
  règlement qui solde sa facture sert la commande sous ce verrou.
- [x] Tests : `invoice-void-lock.spec.ts`, sur `test/shop-order-world.ts`. Le
  monde reproduit désormais le verrou par clé levé en fin de transaction, le
  rollback de la seule transaction qui lève et la latence de lecture (état pris
  au début de la requête). `atMoment` lance la seconde opération juste avant
  l'écriture de la première.
  - Pour chacun des six chemins, un règlement et une annulation simultanés, dans
    les deux ordres : un seul des deux passe.
  - Un encaissement carte, qui ne prend pas le verrou, commité juste avant
    l'écriture d'une annulation boutique : rien n'est écrit.
  - Mutations à la main : 13 tuées sur 13. Chaque verrou retiré fait rougir les
    deux tests de son chemin, et eux seuls. Les relectures ignorées, les gardes
    de compte, le statut relu et l'ordre des verrous rougissent chacun leur test.
- [x] Vérification sur le vrai PostgreSQL de staging, le 2026-09-15, sans
  déploiement : le code du poste, relié à la base par un tunnel SSH, dans un
  club jetable sans module comptable (`recette-verrou-annulation-202609150942`).
  Une transaction est arrêtée juste avant son écriture, l'autre opération est
  lancée, et `pg_locks` dit si elle attend le verrou de la facture.
  - Facture libre, règlement d'abord : l'annulation attend, puis refuse (« Un
    règlement vient d'être enregistré ») ; facture ouverte, paiement de 10 €.
  - Facture libre, annulation d'abord : le règlement attend, puis refuse (« La
    facture vient de changer ») ; facture annulée, aucun paiement.
  - Témoin, l'annulation d'avant, sans verrou, dans la même course : les deux
    passent, et la facture est annulée avec un paiement de 10 €. La course
    discrimine.
  - Commande, règlement complet d'abord : l'annulation attend, puis refuse
    (« elle est déjà payée ») ; commande et facture payées, aucun interblocage.
  - Commande, annulation d'abord : le règlement attend, puis refuse ; commande
    et facture annulées.
  - Témoin, une annulation qui écrit la commande AVANT de prendre le verrou :
    PostgreSQL détecte un interblocage (40P01) avec le règlement qui sert la
    commande. L'ordre « factures d'abord » est nécessaire.

Limite connue : l'encaissement carte (webhook Stripe) ne prend pas le verrou
(ADR-0022, §3). Levée par la tâche 2.6.

### Task 2.6 : Encaissement carte et remboursement confirmé sous le verrou

Limite de la tâche 2.5 : le webhook Stripe lisait la facture ouverte hors
transaction, puis écrivait son paiement sans verrou. Une annulation commitée
entre les deux laissait un paiement carte sur une facture annulée.

- [x] `applyStripePaymentSuccess` prend le verrou de la facture en tête de sa
  transaction, avant toute écriture, commande boutique comprise. Il relit
  dessous, dans cet ordre :
  - le paiement déjà enregistré pour son paymentIntent (rejeu : frais
    retentés). Relu après le statut, il ferait prendre pour un orphelin la
    seconde livraison d'un paiement qui vient de solder la facture ;
  - le statut, puis le reste dû constaté (`resolveInvoiceBalance`). Pas
    l'encaissable : pour une échéance, il déduirait son propre paiement, encore
    en vol.
- [x] Facture plus ouverte ou solde nul : aucun paiement, le même ENCAISSEMENT
  ORPHELIN, et le webhook répond sans erreur. L'argent est déjà chez le club ;
  une exception ferait rejouer Stripe en boucle.
- [x] `applyRefundConfirmed` prend le même verrou avant son paiement négatif et
  son avoir.
- [x] Tests sur `test/shop-order-world.ts`. Le monde passe désormais par la
  vraie porte du webhook (livraison signée, réservation de l'événement) et par
  le vrai `StripeRefundsService`. Le moment `refund` place une course juste
  avant un paiement négatif.
  - `invoice-void-lock.spec.ts` : la carte contre chacune des six annulations,
    dans les deux ordres, et une commande soldée par carte contre son
    annulation. Jamais de paiement sur une facture annulée.
  - `stripe-webhook-lock.spec.ts` : la carte contre une saisie, dans les deux
    ordres ; une saisie qui solde pendant la carte ; le solde nul ; deux
    livraisons simultanées du même paymentIntent ; un remboursement confirmé
    contre « Annuler et rembourser ».
  - Témoin : le code d'origine fait rougir 19 des 36 tests de ces deux suites.
  - Mutations à la main : 9 tuées sur 9.
    - Le verrou du webhook retiré fait rougir ses 18 tests de course, et eux
      seuls ; celui du remboursement, son seul test.
    - Statut relu hors verrou : 8 rouges ; reste dû relu avant le verrou : 9 ;
      idempotence jamais trouvée : 1 ; idempotence relue après le statut : 1 ;
      webhook qui lève : 8 ; solde nul non contrôlé : 1 ; orphelin non
      journalisé : 9.
    - Une première forme de la mutation d'idempotence ne compilait pas : verdict
      refusé. Rejouée sous une forme valide, elle est tuée.
- Non rejoué sur le PostgreSQL de staging. Le verrou et la relecture sont ceux
  de la saisie manuelle, vérifiés ainsi à la tâche 2.5 ; la course du webhook
  elle-même ne l'a pas été.

Relevés en passant : trois cas où de l'argent reçu par carte n'est ni
enregistré ni signalé correctement. Levés par la tâche 2.7.

### Task 2.7 : L'argent reçu par carte, toujours enregistré ou signalé

Limites de la tâche 2.6, antérieures au verrou du webhook. Comportements
tranchés par Florent le 2026-09-15.

- [x] Contrôle du payeur qui refuse après le paiement (fiche désactivée, sortie
  du foyer ou supprimée depuis l'ouverture du paiement). Il levait : Stripe
  rejouait en boucle, sans paiement ni orphelin. Désormais :
  - le paiement s'enregistre et solde la facture ;
  - il garde son payeur si la fiche existe dans le club, s'enregistre sans
    payeur sinon, et le refus est journalisé en avertissement ;
  - une lecture en panne n'est pas un refus : elle lève, et Stripe rejoue.
- [x] Paiement carte supérieur au reste dû (saisie, avoir ou imputation passés
  pendant le paiement). Il était tronqué sans trace. Le reste dû s'enregistre,
  et l'excédent est journalisé en ENCAISSEMENT ORPHELIN PARTIEL.
- [x] Rendre cet excédent depuis Stripe n'écrit ni paiement négatif ni avoir.
  - Un remboursement créé hors de ClubFlow rend d'abord l'excédent, moins ce
    que les autres remboursements hors ClubFlow n'ont pas écrit en base. Un
    remboursement de `refundPayment` (metadata `paymentId`) rend toujours
    l'encaissement qu'il désigne.
  - La part se relit sous le verrou de la facture : ni l'ordre des livraisons,
    ni un rejeu ne la changent.
  - Le plafond de `refundPayment` ne compte pas l'excédent rendu. Le rattrapage
    quotidien ne compte plus comme rattrapé un remboursement qui n'a rien écrit.
  - Le webhook et le rattrapage passent par `applyChargeRefunds`, qui ne retient
    que les remboursements aboutis.
- [x] Rejeu après commit : la lecture préalable ne filtre plus sur OPEN, le
  statut se décidant sous le verrou. Un rejeu trouve son paiement, reprend le
  soldage de l'échéance (`markInstallmentPaid`, idempotent) puis les frais, et
  n'est plus pris pour un ENCAISSEMENT ORPHELIN. Une facture introuvable reste
  un orphelin, dit « introuvable ».
- [x] Tests sur `test/shop-order-world.ts`. Le monde simule désormais le
  contrôle du payeur (statut de la fiche, foyer, groupe foyer), le soldage
  d'une échéance, et `charge.refunded` par la vraie porte du webhook.
  - `stripe-webhook-money.spec.ts`, 16 tests : payeur refusé (fiche inactive,
    hors foyer, absente), lecture en panne, excédent (saisie pendant la carte,
    avoir), remboursements de l'excédent (tableau de bord, part mixte,
    `refundPayment`, livraisons successives, livraisons simultanées), rejeu
    (dernière échéance, échéance intermédiaire), facture introuvable.
  - `stripe-refunds.service.spec.ts` : plafond de `refundPayment` avec un
    excédent, rattrapage, remboursement en attente.
  - Témoin : le code d'origine fait rougir 13 des 16 tests du monde, chacun
    pour la raison attendue. Les 3 autres gardent contre une mutation : payeur
    du foyer, lecture en panne, montant exact.
  - Mutations à la main : 21 tuées sur 21, chacune par les tests attendus, et
    aucune par une erreur de compilation.
    - Webhook, 11 : lecture préalable filtrée sur OPEN (1 rouge) ; rejeu sans
      soldage de l'échéance (2) ; refus du payeur qui lève (3) ; toute erreur
      prise pour un refus (1) ; payeur toujours retiré (2) ; payeur gardé sans
      fiche (1) ; refus tu (3) ; excédent non signalé (2) ; signalé au montant
      exact (5) ; payeur brut sur le paiement (1) ; montant encaissé non
      transmis (5).
    - Remboursements, 10 : remboursement de l'app pris pour le tableau de bord
      (1) ; part de l'excédent lue avant le verrou (1) ; autres remboursements
      comptés en entier (2) ; plafond sans l'excédent (2) ; plafond comptant
      l'app sur l'excédent (1) ; excédent non borné (1) ; rattrapage compté sans
      écriture (1) ; origine des remboursements perdue (1) ; remboursement tout
      d'excédent écrit quand même (5) ; remboursement en attente enregistré (1).
- Non rejoué sur le PostgreSQL de staging.

Limites connues :
- L'excédent n'a de trace qu'au journal. Tant qu'il n'est pas rendu, le transit
  Stripe (512300) s'écarte de ce montant au virement suivant.
- `markInstallmentPaid` qui lève après avoir passé l'échéance PAID : un rejeu
  n'achève pas la clôture de l'échéancier (sortie anticipée, antérieure).
- Un processus arrêté après le commit, sans exception, garde la réservation de
  l'événement : le rejeu de Stripe sort aussitôt, et seul le rattrapage
  quotidien solde l'échéance (antérieur).

---

## Lot 3 — Portail et appli

Choix de Florent : le correctif des routes REST (PDF, exports, médias) d'abord,
à part (livré en 0.68.3) ; « Créditer mon compte » plafonné à 1 000 € ; le remboursement carte
d'une avance fait avec ce lot ; le tiroir foyer, une ligne par personne. Le lot
se livre en deux fois : A (tâches 3.1 et 3.2), puis B (tâche 3.3).

### Task 3.1 : Consultation

- [x] `viewerPayerCredit` : solde et historique **du compte connecté**, pas du
  profil actif. Un payeur voit les profils de tous les membres de son foyer et
  peut en activer un ; le crédit d'un autre adulte est son argent à lui.
  - La personne du compte : sa fiche membre dans le club, sinon sa fiche contact
    (`resolveAccountPayerCreditRef`), puis `resolvePayerCreditHolder`, qui réunit
    les deux. Un compte sans fiche dans le club : crédit nul, historique vide.
  - Historique à plat (`payerCreditMovements`) : un paiement par ligne, du plus
    récent au plus ancien, chacun avec son effet sur le crédit (avance,
    avance remboursée, utilisation, crédit rendu). La somme des lignes est le
    solde. Sans référence de paiement : ni numéro de chèque, ni identifiant Stripe.
  - Portail : indicateur « Crédit disponible » (ou « Crédit à régulariser ») et
    historique replié en tête de `/factures` ; rappel sur la page Famille, hors
    des onglets de foyer. Affichés pour un payeur seulement, et jamais sur une
    requête en erreur (module Paiement coupé) : rien plutôt que « 0,00 € ».
  - Appli : carte « Crédit » sur l'écran Famille, historique à la demande.
- [x] Admin : `clubFamilyPayerCredits(familyId)`, section « Crédit » du tiroir
  foyer, en lecture seule. Une ligne par personne liée au foyer, membre et
  contact d'un même compte réunis ; crédit nul omis, crédit négatif gardé (« À
  régulariser ») ; accès à la fiche. Masquée, et sans requête, module Paiement
  coupé.

### Task 3.2 : « Utiliser mon crédit »

- [x] `viewerApplyPayerCredit(invoiceId, amountCents?)` : périmètre payeur du
  profil actif (`resolvePayerInvoiceWhere`, celui de « Payer en ligne »), puis
  `PaymentsService.applyPayerCredit` au nom de la personne du compte, qui refait
  le contrôle du payeur et relit crédit et reste dû sous verrou. Hors périmètre,
  la facture est introuvable. Limité à 10 par minute.
- [x] Bouton sur une facture ouverte, au portail et dans l'appli, montrant le
  montant : le plus petit du reste dû et du crédit. Une confirmation dit ce qui
  restera à payer et le crédit après ; le montant confirmé est envoyé, et l'API
  le refuse s'il dépasse ce qu'elle relit. Facture et crédit se rechargent après
  une réussite comme après un refus.
- [x] Tests.
  - `viewer-payer-credit.resolver.spec.ts`, 9 tests, sur le vrai calcul du
    crédit, le vrai périmètre payeur et la vraie imputation : crédit du compte
    et non du profil actif (affiché et dépensé), fiches du compte dans un autre
    club, montant confirmé, défaut au plus petit, facture hors périmètre que la
    personne pourrait pourtant régler, profil qui ne paie pour aucun foyer,
    gardes du résolveur.
  - `payer-credit-movements.spec.ts` (2), `payer-credit.service.spec.ts`
    (+2, crédit d'un foyer), test de construction du schéma (+1).
  - Le monde simulé de l'imputation passe dans `test/payer-credit-world.ts`,
    partagé : tests et monde identiques à l'octet près, 22 tests verts, puis
    relation `contact` d'un lien et foyer inclus pour le périmètre payeur.
  - Portail et appli : `lib/payer-credit.ts` et ses 11 tests chacun.
- [x] Mutations à la main : 25 tuées sur 25, chacune par les tests attendus.
  - Personne du compte, 2 : fiche membre ou contact cherchée hors du club (1
    rouge chacune).
  - Historique, 7 : signe d'une utilisation (2) ; avance et remboursement
    confondus (2) ; utilisation et crédit rendu confondus (2) ; ordre inversé
    (2) ; ordre des lignes simultanées (1) ; moyen de versement perdu (2) ;
    facture désignée par son identifiant (2).
  - Résolveur, 8 : crédit affiché du profil actif (2) ; crédit dépensé du profil
    actif (1) ; facture hors périmètre (1) ; profil sans foyer accepté (1) ;
    montant confirmé ignoré (1) ; historique vide (1) ; sans la garde du profil
    actif (1) ; sans le module Paiement (1).
  - Modèle, 1 : référence de paiement exposée au portail (1). Sa première
    forme ne compilait pas ; rejouée en champ facultatif.
  - Foyer, 7 : foyer hors du club (1) ; une personne sur deux lignes (1) ;
    crédit nul affiché (1) ; crédit négatif caché (1) ; ordre du foyer (1) ;
    fiche d'un autre club qui fait échouer le foyer (1) ; contacts ignorés (1).
- [x] Vérifications : typecheck de l'API, de l'admin, du portail et de l'appli
  (`npm ci` dans `apps/mobile` du worktree, 0 erreur) ; Jest complet, 1 828
  tests ; vitest portail 75, admin 167, appli 55.
- [x] Rendu vérifié sur une API simulée (Docker arrêté) : portail (solde,
  historique, confirmation, règlement puis rechargement, crédit négatif,
  requête en erreur) ; tiroir foyer de l'admin (lignes, foyer sans crédit,
  module Paiement coupé).
- [x] Recette staging de la livraison A, sur club-demo, le 2026-09-17 (commit
  `0f49025`), avec le crédit de 10 € de Florent laissé par le lot 2 :
  - **Déploiement** : les trois champs répondaient « Cannot query field » avant,
    « Unauthorized » sans jeton après, face à un champ témoin inexistant.
    L'historique n'expose pas `externalRef`.
  - **Crédit du compte, pas du profil actif** : 10,00 € et le même historique
    de 7 lignes depuis le profil de Florent et depuis celui de son fils mineur,
    sans compte. La somme des lignes est le solde, et concorde avec la base.
  - **Tiroir foyer** (`clubFamilyPayerCredits`) : une ligne « Florent Morel,
    10,00 € ».
  - **Utiliser le crédit** sur la facture « Recette crédit lot 3 12h02 —
    portail » (`b54158f2…`, 10 €, foyer `7cb6bebb…`) :
    - depuis le profil du fils, refus « Seul le payeur du foyer peut régler une
      facture en ligne. » ;
    - 4 € confirmés : crédit 6 €, facture ouverte, reste 6 € ;
    - 7 € refusés : « Au plus 6,00 € : crédit disponible 6,00 €, reste à
      encaisser 6,00 €. » ;
    - sans montant : 6 €, facture PAYÉE, crédit 0 € ;
    - une nouvelle tentative : « Seule une facture ouverte se règle avec le
      crédit. »
  - **Après** : historique de 9 lignes pour 0 € ; plus de ligne pour le foyer,
    et le tiroir de l'admin affiche « Aucun crédit parmi les personnes du
    foyer. »
  - **En base** : deux paiements `PAYER_CREDIT` de 4 et 6 € au nom de son
    membre ; deux écritures INCOME validées, DÉBIT 419100 / CRÉDIT 706100, sans
    compte financier ; crédit recalculé à 0 (60 € versés, 60 € imputés) ;
    aucune erreur nouvelle au journal de l'API.
  - **Non vus à l'écran sur staging** : le portail et l'appli, faute de session
    adhérent ; leurs requêtes ont été jouées avec un jeton de profil
    (`selectActiveViewerProfile`).

Limites connues :
- Une facture hors du périmètre « Payer en ligne » (adhésion sans foyer, achat
  boutique d'un contact) ne se règle pas avec le crédit depuis le portail ;
  l'admin le peut.
- Un compte qui ne paie pour aucun foyer ne voit pas son crédit au portail.
- La limite de 10 par minute n'est pas testée (configuration, comme les autres
  mutations du portail).

### Task 3.3 : « Créditer mon compte » par carte

Choix de Florent : réservé aux payeurs ; remboursement depuis le tiroir du reçu ;
enregistrement dès l'accord de Stripe (tâche 4.2).

- [x] Session Stripe sans facture préalable (`viewerCreatePayerCreditCheckoutSession`),
  metadata : objet, personne du compte connecté, club et compte connecté
  (`payer-credit-top-up.ts`, contrat unique avec le webhook). De 1 € à 1 000 €,
  réservée au périmètre payeur du profil actif, sur le compte connecté du club.
  `viewerPayerCredit.cardTopUpAvailable` dit si le club encaisse par carte.
- [x] Webhook `payment_intent.succeeded`, branche « avance » :
  - crée le reçu PAID et le paiement carte dans une transaction ; `stripePaymentIntentId`, unique, garantit l'idempotence, livraisons simultanées comprises ;
  - écriture TRANSFER 512300 / 419100 et frais Stripe après le commit, repris par un rejeu ;
  - événement d'un autre compte connecté ou de la plateforme, personne introuvable, metadata illisibles : rien n'est crédité, ENCAISSEMENT ORPHELIN journalisé, sans erreur.
- [x] Retour de paiement : `/factures?paid=1` sur le web (rechargement immédiat,
  puis après 4 s) ; dans l'appli, lien profond `clubflow://payment-return` par
  `openAuthSessionAsync` (cf. pitfall `openauthsession-exige-scheme-custom`).
- [x] Portail : formulaire « Créditer mon compte » sous le crédit, page Famille
  qui y mène. Appli : saisie et bouton dans la carte « Crédit ».
- [x] Tests.
  - `payer-credit-card.spec.ts`, 15 tests, sur le monde partagé
    `test/payer-credit-world.ts`. Le monde simule désormais le club et son
    compte connecté, les contraintes uniques du reçu (`stripePaymentIntentId`)
    et du paiement négatif (`stripeRefundId`), et livre au webhook de vrais
    événements signés.
    - Session : le compte connecté est crédité, jamais le profil actif, jusqu'au
      reçu créé par le webhook ; bornes (99 et 100 001 centimes, 0 et 250,5
      refusés ; 1 € et 1 000 € acceptés) ; profil qui ne paie pour aucun foyer ;
      club sans encaissement Stripe ; retours web et appli.
    - Webhook : reçu, paiement, écriture et frais après le commit ; rejeu,
      nouvel événement du même paiement et livraisons simultanées ; autre compte
      connecté et plateforme ; personne introuvable et metadata illisibles.
    - Remboursement (tâche 4.2) : plafond du crédit disponible, refus sans appel
      à Stripe, confirmation du webhook sans doublon, remboursement en attente,
      imputation simultanée, écriture en échec après l'accord de Stripe.
  - Contre-passation d'une avance restée TRANSFER (+1) ; construction du schéma
    (champ `cardTopUpAvailable` et mutation).
  - Portail et appli : lecture du montant saisi (+3 chacun) ; admin : plafond du
    remboursement d'une avance (+2).
- [x] Mutations à la main : 32 tuées sur 32, chacune par les tests attendus.
  - Montant et metadata, 6 : minimum ignoré (1 rouge) ; maximum ignoré (1) ;
    centimes non entiers (1) ; contact écrit en membre (9) ; deux personnes
    lues comme une (1) ; tout paiement pris pour une avance (11, dans
    `stripe-webhook-money.spec.ts`).
  - Session, 4 : hors du compte du club (1) ; montant figé (2) ; retour vers
    la facturation générique (1) ; metadata absentes du paiement (1).
  - Résolveur, 3 : carte proposée sans encaissement Stripe (1) ; non-payeur
    autorisé (1) ; profil actif crédité (1).
  - Webhook, 10 : compte émetteur non contrôlé (1) ; plateforme acceptée (1) ;
    doublon simultané qui lève (1) ; reçu sans paiement Stripe unique (2) ;
    écriture oubliée (1) ; frais oubliés (1) ; compte d'encaissement non noté
    (7) ; reçu né ouvert (1) ; personne introuvable qui lève (1) ; branche
    avance après la facture (11).
  - Remboursement, 8 : non plafonné au crédit (4) ; sans le verrou de la
    personne (1) ; jamais enregistré à l'accord de Stripe (3) ; en attente
    enregistré comme abouti (1) ; échec d'écriture remonté au trésorier (1) ;
    avance remboursée comme une facture (4) ; contre-passation oubliée (1) ;
    crédit épuisé non signalé (1).
  - Comptabilité, 1 : avance contre-passée en charge (1).
  - Deux premières formes ne compilaient pas (tout paiement pris pour une
    avance, avance remboursée comme une facture) ; rejouées sous une forme qui
    compile.
  - Le test de l'imputation simultanée attendait le remboursement puis
    l'imputation : quand la première attente échouait, le rejet de la seconde
    restait sans gestionnaire et tuait Jest, sans rapport. Il attend désormais
    les deux ensemble (`Promise.allSettled`).
- [x] Vérifications : typecheck de l'API, de l'admin, du portail et de l'appli ;
  Jest complet, 1 844 tests ; vitest portail 78, admin 169, appli 58 ; ESLint
  des fichiers touchés du portail et de l'admin, sans nouvel avertissement.
- [x] Rendu vérifié sur une API simulée (Docker arrêté) : portail (formulaire,
  montant de 0,50 € refusé, 25 € soumis puis crédit rechargé au retour) ;
  tiroir du reçu de l'admin (20 € proposés et rappelés comme plafond, bouton
  masqué quand le crédit est épuisé). L'écran de l'appli n'a pas été vu.

Limites connues :
- Un remboursement en attente chez Stripe ne réserve pas le crédit : s'il sert
  entre-temps, le crédit devient négatif quand le webhook l'enregistre.
- Un remboursement fait depuis le tableau de bord Stripe n'est pas plafonné.
- La limite de 10 sessions par minute n'est pas testée.
- club-demo n'a pas de compte Stripe connecté : la recette carte se fait sur un
  club en mode test.

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

- [x] Par carte (fait avec la livraison B du lot 3) : remboursement d'une avance
  plafonné au crédit disponible, sous le verrou de la personne puis du reçu.
  - Depuis le bouton « Rembourser » du tiroir du reçu, qui propose au plus ce
    plafond et le rappelle ; bouton masqué quand le crédit est épuisé.
  - Le remboursement se crée chez Stripe sous verrou et s'enregistre aussitôt
    s'il a abouti ; le webhook le retrouve (`stripeRefundId` unique). En attente
    chez Stripe : le webhook l'enregistrera. Écriture en échec après l'accord :
    rendu au trésorier comme fait, le webhook l'écrit.
  - Contre-passation **TRANSFER** : DÉBIT 419100 / CRÉDIT trésorerie ; toute
    contre-passation d'un TRANSFER reste un TRANSFER.
- [ ] En espèces ou par virement : paiement négatif sur le reçu et avoir, avec
  la même contre-passation, sur le modèle du remboursement boutique
  ([ADR-0019](../../memory/decisions/0019-boutique-annulation-remboursement.md)).

### Task 4.3 : Recette staging

- [ ] Virement de 150 € pour une facture de 100 €.
- [ ] Remboursement du crédit restant à un membre qui quitte le club.
