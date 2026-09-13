# Boutique : CGV, remise signée, commande sur rupture, remboursements et échanges — plan d'implémentation par lots

> **Pour agents :** cocher les étapes (`- [ ]`) au fil de l'eau. Chaque lot se
> livre **seul** sur `staging`, s'y vérifie en conditions réelles, puis se promeut
> vers `main` (cf. [workflows/promouvoir-une-branche-partagee.md](../../memory/workflows/promouvoir-une-branche-partagee.md)).
> **Aucun commit sans demande explicite de Florent.**

**Décision de référence :**
[ADR-0017](../../memory/decisions/0017-boutique-paiement-sortie-remise.md)
(règlement, sortie de stock et remise sont trois faits distincts), qui s'appuie
sur l'[ADR-0011](../../memory/decisions/0011-remboursement-eteint-la-creance.md),
l'[ADR-0012](../../memory/decisions/0012-boutique-variantes-et-stock.md),
l'[ADR-0013](../../memory/decisions/0013-commandes-fournisseur.md) et
l'[ADR-0015](../../memory/decisions/0015-cheques-a-encaisser-5112.md).

**Goal :** une boutique qui suit la vie réelle d'une vente au club. L'adhérent
accepte les CGV avant de commander ; il peut commander un article épuisé avec un
délai indicatif ; il règle en ligne ou sur place, avant ou après le retrait ; il
signe la remise sur le téléphone de l'admin. L'admin peut annuler, rembourser ou
échanger une commande payée, et le stock comme la comptabilité restent justes à
chaque étape.

**Architecture :** la commande porte trois faits indépendants — `status`
(règlement, inchangé), `fulfilledAt` (sortie de stock) et `deliveredAt`
(remise). Une seule fonction, `claimFulfilmentInTx`, décide de la sortie et
est appelée par tous les chemins : webhook carte, encaissement manuel, remise
signée, affectation à l'arrivage. Les remboursements et échanges composent
l'avoir (`CreditNotesService`) et le remboursement Stripe
(`StripeRefundsService`) existants. La signature est capturée par un pavé canvas
de l'admin, sans dépendance ; le bon de livraison est un PDF pdfkit produit à la
demande à partir des données figées à la remise.

**Tech stack :** NestJS 11, Prisma 6 (`prisma db push`, cf.
[ADR-0003](../../memory/decisions/0003-prisma-db-push.md)), GraphQL code-first,
admin React + Vite + Apollo, portail membre React, application mobile Expo,
pdfkit, Jest, Vitest.

---

## Garde-fous

- **[Garantie derrière un effet de bord](../../memory/pitfalls/garantie-derriere-effet-de-bord.md)** :
  la sortie de stock vit dans la transaction du geste qui la déclenche —
  encaissement, remise, affectation —, jamais après son commit.
- **[Une supposition qui survit à la décision](../../memory/pitfalls/une-supposition-survit-a-la-decision.md)** :
  la règle « première des deux actions » est posée dans **une** fonction. C'est
  précisément ce qui a manqué le 2026-09-13, quand seul le webhook carte clôturait
  une commande et que l'encaissement manuel l'oubliait.
- **[Test qui vérifie la forme](../../memory/pitfalls/test-verifie-la-forme-pas-le-comportement.md)** :
  chaque invariant a un test dont on a vérifié qu'il **rougit** quand on retire
  la garantie (mutation à la main, notée dans la PR).
- **[Un double qui ignore — ou exige — une clause du `where`](../../memory/pitfalls/double-ignore-une-clause-du-where.md)** :
  les doubles Prisma sont écrits en face des requêtes, et l'on lit le **nombre**
  de tests rouges de chaque mutation.

Multi-tenant : `clubId` filtré dans chaque requête, y compris sur les relations
traversées. Déploiement : les écrans adhérent atteignent le portail au
déploiement, l'application mobile seulement à sa publication suivante.

---

## Ordre des lots et dépendances

| Lot | Contenu | Dépend de | Valeur livrée seule |
|---|---|---|---|
| 1 | CGV : PDF public, acceptation obligatoire, version gardée sur la commande | — | CGV opposables |
| 2 | Sortie de stock à la première action, remise signée, bon de livraison | — | preuve de retrait, remise avant paiement |
| 3 | Commande sur rupture : réglage produit, trois états, attente d'arrivage, affectation | 2 | vendre ce qui est commandé au fournisseur |
| 4 | Annulation et remboursement d'une commande payée, retour en stock | 2 | corriger une vente |
| 5 | Échange d'article | 4 | changer de taille sans tout annuler |

---

## Lot 1 — Conditions générales de vente

### Task 1.1 : Schéma

- [x] `Club.shopTermsAssetId String?` — relation `ClubShopTerms` vers
  `MediaAsset`, `onDelete: NoAction` — et `Club.shopTermsUpdatedAt DateTime?`.
- [x] `ShopOrder.termsAssetId String?` — relation `ShopOrderTerms`,
  `onDelete: NoAction` : la base refuse de supprimer un PDF accepté, et la
  version acceptée survit au remplacement des CGV — et
  `ShopOrder.termsAcceptedAt DateTime?`.

### Task 1.2 : Service et GraphQL

- [x] Admin : `shopTerms` (fichier, lien, date) et `setShopTerms(mediaAssetId)`,
  `null` pour retirer. L'asset doit être un PDF du club ; il est rendu public.
- [x] Adhérent : `viewerShopTerms` → `{ id, url, fileName, updatedAt }` ou `null`.
- [x] **Invariant**, posé dans `placeOrderInTx` où se rejoignent le checkout, le
  « régler sur place » et `viewerPlaceShopOrder` : dès que le club a des CGV, la
  commande exige `acceptedTermsId`, **l'identifiant de la version affichée**, et
  le refuse s'il n'est pas celui en vigueur (CGV remplacées pendant le
  règlement). La commande garde `termsAssetId` et `termsAcceptedAt`. Le paramètre
  `terms` de `placeOrderInTx` est obligatoire : un chemin oublié ne compile pas.
  L'argument GraphQL est **optionnel** pour que les anciennes versions de
  l'application restent valides côté schéma ; elles sont refusées avec un
  message qui demande la mise à jour tant que des CGV existent.
- [x] **Invariant** : un PDF de CGV — courant, ou accepté sur au moins une
  commande — ne peut pas être supprimé de la médiathèque. `MediaAssetsService.delete`
  supprime désormais la ligne **avant** le fichier : un refus de clé étrangère
  ne détruit plus le fichier.

### Task 1.3 : Admin

- [x] Réglages de la boutique : carte « Conditions générales de vente » — envoi du
  PDF, lien, date, remplacer, retirer. La carte de commande affiche « CGV
  acceptées le … », et la médiathèque affiche le motif d'un refus de suppression.

### Task 1.4 : Portail membre

- [x] Case obligatoire et lien dans la modale de règlement, pour la carte comme
  pour « Régler sur place ». Pas en reprise de paiement : la commande existe
  déjà, ses CGV ont été acceptées. Lien « Conditions générales de vente » en
  tête de la boutique. Règle pure `shopTermsGate` testée (vitest) ; une nouvelle
  version arrivée pendant que la fenêtre est ouverte décoche la case.

### Task 1.5 : Application mobile

- [x] Même acceptation avant « Payer par carte » et « Régler sur place ». Livrée à
  la prochaine publication de l'application.

### Task 1.6 : Vérification staging (2026-09-13)

- [x] Club sans CGV : commande possible comme avant — couvert par les tests
  unitaires, non rejoué sur staging.
- [x] CGV déposées depuis l'admin : PDF lisible sans connexion (HTTP 200,
  identique au fichier déposé), asset `PUBLIC` / `SHOP_TERMS`. Refus sans
  acceptation sur la carte, le « régler sur place » et `viewerPlaceShopOrder` ;
  refus d'une autre version ; panier intact après refus ; commande acceptée avec
  `termsAssetId` et `termsAcceptedAt` en base, facture ouverte, stock réservé.
- [x] Remplacement des CGV : l'ancienne commande garde la v1, la v1 remplacée est
  refusée à la commande, et aucune des deux versions n'est supprimable (400,
  motif explicite). Journal d'erreurs de l'API inchangé.

---

## Lot 2 — Sortie de stock à la première action, remise signée

### Task 2.1 : Schéma

- [x] `ShopOrder.fulfilledAt DateTime?`, `deliveredAt DateTime?`,
  `deliveredByUserId String?`, `deliverySignerName String? @db.VarChar(160)`,
  `deliverySignaturePng String? @db.Text`.
- [x] Pas de rattrapage : une commande payée est sortie à son paiement, par
  construction. « Sortie » se lit `status = PAID OR fulfilledAt IS NOT NULL`.

### Task 2.2 : La règle en un seul endroit

- [x] `claimFulfilmentInTx(tx, clubId, orderId, trigger)` : pose `fulfilledAt`
  s'il est NULL — sur une commande PAYÉE au règlement, EN ATTENTE à la remise —
  puis sort la marchandise réservée. Idempotente, jamais d'exception.
- [x] Appelée par la facture soldée (webhook carte, encaissement manuel,
  « Clôturer la commande ») et par la remise signée.
- [x] **Invariant** : payer puis remettre, ou remettre puis payer, sortent le
  stock **une** fois — y compris sur une commande payée avant `fulfilledAt`.
- [x] **Invariant** : une commande remise ne s'annule plus (`fulfilledAt: null`
  dans l'écriture conditionnelle des deux annulations).

### Task 2.3 : Remise signée et bon de livraison

- [x] `deliverShopOrder(orderId, signerName, signaturePng)` : une écriture
  conditionnelle (`deliveredAt: null`) fige date, admin, signataire et
  signature ; la signature porte l'acceptation des CGV si la commande n'en a
  aucune ; puis `claimFulfilmentInTx(…, 'DELIVERY')`.
- [x] Bon de livraison PDF produit à la demande :
  `GET /shop/orders/:id/delivery-note.pdf`, réservé au back-office du club.
- [x] Ouvert par un **lien signé** (club + commande dans la signature, 10 min),
  dans un onglet ouvert pendant le clic : le téléchargement par Blob restait
  sans effet sur staging (2026-09-13). Envoi par e-mail en pièce jointe, à la
  remise ou depuis la commande, à l'adresse de l'acheteur ou à une autre.
- [x] Refus si la commande est annulée ou déjà remise ; au lot 3, si une ligne
  attend un arrivage.

### Task 2.4 : Admin web, pensée pour le téléphone

- [x] « Remettre » sur la carte de commande → tiroir plein écran sur téléphone,
  pavé de signature canvas sans dépendance → « Bon de livraison » téléchargeable
  depuis la commande.

### Task 2.5 : Portail membre

- [x] « À retirer » / « Retirée le … » sur Mes commandes ; « Annuler »
  masqué sur une commande retirée. Application mobile : même chose, à sa
  prochaine publication.

### Task 2.6 : Vérification staging (2026-09-13)

- [x] Remettre puis payer : une seule sortie de stock, constatée en base ;
  payer puis remettre : couvert par les tests.
- [x] Remise signée depuis l'admin et depuis le téléphone de Florent ;
  annulation d'une commande remise refusée ; journal d'erreurs inchangé.
- [x] Bon de livraison : PDF d'une page avec la signature, ouvert dans un nouvel
  onglet par un vrai clic ; lien signé refusé (403) pour un autre club, une
  autre commande, une échéance prolongée, une signature altérée ou absente.
- [ ] Envoi par e-mail : couvert par les tests, pas déclenché sur staging (il
  part vers une vraie adresse).

---

## Lot 3 — Commande sur rupture (précommande)

Nommée « précommande » dans le code : `BACKORDER` y désigne déjà le reliquat
d'une commande fournisseur (ADR-0013). Décision :
[ADR-0018](../../memory/decisions/0018-boutique-precommande.md).

### Task 3.1 : Schéma

- [x] `ShopProduct.preorderEnabled Boolean @default(false)` et
  `ShopProduct.preorderLeadTime String? @db.VarChar(80)`.
- [x] `ShopOrderLine.awaitingStockQty Int @default(0)` : unités en attente
  d'arrivage.

### Task 3.2 : Disponibilité côté adhérent

- [x] `availability` : `IN_STOCK`, `PREORDER` ou `SOLD_OUT`, calculée par une
  seule fonction (`availabilityOf`), avec le délai indicatif du produit.
  Toujours **aucun compteur** exposé à l'adhérent (ADR-0012) ; `preorderedQty`
  reste réservé à l'administration.

### Task 3.3 : Passage de commande

- [x] Sur un produit en précommande, `reserveUpTo` réserve ce qui existe et le
  reste va dans `awaitingStockQty`. Facture émise à la commande.
- [x] Au règlement, seules les unités réservées sortent du stock. La remise est
  refusée tant qu'un article attend. À l'annulation, seules les unités
  réservées reviennent au stock, et l'attente est remise à zéro.

### Task 3.4 : Arrivage

- [x] `ShopPreorderService` attribue les unités par ancienneté de commande. Les
  unités d'une commande déjà sortie du stock sortent tout de suite.
- [x] Attribution appelée après la réception fournisseur, l'entrée ou la
  correction de stock, la fiche produit et l'annulation. Le balayage quotidien
  rattrape une attribution manquée.

### Task 3.5 : Admin, portail, mobile, vérification staging

- [x] Admin, fiche produit : case « Commandable même épuisé » et délai
  indicatif.
- [x] Admin, catalogue : colonne « Précommandées » dans la matrice des
  déclinaisons.
- [x] Admin, commandes : « En attente d'arrivage », et « Remettre » masqué tant
  qu'un article attend. La vente au comptoir signale un manque avant
  l'enregistrement.
- [x] Portail : « sur commande » et délai sur la fiche, dans le panier et au
  règlement ; unités en attente sur « Mes commandes ».
- [x] Application mobile : même chose, à sa prochaine publication.
- [x] Vérification staging (2026-09-13) :
  - fiche produit : case et délai enregistrés depuis l'admin, pastille
    « Précommande · 2 à 3 semaines » sur la carte ;
  - commande adhérent de 5 unités sur 3 en stock : 3 réservées, 2 en attente
    d'arrivage, facture de 75 € ouverte, article ensuite « sur commande » ;
  - admin : « En attente d'arrivage » et « (2 en attente d'arrivage) » ;
    « Remettre » remplacé par « Remise possible à l'arrivage », et la remise
    refusée aussi par le serveur ;
  - entrée de stock de 2 unités : attribution immédiate, mouvements
    RESERVE −3, RESTOCK +2, RESERVE −2 ; stock physique 5, vendable 0 ;
    « Remettre » revient ;
  - journal d'erreurs de l'API inchangé.
- [x] Correctif trouvé pendant la recette : la fiche produit pré-remplissait le
  stock avec le VENDABLE et le renvoyait comme stock compté à chaque
  enregistrement, ce qui faisait fondre le stock physique du montant des
  réservations. Elle part désormais du stock physique et n'envoie une
  correction que si le chiffre change. Vérifié : enregistrement sans
  changement, aucune correction en base.
- [ ] Portail vu à l'écran : la session Chrome n'y est pas connectée ; ses
  données (disponibilité, délai, unités en attente) sont vérifiées par l'API.

---

## Lot 4 — Annulation et remboursement d'une commande payée

Décision : [ADR-0019](../../memory/decisions/0019-boutique-annulation-remboursement.md).
Choix de Florent (2026-09-13) :

- une commande remise s'annule si l'adhérent rapporte l'article ;
- l'article rendu est remis en vente ou déclaré en perte, au choix de l'admin ;
- l'argent est rendu par le même moyen que le paiement ;
- la commande entière d'abord ; l'annulation d'une ligne viendra avec le lot 5.

### Task 4.1 : Plan d'annulation (fonction pure)

- [x] Pour chaque encaissement, calculer le remboursable (montant moins ses
  remboursements) et le moyen :
  - carte ;
  - espèces ;
  - virement ;
  - chèque en portefeuille ;
  - chèque remis (remboursé depuis la banque de sa remise).
- [x] Reste dû à éteindre par un avoir ; facture à annuler si aucun
  encaissement.
- [x] Marchandise à libérer, à reprendre, ou en attente d'arrivage.
- [x] Refus :
  - commande déjà annulée ;
  - prélèvement en cours ;
  - chèque impayé ;
  - carte sans référence Stripe.

### Task 4.2 : Stock et commande

- [x] Mouvement `RETURN` (« Retour client ») : `ShopStockService.returnToStock`.
- [x] `recordShrinkage` accepte la transaction de l'appelant et le lien à la
  commande.
- [x] `ShopService.cancelWithReturnInTx` :
  - écriture conditionnelle sur l'état lu pour le plan ;
  - libération, retour, ou retour puis perte ;
  - attente d'arrivage éteinte ;
  - motif et auteur enregistrés sur la commande ;
  - commande remise refusée sans ses articles.

### Task 4.3 : Remboursement

- [x] `ShopOrderRefundsService` (module paiements), une seule transaction pour :
  - la commande et le stock ;
  - les chèques rendus (écriture conditionnelle) ;
  - les paiements négatifs et leurs avoirs ;
  - l'avoir d'annulation, ou l'annulation de la facture.
- [x] Après le commit :
  - contre-passations (sur le compte de la remise pour un chèque remis) ;
  - remboursements carte ;
  - clôture de l'échéancier ;
  - expiration de la session de paiement ;
  - attribution des précommandes.
- [x] Contre-passation d'un avoir : compte de trésorerie imposable
  (`refundFinancialAccountId`).
- [x] Annulation par l'adhérent refusée dès qu'un encaissement existe.
- [x] L'ancienne annulation par le club annule la facture quand rien n'a été
  encaissé, et renvoie sinon vers « Annuler et rembourser ».
- [x] L'annulation simple (cancelShopOrder, application mobile d'administration)
  passe dans le module paiements : elle ferme aussi la session de paiement et
  l'échéancier de la facture annulée.
- [x] La contre-passation d'un remboursement porte le compte financier d'où
  l'argent sort, et cherche la ligne de relevé déjà importée (ADR-0014).

### Task 4.4 : Admin, vérification staging

- [x] Tiroir « Annuler la commande », qui affiche avant confirmation :
  - l'aperçu du plan ;
  - le motif ;
  - les articles rapportés, remis en vente ou déclarés perdus ;
  - les remboursements et avoirs prévus.

  Un échec du remboursement carte est signalé.
- [x] Journal de stock : « Retour client ».
- [ ] Vérification staging :
  - espèces ;
  - chèque en portefeuille ;
  - carte en mode test ;
  - commande remise rapportée ;
  - article déclaré en perte.

---

## Lot 5 — Échange d'article

### Task 5.1 : Service

- [ ] Avoir sur la ligne rendue, nouvelle ligne pour l'article choisi, stock
  échangé. Différence remboursée si le nouvel article est moins cher, facturée
  sinon.

### Task 5.2 : Admin, vérification staging
