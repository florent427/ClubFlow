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

- [ ] `ShopOrder.fulfilledAt DateTime?`, `deliveredAt DateTime?`,
  `deliveredByUserId String?`, `deliverySignerName String? @db.VarChar(160)`,
  `deliverySignaturePng String? @db.Text`.
- [ ] Pas de rattrapage : une commande payée est sortie à son paiement, par
  construction. « Sortie » se lit `status = PAID OR fulfilledAt IS NOT NULL`.

### Task 2.2 : La règle en un seul endroit

- [ ] `claimFulfilmentInTx(tx, clubId, orderId, trigger)` : pose `fulfilledAt`
  s'il est NULL — sur une commande PAYÉE au règlement, EN ATTENTE à la remise —
  puis sort la marchandise réservée. Idempotente, jamais d'exception.
- [ ] Appelée par la facture soldée (webhook carte, encaissement manuel,
  « Clôturer la commande ») et par la remise signée.
- [ ] **Invariant** : payer puis remettre, ou remettre puis payer, sortent le
  stock **une** fois — y compris sur une commande payée avant `fulfilledAt`.
- [ ] **Invariant** : une commande remise ne s'annule plus (`fulfilledAt: null`
  dans l'écriture conditionnelle des deux annulations).

### Task 2.3 : Remise signée et bon de livraison

- [ ] `deliverShopOrder(orderId, signerName, signaturePng)` : une écriture
  conditionnelle (`deliveredAt: null`) fige date, admin, signataire et
  signature ; la signature porte l'acceptation des CGV si la commande n'en a
  aucune ; puis `claimFulfilmentInTx(…, 'DELIVERY')`.
- [ ] Bon de livraison PDF produit à la demande :
  `GET /shop/orders/:id/delivery-note.pdf`, réservé au back-office du club.
- [ ] Ouvert par un **lien signé** (club + commande dans la signature, 10 min),
  dans un onglet ouvert pendant le clic : le téléchargement par Blob restait
  sans effet sur staging (2026-09-13). Envoi par e-mail en pièce jointe, à la
  remise ou depuis la commande, à l'adresse de l'acheteur ou à une autre.
- [ ] Refus si la commande est annulée ou déjà remise ; au lot 3, si une ligne
  attend un arrivage.

### Task 2.4 : Admin web, pensée pour le téléphone

- [ ] « Remettre » sur la carte de commande → tiroir plein écran sur téléphone,
  pavé de signature canvas sans dépendance → « Bon de livraison » téléchargeable
  depuis la commande.

### Task 2.5 : Portail membre

- [ ] « À retirer » / « Retirée le … » sur Mes commandes.

### Task 2.6 : Vérification staging

- [ ] Payer puis remettre ; remettre puis payer : une seule sortie de stock
  chaque fois, bon de livraison lisible et signé.

---

## Lot 3 — Commande sur rupture

### Task 3.1 : Schéma

- [ ] `ShopProduct.backorderAllowed Boolean @default(false)` et
  `ShopProduct.backorderLeadTime String? @db.VarChar(80)`.
- [ ] `ShopOrderLine.backorderedQty Int @default(0)` : quantité en attente
  d'arrivage.

### Task 3.2 : Disponibilité côté adhérent

- [ ] `availability` : `IN_STOCK`, `OUT_OF_STOCK` ou `BACKORDER`, avec le délai
  indicatif. Toujours **aucun compteur** exposé à l'adhérent (ADR-0012).

### Task 3.3 : Passage de commande

- [ ] Sur un produit commandable en rupture : ce qui existe est réservé, le reste
  est mis en attente. Facture émise à la commande.

### Task 3.4 : Arrivage

- [ ] À la réception fournisseur : affectation aux lignes en attente par
  ancienneté, puis sortie immédiate pour les commandes déjà réglées.

### Task 3.5 : Admin, portail, mobile, vérification staging

---

## Lot 4 — Annulation et remboursement d'une commande payée

### Task 4.1 : Service

- [ ] Annulation totale ou par ligne, avec le mode de remboursement : carte
  (`StripeRefundsService.refundPayment`), chèque encore en portefeuille (chèque
  rendu), chèque remis ou espèces (remboursement enregistré). Avoir du montant
  rendu (ADR-0011).
- [ ] Stock : libération si la marchandise n'était que réservée ; retour en stock
  par un mouvement dédié si elle était sortie.
- [ ] L'annulation par le club laisse aujourd'hui la facture OUVERTE, là où
  l'annulation par l'adhérent l'annule : l'aligner, en tenant compte d'un
  règlement partiel déjà encaissé (constaté le 2026-09-13).

### Task 4.2 : Admin, vérification staging

---

## Lot 5 — Échange d'article

### Task 5.1 : Service

- [ ] Avoir sur la ligne rendue, nouvelle ligne pour l'article choisi, stock
  échangé. Différence remboursée si le nouvel article est moins cher, facturée
  sinon.

### Task 5.2 : Admin, vérification staging
