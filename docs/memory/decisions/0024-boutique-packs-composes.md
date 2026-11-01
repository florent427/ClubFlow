# ADR-0024 — Boutique : packs composés de pièces stockées

## Statut

✅ **Accepté** — 2026-11-01
Prolonge [ADR-0012](0012-boutique-variantes-et-stock.md) (variantes et stock) ;
tient compte de l'[ADR-0018](0018-boutique-precommande.md) (précommande) et de
l'[ADR-0013](0013-commandes-fournisseur.md) (commandes fournisseur).

## Contexte

Le club vend des protections kamikaze de quatre façons : les gants seuls, les
protège-pieds/tibias seuls, un pack « pieds-poings » d'une couleur, et un pack
complet en deux couleurs. Le pack et ses pièces sont les **mêmes objets
physiques** dans le placard.

La boutique ne connaissait que des déclinaisons stockées chacune pour soi. Un
pack créé comme article ordinaire avait donc son propre stock, sans lien avec
celui des gants : vendre un pack ne faisait pas baisser les gants, et vendre des
gants n'empêchait pas de vendre un pack dont les gants n'existaient plus.

## Décisions

### 1. Un pack est une DÉCLINAISON, vendue mais jamais stockée

`ShopProductVariant.isBundle = true`. Le pack garde tout ce qu'a une
déclinaison — prix, référence, mise en vente, matrice de tailles et couleurs —
et on le vend par le même panier, la même commande, la même facture.

Ses compteurs propres restent à **zéro** et `trackStock` à **faux**. Rien ne s'y
écrit jamais : ni réception, ni inventaire, ni perte, ni commande fournisseur
(un pack se commande par ses pièces).

### 2. La composition au catalogue : `ShopBundleComponent`

Une ligne par pièce : `(bundleVariantId, componentVariantId, quantity)`,
`@@unique([bundleVariantId, componentVariantId])`. Une pièce est une
déclinaison :

- d'un **autre** article ;
- qui n'est **pas un pack** (pas de pack dans un pack) ;
- dont le stock est **suivi**. Une pièce illimitée rendrait le pack illimité
  sans que rien ne le montre ; on ne peut donc pas non plus cesser de suivre
  le stock d'une déclinaison tant qu'un pack la contient.

Une déclinaison ne devient pack qu'avec un stock propre à **zéro** (ou non
suivi), et sans précommande qui l'attend : ce qui resterait dans ses compteurs
disparaîtrait des comptes sans mouvement. La conversion est un `updateMany`
conditionnel sur cet état, pas une lecture puis une écriture.

Dissoudre le pack (composition vide) le rend **stocké à zéro**, jamais
illimité : un pack dissous se vendrait sinon sans fin.

### 3. Vendre un pack réserve ses pièces, dans la même transaction

Le moteur de stock (ADR-0012) reste le seul à écrire. `reserve` tente d'abord
la déclinaison elle-même ; c'est seulement quand cette écriture conditionnelle
ne touche **aucune ligne** qu'il regarde si c'est un pack. Les chemins d'avant
sont donc inchangés pour tout ce qui n'est pas un pack.

Pour un pack, chaque pièce est réservée par le même `updateMany` conditionnel
(`available >= quantité × qté par pack`). Si une seule pièce manque, la
transaction échoue : **un pack ne se vend jamais amputé**.

La clause `isBundle: false` est ajoutée au chemin « stock non suivi ». Sans
elle, un pack (`trackStock = false`) passerait pour un article illimité. C'est
la clause qui porte la garantie ; un test de mutation la vérifie.

### 4. La composition est FIGÉE sur la ligne de commande

`ShopOrderLineComponent (orderLineId, variantId, unitQty)` est écrit à la
réservation. Libération, sortie de stock, retour, perte et listes de
précommandes à servir lisent **ce snapshot**, jamais le catalogue.

Le club peut ainsi changer la composition d'un pack à tout moment : une
commande passée la veille rend exactement les pièces qu'elle a prises.

### 5. Verrous dans un ordre unique

Une commande qui contient un pack verrouille d'abord, par des écritures sans
effet, toutes les déclinaisons stockées qu'elle touche — pièces dépliées
comprises — **dans l'ordre croissant de leur identifiant**. Deux commandes
« pack + gants seuls » et « gants seuls + pack » ne peuvent donc plus se
bloquer mutuellement.

### 6. Le stock d'un pack est DÉRIVÉ pour l'affichage

`bundleCounters` : le minimum, sur les pièces, de `floor(available / quantité)`.
Une pièce retirée de la vente bloque le pack ; un pack sans pièce compte pour
épuisé. Ce chiffre n'est qu'un affichage : la garantie reste la réservation
conditionnelle de chaque pièce. Le portail n'en reçoit, comme pour tout
article, que la disponibilité (en stock, épuisé) et la liste de ce que le pack
contient.

### 7. Un pack ne se précommande pas

L'attente d'arrivage (ADR-0018) se compte par déclinaison stockée. Un produit
qui contient un pack refuse la précommande ; on l'active sur les pièces.

## Alternatives écartées

- **Un stock propre au pack, assemblé à l'avance** (« kits montés ») : c'est
  le modèle d'un entrepôt qui emballe des kits. Au club, les gants d'un pack
  sont aussi vendus seuls ; deux stocks pour les mêmes objets divergent à la
  première vente.
- **Un article « pack » réduit à une remise au panier** (gants + pieds au
  panier = −10 €) : ne permet ni d'afficher le pack au catalogue à son prix,
  ni de le vendre au comptoir en une ligne, ni d'imposer les couleurs.
- **Lire la composition au catalogue à la libération** : une composition
  modifiée entre la commande et son annulation rendrait au placard d'autres
  pièces que celles qui en sont sorties.

## Conséquences

- Écran admin : bouton « Faire un pack » / « Composition du pack » sur chaque
  produit ; la matrice des déclinaisons n'envoie ni suivi, ni seuil, ni
  inventaire pour une ligne pack.
- Portail : « Contient : 1 × Gants — Rouge, … » sous le prix.
- L'application mobile n'affiche pas encore le contenu d'un pack ; la vente y
  fonctionne déjà (disponibilité dérivée côté API).
- La valeur du stock et la liste « À réapprovisionner » ignorent les packs :
  elles se comptent sur les pièces.

## Lié

- [ADR-0012](0012-boutique-variantes-et-stock.md) — variantes et stock
- [ADR-0013](0013-commandes-fournisseur.md) — commandes fournisseur
- [ADR-0018](0018-boutique-precommande.md) — précommande
- [garantie-derriere-effet-de-bord.md](../pitfalls/garantie-derriere-effet-de-bord.md)
- [double-ignore-une-clause-du-where.md](../pitfalls/double-ignore-une-clause-du-where.md)
