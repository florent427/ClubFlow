# Piège — un article vendu avant le suivi du stock reste en vente

## Symptôme

Dans la matrice des déclinaisons, « Vendable » dépasse « Stock compté » — ce
qui ne devrait jamais arriver, le vendable étant le stock compté moins les
réservations.

Constaté en prod le 2026-09-13 chez SKSR, produit « Adidas Evolution »,
taille 120/130 : stock compté 3, vendable 4. La boutique pouvait vendre un
article qui n'existait pas.

## Cause

Le moteur de stock ([ADR-0012](../decisions/0012-boutique-variantes-et-stock.md))
suppose qu'une commande en attente a RÉSERVÉ ses unités : son règlement ne
retire que le stock compté (`fulfill`), le vendable ayant baissé à la
réservation.

Or une commande passée sur une déclinaison NON SUIVIE ne réserve rien — le
stock est illimité. La séquence en prod :

1. la matrice est engendrée sans suivi (héritée d'un produit illimité) ;
2. une taille est vendue au comptoir : rien n'est réservé ;
3. le stock est compté dans la matrice (« Suivre le stock » coché, 4) :
   compté 4, vendable 4, la vente en attente n'est pas déduite ;
4. la vente est réglée : le compté passe à 3, le vendable reste à 4.

C'est une supposition qui survit à un changement d'état : juste tant que le
suivi ne change pas, fausse dès qu'il reprend
(cf. [une supposition survit à la décision](une-supposition-survit-a-la-decision.md)).

## Solution

Version 0.62.1. À la reprise du suivi d'une déclinaison — case « Suivre le
stock » de la matrice, ou stock saisi sur la fiche d'un produit illimité :

- `ShopStockService.resumeTracking` efface l'écart des compteurs
  (`available = onHand`), qui ne désigne plus aucune réservation réelle, et
  l'archive au journal ;
- `ShopPreorderService.resumeTrackingInTx` remet en attente d'arrivage
  toutes les unités des commandes en attente pas encore sorties, en
  verrouillant ces commandes avant la déclinaison ;
- l'attribution ([ADR-0018](../decisions/0018-boutique-precommande.md)) les
  sert ensuite sur le stock compté, avant tout nouvel acheteur.

La donnée de prod a été corrigée le même jour par un mouvement d'ajustement
(compté 0, vendable −1) rattaché à la commande en cause.

## Détection

```sql
-- Vendable supérieur au stock compté : toujours une anomalie.
select c.slug, p.name, v.label, v."onHand", v.available
from "ShopProductVariant" v
join "ShopProduct" p on p.id = v."productId"
join "Club" c on c.id = p."clubId"
where v."trackStock" and v.available > v."onHand";
```

Plus large : l'écart `onHand − available` d'une déclinaison suivie doit égaler
les unités réservées par ses commandes en attente pas encore sorties
(`quantity − awaitingStockQty`).

## Lié

- [ADR-0012](../decisions/0012-boutique-variantes-et-stock.md) — le moteur de stock
- [ADR-0018](../decisions/0018-boutique-precommande.md) — l'attente d'arrivage et son attribution
