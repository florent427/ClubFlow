# ADR-0018 — Boutique : un article épuisé reste commandable, et chaque arrivage sert d'abord les précommandes

## Statut

✅ **Accepté** — 2026-09-13
Complète l'[ADR-0012](0012-boutique-variantes-et-stock.md) (variantes et stock),
l'[ADR-0013](0013-commandes-fournisseur.md) (commandes fournisseur) et
l'[ADR-0017](0017-boutique-paiement-sortie-remise.md) (règlement, sortie de
stock et remise).

## Contexte

Le club veut laisser commander un article épuisé, produit par produit, avec un
délai indicatif. Trois cas coexistent donc : en stock, épuisé et non
commandable, épuisé mais commandable.

Deux contraintes de l'existant :

- la garantie anti-survente de l'ADR-0012 repose sur le prédicat
  `available: { gte: qty }`. `available` ne descend jamais sous zéro, et
  l'inventaire physique doit continuer de tomber juste ;
- la marchandise sort du stock à la première de deux actions, le règlement ou
  la remise (ADR-0017). Une commande peut donc être payée avant que l'article
  soit arrivé.

Le code emploie déjà « BACKORDER » pour le reliquat d'une commande fournisseur,
et `onOrder` pour les quantités commandées au fournisseur. Le mot retenu ici est
**précommande**.

## Décision

**Un produit peut rester commandable une fois épuisé. La commande réserve ce qui
reste et note le manque sur sa ligne. Chaque arrivage sert ensuite les lignes en
attente, de la plus ancienne commande à la plus récente. `available` ne devient
jamais négatif.**

| Élément | Porté par |
|---|---|
| Réglage du produit | `ShopProduct.preorderEnabled`, `preorderLeadTime` (texte libre, 80 caractères) |
| Manque d'une ligne | `ShopOrderLine.awaitingStockQty` |
| Disponibilité montrée à l'adhérent | `availability` : `IN_STOCK`, `PREORDER`, `SOLD_OUT`, calculée par une seule fonction (`availabilityOf`) |
| Unités précommandées, pour le trésorier | `preorderedQty`, dérivé, réservé à l'administration |

- **Passage de commande** : sur un produit en précommande, `reserveUpTo` réserve
  au plus la quantité demandée et renvoie ce qu'il a pris. Il écrit sous le même
  prédicat conditionnel que `reserve`. Le reste va dans `awaitingStockQty`, dans
  la même transaction. La facture couvre la commande entière, comme toute
  commande.
- **Règlement** : seules les unités réservées sortent du stock
  (`quantity − awaitingStockQty`).
- **Arrivage** : réception fournisseur, entrée de stock, correction
  d'inventaire, passage en stock illimité, ou annulation d'une autre commande.
  `ShopPreorderService.allocate` sert les lignes en attente, la première
  commande passée d'abord. Il réserve les unités. Si la commande est déjà
  sortie du stock (payée, ou `fulfilledAt` posé), il les fait sortir aussi.
- **Remise** : refusée tant qu'un article attend l'arrivage. Une remise partielle
  ferait signer un bon de livraison qui ne dit pas ce qui reste dû.
- **Annulation** : seules les unités réservées reviennent au stock, et l'attente
  est remise à zéro. Le stock ainsi rendu sert d'abord les autres précommandes.
- **Confidentialité** : l'adhérent voit « sur commande » et le délai, jamais une
  quantité ; `preorderedQty` rejoint les champs interdits hors administration.
  Sur sa propre commande, il voit combien d'unités de chaque ligne attendent.

### L'attribution a sa propre transaction, ouverte après l'événement

L'attribution verrouille les **commandes** servies avant de toucher au stock :
commande, puis déclinaison. C'est l'ordre du règlement, de l'annulation et de la
remise. Sans ce verrou, un paiement simultané ferait sortir du stock les seules
unités réservées, sans voir celles que l'attribution est en train de servir.
L'attribution, de son côté, les servirait sans les faire sortir : elles
resteraient comptées dans le placard.

Une réception tient déjà le verrou de la déclinaison. Prendre ensuite celui des
commandes dans la même transaction inverserait l'ordre, et un paiement
simultané pourrait interbloquer les deux. L'attribution est donc appelée
**après le commit** de l'événement, dans sa propre transaction. Elle ne remonte
jamais d'erreur à l'appelant, dont l'événement est déjà enregistré. Une
attribution manquée est journalisée, puis rattrapée par le balayage quotidien
de 7 h, avant l'évaluation des seuils. Deux causes possibles : un serveur arrêté
entre les deux transactions, ou un interblocage refusé par PostgreSQL.

## Conséquences

- ✅ La garantie anti-survente est intacte : `reserveUpTo` écrit sous le même
  prédicat que `reserve`. Un produit sans précommande garde exactement le
  comportement d'avant.
- ✅ L'adhérent sait ce qu'il peut retirer au club et ce qui arrivera plus tard.
  Le trésorier sait combien recommander.
- ⚠️ Entre le commit d'un arrivage et son attribution, quelques millisecondes
  passent. Un nouvel acheteur peut y prendre une unité avant une précommande
  plus ancienne. Aucune garantie de stock n'en dépend.
- ⚠️ Pas de remise partielle : une commande dont un article attend ne se remet
  pas. Pour remettre tout de suite l'article en stock, le club le vend sur une
  commande séparée.
- ⚠️ Le délai est une annonce, pas une échéance. Rien ne prévient l'adhérent de
  l'arrivage : il voit sa commande passer d'« en attente d'arrivage » à
  « à retirer ».
- ⚠️ L'application mobile publiée avant ce lot montre un article en précommande
  comme épuisé et ne permet pas de le commander. Le portail le permet dès le
  déploiement.

## Alternatives écartées

- **`available` négatif**, le manque devenant une dette de stock : plus simple,
  sans attribution. Mais le prédicat anti-survente et l'inventaire physique de
  l'ADR-0012 cessaient d'être vrais, et plus rien ne disait quelle commande
  était servie.
- **Attribution dans la transaction de réception** : atomique, mais elle inverse
  l'ordre des verrous face au règlement (voir plus haut).
- **Attribution manuelle par le trésorier** : un geste de plus à chaque
  arrivage, facile à oublier. Une précommande resterait en attente alors que
  l'article est dans le placard.
