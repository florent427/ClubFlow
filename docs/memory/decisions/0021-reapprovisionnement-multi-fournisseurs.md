# ADR-0021 — Réapprovisionnement multi-fournisseurs : fournisseurs d'un produit et commandes réparties

## Statut

✅ **Accepté** — 2026-09-14
Prolonge [ADR-0013](0013-commandes-fournisseur.md) (commandes fournisseur) et
[ADR-0012](0012-boutique-variantes-et-stock.md) (variantes et stock) ; tient
compte de l'[ADR-0018](0018-boutique-precommande.md) (précommande).

## Contexte

L'ADR-0013 a donné au club des fournisseurs et des commandes fournisseur, mais
**aucun lien entre un article et ses fournisseurs**. Constaté le 2026-09-14 :

- une commande se monte à la main : choisir un fournisseur, puis ajouter les
  lignes une à une, en retapant le prix d'achat à chaque ligne ;
- l'onglet « À réapprovisionner » ne commande rien : son bouton enregistre une
  **entrée de stock directe**. La conséquence annoncée par l'ADR-0013 — « l'onglet
  engendre une commande pré-remplie » — n'a jamais été câblée ;
- la liste ignore l'encours (`onOrder`), donc on peut commander deux fois, et
  les unités promises en précommande ;
- « Envoyer au fournisseur » passe la commande à `ORDERED`, et c'est tout : rien
  ne part chez le fournisseur.

Le besoin, exprimé par Florent : les commandes se font **par fournisseur** ; un
produit peut avoir plusieurs fournisseurs, dont **un choisi** ; un bouton global
« Réapprovisionner » lance le processus et **répartit automatiquement** les
besoins entre les fournisseurs.

## Décisions

### 1. Le lien vit sur le PRODUIT, avec des exceptions par déclinaison

`ShopProductSupplier` est une **offre** : un produit chez un fournisseur, avec la
référence du fournisseur, le prix d'achat HT habituel et le colisage.
`@@unique([productId, supplierId])`.

Un t-shirt vient du même fournisseur dans toutes ses tailles : rattacher chaque
déclinaison demanderait 24 saisies pour 8 tailles × 3 couleurs. Mais la
référence change souvent par taille, et le XXL coûte plus cher :
`ShopProductSupplierVariant` **surcharge** la référence et/ou le prix d'une
déclinaison pour une offre. Un champ vide hérite de l'offre.

Le prix d'achat est **nullable** : vide se lit « inconnu ». Pas de défaut à 0 :
sur une ligne de commande, 0 tire le coût moyen pondéré vers le bas
(ADR-0013). L'aperçu signale donc les lignes sans prix au lieu de les remplir à
zéro. Le prix de l'offre pré-remplit les lignes ; il ne touche jamais le coût
moyen, qui ne bouge qu'à la réception.

### 2. UN fournisseur choisi par produit, garanti par la base

Le choix est une colonne du produit, `ShopProduct.preferredSupplierId`, et non
un booléen sur l'offre.

Un booléen « choisi » ne peut pas être rendu unique par produit sous
`prisma db push` : il faudrait un index partiel, que Prisma n'exprime pas
([ADR-0003](0003-prisma-db-push.md)). Deux offres pourraient alors être
« choisies » à la fois, et la répartition deviendrait arbitraire. Une colonne
sur le produit est unique par construction.

Une clé étrangère **composite** `[id, preferredSupplierId]` →
`ShopProductSupplier[productId, supplierId]` (`onDelete: NoAction`) fait tenir
par la base que le fournisseur choisi est bien rattaché au produit : retirer
l'offre choisie échoue tant que le choix n'a pas été déplacé. Le schéma est
validé par `prisma validate` (2026-09-14) ; la suppression physique d'un produit
qui porte un choix (`ShopService`) se vérifie sur la vraie base au lot 1.

Le premier fournisseur rattaché à un produit est choisi d'office. Retirer
l'offre choisie alors qu'il en reste d'autres est refusé avec un message qui
demande d'en choisir une autre ; retirer la dernière retire le choix dans la
même transaction.

### 3. Le besoin d'une déclinaison

```
besoin = max(0, cible + précommandes − vendable − encours − brouillons)
         arrondi au multiple supérieur du colisage
```

- **cible** : `reorderTargetQty`, à défaut `reorderThreshold + 1` (la règle
  actuelle de l'onglet), à défaut 0 ;
- **précommandes** : unités promises en attente d'arrivage
  (`ShopPreorderService.preorderedByVariant`) ;
- **encours** : `ShopPurchaseOrdersService.onOrderByVariant` — commandes
  `ORDERED` ou `PARTIALLY_RECEIVED`, lignes ouvertes ;
- **brouillons** : quantités déjà portées par un brouillon, chez n'importe quel
  fournisseur. Un brouillon ne compte pas dans l'encours (ADR-0013 §4) ; sans
  cette déduction, relancer le réapprovisionnement doublerait un brouillon pas
  encore envoyé.

Une déclinaison entre dans le calcul si elle est suivie, active, d'un produit
actif, **et** sous son seuil (`available ≤ reorderThreshold`) **ou** porteuse de
précommandes. Une déclinaison non suivie (stock illimité) n'en a jamais besoin.

Le calcul est une **fonction pure** : toutes ces règles se testent sans base.

### 4. « Réapprovisionner » : un aperçu, puis un brouillon par fournisseur

Le bouton calcule le plan et l'affiche **regroupé par fournisseur choisi**. Ligne
à ligne, l'admin corrige la quantité (0 = ne pas commander) ou bascule vers un
autre fournisseur rattaché au produit, dont la référence, le prix et le colisage
suivent. Deux groupes à part ne sont jamais commandés : **« Sans fournisseur »**
et **« Fournisseur inactif »**.

Valider crée, en **une** transaction, un brouillon par fournisseur — ou
**complète** le brouillon déjà ouvert chez ce fournisseur : la ligne existante
voit sa quantité augmenter, puisque `@@unique([orderId, variantId])` interdit une
seconde ligne. Rien n'est envoyé : l'admin relit, puis envoie chaque commande.

Le serveur **revalide** chaque ligne proposée : déclinaison du club, fournisseur
rattaché au produit et actif, quantité positive. L'aperçu est une proposition,
jamais une autorité ; une ligne invalide annule toute la transaction, sans
brouillon à moitié créé.

Deux admins lançant le réapprovisionnement au même instant peuvent créer deux
brouillons chez un même fournisseur. C'est **accepté** : un brouillon n'entre pas
dans l'encours et reste visible, et le verrou qui l'empêcherait (index partiel)
n'est pas exprimable sous `db push`.

### 5. L'envoi : un bon de commande PDF par e-mail, et sa preuve

« Envoyer » produit un **bon de commande PDF** — coordonnées du club (nom,
adresse, SIRET, contact), fournisseur et numéro client, référence `CF-…`,
lignes avec la référence fournisseur, quantités, prix HT et total, arrivée
attendue — et l'envoie à l'adresse de la fiche fournisseur, réponses dirigées
vers le contact du club.

L'ordre est délibéré : la commande passe `ORDERED` dans sa transaction, **puis**
l'e-mail part. Un e-mail en échec ne doit ni annuler l'encours, ni passer
inaperçu ([garantie derrière un effet de bord](../pitfalls/garantie-derriere-effet-de-bord.md)) :
`emailedAt` et `emailedTo` tracent l'envoi réussi, l'écran affiche « non
transmise » tant qu'ils sont vides et propose « Renvoyer le bon de commande ».

Pour un fournisseur sans e-mail (commande par téléphone ou sur son portail),
« Marquer comme envoyée » garde la transition seule, et le PDF reste
téléchargeable.

### 6. L'onglet « À réapprovisionner » devient l'aperçu

Le bouton de ligne qui enregistrait une entrée de stock directe quitte la liste
principale : c'était un raccourci qui contournait les commandes, donc
l'encours. L'entrée hors commande reste possible (achat en magasin réglé
comptant) comme action secondaire ; `restockShopVariant` ne change pas.

## Alternatives écartées

**Rattacher chaque déclinaison.** Précis, mais la saisie croît avec la matrice
des déclinaisons, et un changement de fournisseur se refait 24 fois.

**Un lien produit sans exception.** Faux dès que le XXL coûte plus cher ou que
la référence change avec la taille.

**Un booléen `preferred` sur l'offre.** Rien ne l'empêcherait d'être vrai sur
deux offres à la fois (§2).

**Envoyer sans brouillon.** Un plan calculé se relit avant de partir chez un
fournisseur : une cible mal saisie commanderait 200 t-shirts.

**Ignorer les brouillons dans le besoin.** Relancer le réapprovisionnement
doublerait les quantités d'un brouillon pas encore envoyé.

**Envoyer l'e-mail avant la transition.** Une écriture en échec après l'envoi
laisserait chez le fournisseur une commande que ClubFlow croit encore brouillon
— donc renvoyable une seconde fois.

## Conséquences

- Plan d'implémentation :
  [2026-09-14-reapprovisionnement-multi-fournisseurs](../../superpowers/plans/2026-09-14-reapprovisionnement-multi-fournisseurs.md).
- Une ligne ajoutée à la main à une commande prend par défaut le prix de
  l'exception de la déclinaison, sinon celui de l'offre du fournisseur de la
  commande, quand l'admin n'en saisit pas.
- L'alerte quotidienne des seuils (ADR-0012 §7) ne change pas.
- L'application mobile admin n'a pas d'écran d'achats : hors périmètre.

## Lié

- [ADR-0012](0012-boutique-variantes-et-stock.md) — variantes et stock
- [ADR-0013](0013-commandes-fournisseur.md) — commandes fournisseur
- [ADR-0018](0018-boutique-precommande.md) — précommande
- [garantie-derriere-effet-de-bord.md](../pitfalls/garantie-derriere-effet-de-bord.md)
- [une-supposition-survit-a-la-decision.md](../pitfalls/une-supposition-survit-a-la-decision.md)
- [double-ignore-une-clause-du-where.md](../pitfalls/double-ignore-une-clause-du-where.md)
