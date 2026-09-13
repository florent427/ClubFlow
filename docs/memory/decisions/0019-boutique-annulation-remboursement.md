# ADR-0019 — Boutique : annuler une commande, c'est reprendre la marchandise et rendre chaque règlement par son propre moyen

## Statut

✅ **Accepté** — 2026-09-13
Complète l'[ADR-0011](0011-remboursement-eteint-la-creance.md) (le remboursement
éteint la créance), l'[ADR-0015](0015-cheques-a-encaisser-5112.md) (chèques en
511200 jusqu'à la remise), l'[ADR-0017](0017-boutique-paiement-sortie-remise.md)
(règlement, sortie de stock et remise) et
l'[ADR-0018](0018-boutique-precommande.md) (précommande).

## Contexte

Jusqu'ici, l'admin ne pouvait annuler qu'une commande en attente et pas encore
remise. Une commande payée ne s'annulait pas : « aucun chemin de remboursement
n'existe côté boutique ».

L'existant côté paiements :

- le remboursement par carte passe par Stripe. Il est enregistré au retour du
  webhook : un paiement négatif et un avoir du montant rendu (ADR-0011) ;
- l'avoir manuel n'enregistre aucune sortie d'argent ;
- l'annulation d'une facture est refusée dès qu'un paiement existe ;
- rien ne rembourse des espèces, un virement ou un chèque, et aucun
  remboursement ne touche la commande ni le stock.

Deux défauts s'y ajoutent. L'annulation par le club laisse la facture ouverte.
L'annulation par l'adhérent annule la facture même quand un règlement partiel a
déjà été encaissé.

Florent a tranché le 2026-09-13 :

- une commande remise s'annule si l'adhérent rapporte l'article ;
- l'article rendu est remis en vente ou déclaré en perte, au choix de l'admin ;
- l'argent est rendu par le même moyen que le paiement ;
- ce lot annule la commande entière ; l'annulation d'une seule ligne viendra avec
  l'échange (lot 5).

## Décision

**Annuler une commande boutique, c'est reprendre la marchandise, rendre chaque
encaissement par son propre moyen, puis éteindre ce qui restait dû. L'admin fait
un seul geste. Un seul calcul, le plan d'annulation, lui est montré avant qu'il
confirme, puis exécuté tel quel.**

| Encaissement | Remboursement | Écritures |
|---|---|---|
| Carte | remboursement Stripe, après le commit | au retour du webhook, comme aujourd'hui : paiement négatif, avoir, contre-passation sur le transit Stripe |
| Espèces, virement | paiement négatif et avoir, dans la transaction | contre-passation sur le compte de l'encaissement d'origine (caisse, banque) |
| Chèque en portefeuille | chèque rendu à l'adhérent : statut CANCELLED, paiement négatif et avoir | contre-passation sur 511200 : le portefeuille reste exact (ADR-0015) |
| Chèque déjà remis | remboursé depuis la banque de sa remise : paiement négatif par virement, et avoir | contre-passation sur le compte bancaire de la remise, pas sur 511200 |

- **Reste dû jamais encaissé** : un avoir d'annulation l'éteint, sans écriture.
  La comptabilité est tenue à l'encaissement, et ce montant n'a jamais été
  constaté. Une facture sans aucun encaissement est simplement annulée (VOID).
- **Marchandise** :
  - réservée seulement : libérée ;
  - déjà sortie du stock (payée, ou remise) : elle revient par un mouvement
    RETURN (« Retour client »). Si l'admin la déclare abîmée, une perte
    (SHRINKAGE) suit, avec le motif ;
  - unités en attente d'arrivage : l'attente s'éteint, sans mouvement ;
  - commande remise : l'admin doit confirmer que l'adhérent a rapporté les
    articles.
- **Refus** :
  - commande déjà annulée ;
  - prélèvement d'échéance en cours de dénouement ;
  - chèque impayé ou déjà annulé ;
  - encaissement carte sans référence Stripe exploitable.
- **Atomicité** : une seule transaction porte :
  - l'annulation de la commande, par une écriture conditionnelle sur l'état lu
    pour le plan ;
  - le stock ;
  - les chèques rendus, par une écriture conditionnelle sur « en portefeuille,
    pas remis » ;
  - les paiements négatifs et leurs avoirs ;
  - l'avoir d'annulation, ou l'annulation de la facture.

  Après le commit viennent la contre-passation comptable, les remboursements
  carte, la clôture de l'échéancier, l'expiration de la session de paiement et
  l'attribution des précommandes (ADR-0018).
- **Remboursement carte refusé par Stripe** : l'annulation n'est pas défaite.
  L'échec est signalé à l'admin, qui relance le remboursement depuis la facture.
- **Adhérent** : il n'annule qu'une commande sans aucun encaissement. La garde
  est dans l'écriture conditionnelle, et la facture n'est jamais annulée si un
  paiement la porte.
- **Annulation simple** (`cancelShopOrder`, gardée pour l'application mobile
  d'administration) : réservée à une commande en attente sans aucun
  encaissement. Elle passe dans le module paiements pour fermer aussi la
  session de paiement et l'échéancier de la facture annulée.
- **Rapprochement bancaire** (ADR-0014) : la contre-passation d'un remboursement
  porte le compte financier d'où l'argent sort, puis cherche la ligne de relevé
  déjà importée. Sans ce compte, elle n'est candidate à aucune ligne : le
  virement de remboursement resterait orphelin, puis serait catégorisé en
  dépense une seconde fois.

## Conséquences

- ✅ Le stock et les comptes restent justes à chaque annulation, quel que soit
  le moyen de paiement.
- ✅ Le solde de 511200 reste la valeur exacte des chèques en portefeuille.
- ✅ L'annulation par le club et celle par l'adhérent traitent enfin la facture
  de la même façon.
- ✅ Un remboursement se rapproche du relevé comme n'importe quelle écriture.
- ⚠️ Un remboursement carte refusé par Stripe laisse une commande annulée et un
  encaissement à rembourser à la main depuis la facture : c'est dit à l'écran.
- ⚠️ La facture garde son statut, payée ou ouverte, avec un solde à zéro :
  comme pour tout remboursement (ADR-0011), ce sont les avoirs qui portent
  l'annulation.
- ⚠️ Pas d'annulation d'une seule ligne : elle viendra avec l'échange (lot 5).

## Alternatives écartées

- **Rembourser la carte avant le commit** : un échec de la transaction
  laisserait de l'argent rendu sur une commande toujours payée, stock compris.
  Dans l'autre sens, l'échec est visible et se rattrape depuis la facture.
- **Un avoir sans sortie d'argent pour les espèces et les chèques** : la
  comptabilité dirait « remboursé » sans que la caisse ni la banque ne bougent,
  et un chèque rendu resterait dans le portefeuille à remettre.
- **Contre-passer aussi le reste dû** : ce serait inventer une sortie de
  trésorerie qui n'a jamais eu lieu, et le rapprochement bancaire porterait un
  écart permanent.
- **Autoriser l'annulation d'une commande remise sans les articles** : écarté
  par Florent. Le club ne rembourse que ce qu'il récupère.
