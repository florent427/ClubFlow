# ADR-0017 — Boutique : règlement, sortie de stock et remise sont trois faits distincts

## Statut

✅ **Accepté** — 2026-09-13
Complète l'[ADR-0012](0012-boutique-variantes-et-stock.md) (variantes et stock)
et l'[ADR-0011](0011-remboursement-eteint-la-creance.md) (le remboursement éteint
la créance).

## Contexte

Une commande boutique confondait jusqu'ici trois événements : le règlement, la
sortie de la marchandise du stock et sa remise à l'adhérent. `ShopOrderStatus`
ne connaît que `PENDING`, `PAID` et `CANCELLED`, et la sortie de stock
(`FULFILL`) est accrochée au passage en `PAID`.

Cela tenait tant que tout article vendu était en stock et payé avant d'être
emporté. Quatre besoins du club le cassent :

- **remettre un article avant qu'il soit payé** — le paiement peut être
  différé, en ligne ou sur place, comme pour une adhésion ;
- **vendre un article épuisé**, commandé au fournisseur, avec un délai
  indicatif ;
- **prouver la remise** par la signature de l'adhérent sur le téléphone de
  l'admin, au moment du retrait physique ;
- **annuler, rembourser ou échanger** une commande déjà payée — aujourd'hui
  refusé, « aucun chemin de remboursement n'existe côté boutique ».

## Décision

**Le règlement, la sortie de stock et la remise sont trois faits portés
séparément par la commande. La marchandise sort du stock à la première des deux
actions — règlement complet ou remise signée —, dès qu'elle est physiquement
disponible.**

| Fait | Porté par | Déclenché par |
|---|---|---|
| Règlement | `status` `PENDING` → `PAID` (inchangé) | la facture soldée : carte, encaissement manuel, comptoir |
| Sortie de stock | `fulfilledAt` + mouvements `FULFILL` | la **première** de : facture soldée, remise signée — si la marchandise est réservée |
| Remise | `deliveredAt`, signataire, bon de livraison PDF | la signature de l'adhérent |

- **Une seule fonction décide de la sortie**, appelée par tous les chemins —
  webhook carte, encaissement manuel, remise signée. Elle est idempotente :
  conditionnée à `fulfilledAt IS NULL` et arbitrée par la base (écriture
  conditionnelle), exactement comme l'est aujourd'hui `PENDING` → `PAID`. Le
  second des deux gestes ne décompte rien.
- **Le statut attendu dépend du geste.** Au règlement, la commande vient de
  passer payée dans la même transaction ; à la remise, seule une commande
  encore en attente sort. Une commande payée est sortie à son paiement — y
  compris celles payées avant l'existence de `fulfilledAt`, qui l'ont NULL.
  « Sortie » se lit `status = PAID OR fulfilledAt IS NOT NULL` : aucun
  rattrapage des commandes existantes n'est nécessaire.
- **Commande sur rupture.** Un produit peut être déclaré « commandable en
  rupture », avec un délai indicatif en texte libre. La quantité commandée sans
  stock est mise *en attente d'arrivage* sur la ligne : elle ne réserve rien. La
  facture est émise à la commande ; le règlement suit comme pour les adhésions,
  en ligne ou sur place.
- **Arrivage.** À la réception d'une commande fournisseur, les unités entrées
  sont d'abord affectées aux lignes en attente, **par ordre d'ancienneté**, avant
  de redevenir vendables. Une ligne affectée dont la commande est déjà réglée
  sort aussitôt du stock : le règlement, première des deux actions, a déjà eu
  lieu.
- **Remise.** Refusée tant qu'une ligne attend son arrivage. Signée dans l'admin
  web ouverte sur le téléphone. La date, l'admin, le signataire et sa signature
  sont figés par la même écriture conditionnelle que la remise ; le bon de
  livraison PDF se reproduit à la demande à partir d'eux, comme une facture, et
  porte la date d'acceptation des conditions générales de vente. Sur une vente
  au comptoir sans acceptation préalable, la signature porte cette acceptation.
  Une commande remise ne s'annule plus : la marchandise est partie.
- **Annulation d'une commande payée.** Suit l'ADR-0011 : le remboursement éteint
  la créance par un avoir du montant rendu. Carte : remboursement Stripe. Chèque
  encore en portefeuille : le chèque est rendu. Chèque remis en banque ou
  espèces : remboursement enregistré à la main. Une marchandise sortie puis
  rapportée rentre en stock par un mouvement dédié.
- **Échange.** Avoir sur la ligne rendue, nouvelle ligne pour l'article choisi.
  La différence est remboursée si le nouvel article est moins cher, facturée
  sinon.

## Options écartées

**Sortir le stock au seul règlement (comportement antérieur).** Une remise avant
paiement laisserait la marchandise comptée présente alors qu'elle est partie ; et
une commande sur rupture réglée n'aurait aucun stock à sortir.

**Sortir le stock à la seule remise.** Un article vendu et réglé mais pas encore
retiré resterait compté — inventorié, valorisé — dans le stock du club, alors
qu'il appartient déjà à l'adhérent.

**Un statut unique enrichi (`PENDING`, `PAID`, `DELIVERED`…).** Le paiement
différé rend l'ordre des faits variable : une commande peut être remise puis
payée, ou payée puis remise. Un seul statut ne porte pas deux axes indépendants
sans combinaisons impossibles.

**Laisser le stock vendable devenir négatif pour les ruptures.** Mélange ce qui
est vendable et ce qui est promis ; l'affectation à l'arrivage et la file
d'ancienneté deviendraient illisibles.

**Un crédit à valoir sur un échange.** Introduirait un solde client qui n'existe
nulle part dans ClubFlow. Écarté par le club : la différence est remboursée.

## Conséquences

### Positives

- Une remise avant paiement et une commande sur rupture restent exactes en stock.
- La remise est prouvée, signée, archivée.
- Annulation, remboursement et échange réutilisent l'avoir et le remboursement
  existants : aucune seconde mécanique comptable.

### Négatives

- Une commande payée avant cet ADR garde `fulfilledAt` à NULL : « sortie » se
  lit `status = PAID OR fulfilledAt IS NOT NULL`, jamais `fulfilledAt` seul.
- La réception fournisseur gagne une étape : l'affectation aux lignes en attente.
- L'application mobile ne reçoit les écrans adhérent qu'à sa prochaine
  publication. Pour les CGV, c'est un refus : tant que des CGV sont en ligne, une
  version antérieure de l'application voit ses commandes refusées, avec un
  message qui demande la mise à jour.

## Quand reconsidérer

- Si le club veut des acomptes → un échéancier sur la facture, pas un nouvel état.
- Si des envois postaux apparaissent → un transporteur et un suivi ; la remise
  signée devient un cas parmi d'autres.

## Lié

- [ADR-0011](0011-remboursement-eteint-la-creance.md)
- [ADR-0012](0012-boutique-variantes-et-stock.md)
- [ADR-0013](0013-commandes-fournisseur.md)
- [ADR-0015](0015-cheques-a-encaisser-5112.md)
- [Plan d'implémentation](../../superpowers/plans/2026-09-13-boutique-cgv-remise-rupture-remboursement.md)
