# Boutique : fournisseurs d'un produit, réapprovisionnement multi-fournisseurs et bon de commande — plan d'implémentation par lots

> **Pour agents :** cocher les étapes (`- [ ]`) au fil de l'eau. Chaque lot se
> livre **seul** sur `staging`, s'y vérifie en conditions réelles, puis se promeut
> vers `main` (cf. [workflows/promouvoir-une-branche-partagee.md](../../memory/workflows/promouvoir-une-branche-partagee.md)).
> **Aucun commit sans demande explicite de Florent.**

**Décision de référence :**
[ADR-0021](../../memory/decisions/0021-reapprovisionnement-multi-fournisseurs.md),
qui prolonge l'[ADR-0013](../../memory/decisions/0013-commandes-fournisseur.md)
(commandes fournisseur) et l'[ADR-0012](../../memory/decisions/0012-boutique-variantes-et-stock.md)
(variantes et stock), et tient compte de l'[ADR-0018](../../memory/decisions/0018-boutique-precommande.md)
(précommande).

**Goal :** chaque article sait chez qui il se commande, à quelle référence et à
quel prix. Un bouton « Réapprovisionner » calcule les besoins de tout le
catalogue et prépare un brouillon par fournisseur, que l'admin relit. L'envoi
transmet au fournisseur un bon de commande PDF par e-mail, et en garde la
preuve.

**Architecture :** une offre `ShopProductSupplier` (produit × fournisseur :
référence, prix d'achat, colisage), surchargée au besoin par déclinaison
(`ShopProductSupplierVariant`). Le fournisseur choisi est une colonne du produit,
tenue par une clé étrangère composite vers l'offre. Le plan de réapprovisionnement
est une fonction pure nourrie par les compteurs existants — `available`,
`onOrderByVariant`, `preorderedByVariant` — et par les quantités en brouillon.
La création des brouillons se fait en une transaction qui complète les
brouillons ouverts. L'envoi garde la transition `ORDERED` telle quelle, puis
envoie un PDF pdfkit par e-mail, tracé par `emailedAt`.

**Tech stack :** NestJS 11, Prisma 6 (`prisma db push`, cf.
[ADR-0003](../../memory/decisions/0003-prisma-db-push.md)), GraphQL code-first,
admin React + Vite + Apollo, pdfkit, Jest, Vitest.

---

## Garde-fous

- **[Garantie derrière un effet de bord](../../memory/pitfalls/garantie-derriere-effet-de-bord.md)** :
  l'e-mail au fournisseur part **après** le commit de la transition `ORDERED`,
  jamais dedans ; son échec se voit (`emailedAt` vide, « non transmise ») et se
  rattrape (« Renvoyer »).
- **[Une supposition qui survit à la décision](../../memory/pitfalls/une-supposition-survit-a-la-decision.md)** :
  la règle du besoin vit dans **une** fonction pure, appelée par l'aperçu ; la
  mutation de création revalide ligne à ligne au lieu de faire confiance à
  l'aperçu.
- **[Test qui vérifie la forme](../../memory/pitfalls/test-verifie-la-forme-pas-le-comportement.md)** :
  chaque invariant a un test dont on a vérifié qu'il **rougit** quand on retire
  la garantie (mutation à la main, notée dans la PR).
- **[Un double qui ignore — ou exige — une clause du `where`](../../memory/pitfalls/double-ignore-une-clause-du-where.md)** :
  les doubles Prisma sont écrits en face des requêtes, et l'on lit le **nombre**
  de tests rouges de chaque mutation.

Multi-tenant : `clubId` filtré dans chaque requête, y compris sur les relations
traversées ; une offre, une exception ou une ligne ne peut viser qu'un produit,
une déclinaison et un fournisseur du **même club**. L'application mobile admin
n'a pas d'écran d'achats : hors périmètre.

---

## Ordre des lots et dépendances

| Lot | Contenu | Dépend de | Valeur livrée seule |
|---|---|---|---|
| 1 | Fournisseurs d'un produit : offres, exceptions par déclinaison, fournisseur choisi, prix pré-rempli | — | catalogue fournisseur ; lignes de commande pré-remplies |
| 2 | Plan de réapprovisionnement et bouton « Réapprovisionner » : besoins, aperçu par fournisseur, brouillons répartis | 1 | les commandes multi-fournisseurs en un geste |
| 3 | Bon de commande PDF, envoi par e-mail, preuve et renvoi | 1 (références fournisseur) | la commande part réellement chez le fournisseur |

---

## Lot 1 — Fournisseurs d'un produit

### Task 1.1 : Schéma

- [x] `ShopProductSupplier` : `clubId`, `productId`, `supplierId`,
  `supplierRef String? @db.VarChar(80)`, `unitCostCents Int?` (vide = inconnu),
  `packSize Int @default(1)`, horodatages ; `@@unique([productId, supplierId])`,
  `@@index([clubId, supplierId])` ; relations `club` et `product` en `Cascade`,
  `supplier` en `Restrict`.
- [x] `ShopProductSupplierVariant` : `clubId`, `offerId`, `variantId`,
  `supplierRef?`, `unitCostCents?` ; `@@unique([offerId, variantId])`,
  `@@index([clubId, variantId])` ; `offer` et `variant` en `Cascade`.
- [x] `ShopProduct.preferredSupplierId String?` avec la relation composite
  `[id, preferredSupplierId]` → `ShopProductSupplier[productId, supplierId]`,
  `onDelete: NoAction`, et `@@unique([id, preferredSupplierId])` (validé par
  `prisma validate` le 2026-09-14).
- [x] Sur la **vraie base** (staging, après `db push`) : supprimer un produit qui
  porte un choix ; supprimer une déclinaison qui porte une exception ; retirer
  l'offre choisie doit être refusé par la base. Vérifié le 2026-09-14 : les
  trois tiennent sur PostgreSQL, clé composite présente en base.

### Task 1.2 : Service et GraphQL (admin)

- [x] `ShopProductSuppliersService` : `upsertOffer`, `removeOffer`,
  `setPreferredSupplier(productId, supplierId | null)`, `setVariantOverride`
  (les deux champs vides suppriment l'exception : pas de mutation de retrait
  à part), `productCountsBySupplier`.
- [x] **Invariants** : produit, fournisseur et déclinaison du même club ;
  déclinaison du **même produit** que l'offre ; fournisseur actif à la création
  d'une offre ; `packSize ≥ 1` ; prix `≥ 0` ou vide ; le premier fournisseur
  rattaché est choisi d'office ; retirer l'offre choisie quand d'autres restent
  est refusé (« choisissez d'abord un autre fournisseur ») ; retirer la dernière
  retire le choix dans la même transaction.
- [x] `ShopProductGraph` : `preferredSupplierId` et `suppliers` (offres avec leurs
  exceptions), à null au portail. Le nombre de produits par fournisseur passe
  par la requête `shopSupplierProductCounts` : un champ non nul sur
  `ShopSupplierGraph` aurait cassé les commandes, qui embarquent le fournisseur
  sans le calculer.
- [x] `addLine` (et `createOrder`) : sans prix saisi, prix de l'exception de la déclinaison, sinon
  de l'offre du fournisseur de la commande, sinon 0 comme aujourd'hui.
- [x] Tests (doubles fidèles, clause par clause, clé étrangère composite
  simulée) et mutations notées.

### Task 1.3 : Admin

- [x] Tiroir « Fournisseurs », ouvert depuis la carte produit comme les
  déclinaisons — chaque geste écrit aussitôt, sans formulaire global : offres
  (fournisseur, référence, prix HT, colisage), bouton « choisi », ajouter,
  modifier, retirer, « ne plus commander cet article automatiquement ».
- [x] Exceptions par déclinaison dans ce même tiroir, chez le fournisseur choisi
  ou un autre, valeur héritée de l'offre affichée en grisé. La matrice des
  déclinaisons ne change pas.
- [x] Carte produit : « Fournisseur : … », « Aucun fournisseur choisi » ou
  « Aucun fournisseur ». Onglet Fournisseurs : colonne « Produits ».
- [x] Vitest : référence et prix effectifs (exception > offre), validation d'une
  offre (prix vide = inconnu, jamais 0), plan des exceptions (seules les lignes
  modifiées, tout validé avant la première écriture).

### Task 1.4 : Recette staging

- [x] Produit à deux fournisseurs, exception de prix sur le XXL, choix déplacé,
  retrait de l'offre choisie refusé puis accepté après déplacement, suppression
  d'un produit portant un choix, ligne de commande manuelle pré-remplie au prix
  de l'exception. Fait le 2026-09-14 sur club-demo : refus traduits (retrait du
  fournisseur choisi, choix d'un fournisseur non rattaché), prix pré-remplis
  8,50, 9,90 et 7,00 euros, exceptions parties en cascade, portail à null.

---

## Lot 2 — Plan de réapprovisionnement et bouton « Réapprovisionner »

### Task 2.1 : Plan pur

- [ ] `apps/api/src/shop/restock-plan.ts` : entrées = déclinaisons (compteurs,
  seuil, cible, suivi, activité du produit), encours, précommandes, quantités en
  brouillon, offres avec exceptions, fournisseur choisi et son état.
- [ ] Règle de l'ADR-0021 §3 :
  `besoin = max(0, cible + précommandes − vendable − encours − brouillons)`,
  arrondi au multiple supérieur du colisage ; cible = `reorderTargetQty`, à
  défaut `reorderThreshold + 1`, à défaut 0 ; déclinaison retenue si sous son
  seuil **ou** porteuse de précommandes.
- [ ] Sortie : groupes par fournisseur choisi (lignes avec référence et prix
  effectifs, prix manquant signalé), groupes « Sans fournisseur » et
  « Fournisseur inactif », nombre d'articles déjà couverts.
- [ ] Tests unitaires de chaque terme de la règle, puis mutations.

### Task 2.2 : Service et GraphQL

- [ ] Query `shopRestockPlan` : lit les compteurs, appelle le plan.
- [ ] Mutation `createShopRestockOrders(lines: [{ variantId, supplierId, qty,
  unitCostCents? }])` : revalide chaque ligne (déclinaison du club, fournisseur
  rattaché au produit et actif, `qty ≥ 1`), regroupe par fournisseur et, en
  **une** transaction, réclame le brouillon ouvert (`claimDraft`) ou en crée un
  (`createWithReference`), crée les lignes ou augmente leur quantité ; renvoie
  les commandes touchées.
- [ ] Tests : une ligne invalide annule tout (aucun brouillon créé), un brouillon
  existant est complété sans seconde ligne, un fournisseur non rattaché est
  refusé ; mutations notées.

### Task 2.3 : Admin

- [ ] Onglet « À réapprovisionner » : bouton global « Réapprovisionner » → aperçu
  groupé par fournisseur (quantité modifiable, bascule vers un autre fournisseur
  du produit, prix manquant signalé, groupes « Sans fournisseur » et
  « Fournisseur inactif » avec lien vers la fiche produit) → « Créer les
  brouillons » → liens vers les commandes créées ou complétées.
- [ ] Liste : colonnes « En commande », « Précommandes », « Fournisseur choisi » ;
  l'entrée de stock hors commande devient une action secondaire.
- [ ] Vitest : regroupement et bascule de fournisseur côté client.

### Task 2.4 : Recette staging

- [ ] Catalogue de test à trois fournisseurs (dont un inactif) et un article sans
  fournisseur ; plan recoupé avec les compteurs en base ; brouillons créés ;
  relancer le réapprovisionnement ne double rien ; brouillon existant complété.

---

## Lot 3 — Bon de commande PDF et envoi par e-mail

### Task 3.1 : PDF

- [ ] `apps/api/src/pdf/shop-purchase-order-pdf.service.ts` (pdfkit, sur le
  modèle du bon de livraison) : club (nom, adresse, SIRET, contact), fournisseur
  et numéro client, référence, dates, lignes (référence fournisseur,
  désignation, quantité, prix HT, total), total HT, notes. Test sur le texte
  extrait.
- [ ] Route admin de téléchargement (JWT, club, rôle), sur le modèle du bon de
  livraison.

### Task 3.2 : Envoi

- [ ] `ShopPurchaseOrder.emailedAt DateTime?` et
  `emailedTo String? @db.VarChar(200)`.
- [ ] `TransactionalMailService.sendShopPurchaseOrder` : PDF en pièce jointe,
  réponses vers `Club.contactEmail`.
- [ ] `sendShopPurchaseOrder(orderId, mode: EMAIL | MARK_ONLY)` : transition
  `ORDERED` inchangée, **puis** e-mail hors transaction ; succès → `emailedAt` et
  `emailedTo` ; échec → la commande reste `ORDERED`, l'erreur remonte à l'écran.
  Mode `EMAIL` refusé pour un fournisseur sans adresse.
- [ ] `resendShopPurchaseOrderEmail(orderId)` : commandes `ORDERED` ou
  `PARTIALLY_RECEIVED` seulement.
- [ ] Tests : un e-mail en échec n'annule pas la transition et laisse
  `emailedAt` vide ; mutations notées.

### Task 3.3 : Admin

- [ ] Tiroir de commande : « Envoyer par e-mail » ou « Marquer comme envoyée »,
  « Télécharger le bon de commande », pastille « transmise le … » ou « non
  transmise » avec « Renvoyer ».

### Task 3.4 : Recette staging

- [ ] Fournisseur de test à l'adresse de Florent, **avec son accord avant tout
  envoi** : e-mail reçu, PDF relu ; « Marquer comme envoyée » sur un fournisseur
  sans e-mail ; renvoi.
