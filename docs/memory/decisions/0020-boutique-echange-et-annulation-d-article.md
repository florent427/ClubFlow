# ADR-0020 — Boutique : échanger ou annuler un article, c'est ajuster la commande à l'unité et ne faire bouger que la différence

## Statut

✅ **Accepté** — 2026-09-14
Réalise l'échange posé par l'[ADR-0017](0017-boutique-paiement-sortie-remise.md)
et l'annulation d'une ligne reportée par
l'[ADR-0019](0019-boutique-annulation-remboursement.md). S'appuie sur
l'[ADR-0011](0011-remboursement-eteint-la-creance.md) (le remboursement éteint
la créance) et l'[ADR-0018](0018-boutique-precommande.md) (précommande).

## Contexte

L'ADR-0017 posait l'échange ainsi : un avoir sur la ligne rendue, une nouvelle
ligne pour l'article choisi. La différence est remboursée si le nouvel article
est moins cher, facturée sinon. Le club a écarté le crédit à valoir.
L'ADR-0019 a livré l'annulation de la commande entière et reporté celle d'une
seule ligne à ce lot.

Quatre contraintes de l'existant pèsent sur la forme :

- une commande n'a qu'**une** facture (`Invoice.shopOrderId` est unique) ;
- le bon de livraison relit les lignes **vivantes** de la commande : modifier
  une ligne après la remise changerait ce que la signature atteste ;
- le paiement en ligne d'une facture calcule son solde **sans déduire les
  avoirs**. Sur une facture ouverte qui en porte un, il demanderait trop ;
- la comptabilité choisit le compte de vente boutique sur `shopOrderId` seul.

Florent a tranché le 2026-09-14 :

- la différence due passe par une **facture du reste à payer**, rattachée à la
  commande, réglable en ligne ou au club ; le nouvel article est remis tout de
  suite ;
- sur une commande déjà remise, l'échange est **signé** sur le téléphone de
  l'admin et produit un **bon d'échange** ; le bon de livraison reste tel qu'il
  a été signé ;
- un article s'annule **seul**, sans échange ;
- l'échange et l'annulation se font **à l'unité**.

## Décision

**Un ajustement retire des unités d'une ligne — et, pour un échange, ajoute une
ligne pour le nouvel article. L'argent ne suit que la différence entre ce qui
est retiré et ce qui est ajouté, jamais plus.**

### Modèle

- `ShopOrderLine.cancelledQty` : unités retirées de la ligne. La quantité
  active est `quantity − cancelledQty` ; la ligne elle-même n'est jamais
  réécrite.
- `ShopOrderAdjustment` : un ajustement par geste — annulation d'articles ou
  échange. Il fige ce qui a été rendu et pris (libellés, quantités, prix),
  la différence, le motif, l'auteur, et la signature d'un échange remis.
- `Invoice.shopAdjustmentId` : la facture du reste à payer d'un échange.
- `ShopOrder.deliveredLines` : les lignes remises, figées à la remise, que le
  bon de livraison imprime.

### Argent

| Différence (ajouté − retiré) | Ce qui se passe |
|---|---|
| positive | une facture du reste à payer, du montant de la différence |
| nulle | rien |
| négative | ce qui a été payé au-delà du nouveau montant de la commande est rendu ; le reste de la différence est éteint par un avoir |

- **Rendu** : par le moyen de chaque encaissement (ADR-0019), du plus récent
  au plus ancien, sur toutes les factures de la commande. Un chèque encore en
  portefeuille n'est rendu que s'il l'est en entier ; sinon la part est
  reversée par virement et le chèque reste à remettre.
- **Avoirs** : chaque remboursement émet l'avoir de son montant sur la facture
  de l'encaissement rendu. L'avoir d'extinction se porte sur les factures qui
  ont encore un reste dû, de la plus récente à la plus ancienne. Une facture
  du reste à payer sans aucun encaissement, entièrement éteinte, est annulée.
- **Facture soldée** : une facture ouverte qui porte des encaissements et dont
  le solde tombe à zéro passe payée. Si c'est la facture de la commande et que
  la commande était en attente, elle passe payée et sort du stock (ADR-0017).
- **Paiement en ligne** : le solde déduit les avoirs. L'adhérent règle depuis
  sa commande ce qui reste dû, facture de la commande ou du reste à payer.
- **Session de paiement** : une facture restée ouverte dont le reste dû baisse
  perd sa session Stripe, qui encaisserait encore l'ancien montant ;
  l'adhérent en rouvre une au bon montant. Un échéancier continue : le moteur
  plafonne chaque prélèvement au solde, avoirs déduits.
- **Commande sans facture** (antérieure à la facturation) : rien n'a été
  encaissé, donc rien n'est rendu ni éteint.
- **Comptabilité** : la facture du reste à payer est une vente boutique.

### Marchandise

- Les unités retirées sont prises d'abord sur celles **en attente d'arrivage**,
  qui n'ont rien réservé. Le reste est libéré (commande pas encore sortie) ou
  repris par un retour client, suivi d'une perte si l'admin le déclare.
- Le nouvel article est réservé. Il peut attendre l'arrivage si son produit
  est en précommande et que la commande n'est pas remise. Il sort du stock
  aussitôt si la commande est déjà sortie.
- Commande remise : l'adhérent doit rapporter les articles ; un échange exige
  sa signature, et le nouvel article doit être en stock pour être remis.

### Refus

- commande annulée ;
- dernier article de la commande : c'est l'annulation de la commande
  (ADR-0019) ;
- quantité invalide, article inactif, stock insuffisant ;
- prélèvement d'échéance en cours de dénouement ;
- encaissement à rendre par un moyen non remboursable (carte sans référence
  Stripe, chèque impayé).

### Atomicité

Une transaction porte l'ajustement, le stock, la nouvelle ligne, les chèques
et paiements négatifs, les avoirs, la facture du reste à payer et les factures
soldées ou annulées. Après le commit : contre-passations, remboursements carte,
attribution des précommandes, échéanciers et sessions de paiement.

L'annulation de la commande entière (ADR-0019) couvre désormais aussi les
factures du reste à payer.

## Conséquences

- ✅ Changer une taille ne rembourse pas puis ne réencaisse pas le même argent :
  seule la différence bouge.
- ✅ Ce que la signature d'une remise atteste ne change plus après coup.
- ✅ Le paiement en ligne ne demande plus un montant déjà éteint par un avoir —
  un défaut qui concernait déjà toute facture ouverte portant un avoir.
- ⚠️ Une commande peut porter plusieurs factures : celle de la commande et
  celles du reste à payer. Les écrans montrent le reste dû de la commande.
- ⚠️ L'application mobile n'affiche les unités annulées et le reste à payer
  qu'à sa prochaine publication ; d'ici là, l'adhérent règle depuis le portail
  ou au club.

## Alternatives écartées

- **Un avoir de la ligne entière et une facture de l'article entier** : le club
  rembourserait 25 € pour réencaisser 30 €, et chaque remboursement a un coût
  (frais de carte, chèque à rendre).
- **Modifier le montant de la facture de la commande** : une facture émise ne
  se réécrit pas ; et une facture déjà payée ne peut pas redevenir due.
- **Une nouvelle commande pour l'article pris en échange** : la vente se
  couperait en deux, sans lien avec l'article rendu ni avec sa signature.
- **Un crédit à valoir** : écarté par le club (ADR-0017).
