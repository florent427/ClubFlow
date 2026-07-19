# ADR-0013 — Commandes fournisseur : réception, rapprochement et écart

## Statut

✅ **Accepté** — 2026-07-20
Prolonge [ADR-0012](0012-boutique-variantes-et-stock.md) (variantes et stock)

## Contexte

La boutique sait vendre et suivre son stock, mais pas le **reconstituer**. Un
`RESTOCK` était saisi à la main, sans dire d'où venait la marchandise.

D'où le reproche, et il est juste : *« les mouvements de stock ne sont pas
précis »*. La cause n'est pas l'écran. Un mouvement qui ne connaît pas sa
commande d'origine ne peut pas être précis — il n'a rien à raconter.

Le champ `reorderTargetQty`, posé par l'ADR-0012, ne servait par ailleurs
**à rien** : il désigne la quantité à recommander, sans qu'aucune commande
n'existe pour la recevoir.

## Décisions

### 1. La réception ne produit AUCUNE écriture comptable

L'écriture naît au **paiement du fournisseur**, rattachée à la commande.

Le grand livre de ClubFlow est en **trésorerie** de bout en bout : une facture
émise n'écrit rien, seul l'encaissement le fait. Poser `607 / 401` à la
réception introduirait de l'**engagement** côté achats pendant que les ventes
restent en trésorerie — deux conventions dans le même grand livre, et un
compte fournisseur que personne ne solderait jamais.

Le plan comptable seedé n'a d'ailleurs ni `401000 Fournisseurs`, ni aucun
compte de stock `3xx`. Il ne doit pas en recevoir pour cette fonctionnalité :
ce serait ajouter deux familles de comptes pour soutenir une convention qu'on
ne veut pas.

`607000 Achats de marchandises` est ajouté au plan et proposé par défaut
quand le trésorier saisit sa facture fournisseur — qu'il peut alors **lier à
la commande**. C'est ce lien qui donne le rapprochement facture/commande,
sans rien changer à la convention.

**Les coûts d'achat servent le REPORTING, pas le grand livre** : valeur du
stock, marge par article, coût moyen pondéré. Ces chiffres sont utiles et
n'ont pas besoin d'être des écritures pour l'être.

### 2. Le motif d'écart pilote la machine à états

C'est le cœur du rapprochement, et ce n'est pas un champ décoratif.

| Motif | Effet sur la ligne |
|---|---|
| `BACKORDER` | **reste ouverte** — le reliquat est attendu |
| `SUPPLIER_SHORTAGE` | soldée courte — on ne l'aura jamais |
| `DAMAGED_IN_TRANSIT` | soldée courte |
| `PICKING_ERROR` | soldée courte |
| `OVER_DELIVERY` | soldée, reçu > commandé |
| `OTHER` | soldée courte, commentaire obligatoire |

Distinguer *« ça arrive »* de *« on ne l'aura jamais »* est exactement ce
qu'un rapprochement doit trancher. Sans cette distinction, une commande reste
éternellement ouverte ou se ferme à tort — et dans les deux cas le stock
prévisionnel ment.

Le motif est **obligatoire dès que `receivedQty ≠ orderedQty`**. Un écart sans
explication est une information perdue au moment précis où quelqu'un la
connaissait encore.

### 3. Le statut de la commande est CALCULÉ, jamais saisi

`DRAFT → ORDERED → PARTIALLY_RECEIVED → RECEIVED`, plus `CANCELLED`.

Après chaque réception, le statut se déduit de l'état des lignes : toutes
soldées → `RECEIVED`, au moins une reçue → `PARTIALLY_RECEIVED`. Laisser un
humain le poser produirait un statut qui contredit ses propres lignes.

Les transitions sont arbitrées par un `updateMany` conditionnel dont on teste
le `count`, jamais par un `if` lu hors transaction — même règle qu'ADR-0012
§3, pour la même raison.

### 4. Une quantité EN COMMANDE, dérivée

`onOrder` = somme des `orderedQty − receivedQty` sur les commandes non closes.

Affichée partout où le stock apparaît. *« Il reste 2 M/Bleu, mais 20
arrivent »* est ce qui évite de recommander deux fois — le défaut le plus
courant d'une gestion de stock sans visibilité sur l'encours.

**Dérivée et non stockée** : un compteur de plus serait un compteur de plus à
tenir juste, et celui-ci n'arbitre aucune garantie. Le stock vendable, lui,
reste `available`, matérialisé et arbitré par la base — ne pas confondre les
deux. `onOrder` n'autorise jamais une vente.

### 5. La réception est PARTIELLE par nature

Une commande de 20 arrive rarement en une fois. Chaque réception est un objet
à part entière (`ShopPurchaseReception`), avec sa date et ses lignes, et
engendre ses propres mouvements `RESTOCK` **rattachés à la ligne de commande**.

C'est ce rattachement qui rend le journal précis :

> *« +17 — reçu sur commande CF-2026-004 (Décathlon Pro), 3 manquants,
> rupture fournisseur »*

au lieu de *« +17 »*.

Modéliser une réception unique aurait forcé à écraser la précédente, donc à
perdre l'historique des livraisons partielles — précisément ce qu'on cherche
à documenter.

## Alternatives écartées

**Écrire `607 / 401` à la réception.** C'est plus juste au sens strict de la
comptabilité d'engagement, et c'est ce que ferait un ERP. Mais ClubFlow n'est
pas un ERP : mélanger les conventions produirait un grand livre qu'un
trésorier bénévole ne saurait pas lire, et un compte 401 jamais soldé.

**Un compte de stock `371000` valorisé.** Suppose des écritures de variation
de stock à chaque inventaire. Le même argument s'applique, en pire : la
valorisation devient une obligation permanente au lieu d'un indicateur.

**Stocker `onOrder` en colonne.** Deux compteurs de plus à tenir cohérents
avec les lignes de commande, pour une valeur qui n'arbitre rien. La somme est
calculée sur quelques dizaines de lignes ouvertes ; le coût est nul.

**Le fournisseur en texte libre.** Écarté : on recommande toujours aux mêmes,
et les fautes de frappe fragmentent l'historique. `ShopSupplier` porte en
outre le délai de livraison habituel, qui sert à dater l'arrivée attendue.

## Conséquences

Le champ `reorderTargetQty` de l'ADR-0012 trouve enfin son usage : l'onglet
« À réapprovisionner » engendre une commande pré-remplie.

`AUTO_SHOP`, déclaré dans `AccountingEntrySource` depuis l'origine et **jamais
branché** — son unique usage est un `case` d'export CSV — reste inutilisé par
cette décision. Il est documenté comme tel plutôt que laissé à croire qu'un
flux comptable boutique existe.

## Lié

- [ADR-0012](0012-boutique-variantes-et-stock.md) — variantes et stock
- [garantie-derriere-effet-de-bord.md](../pitfalls/garantie-derriere-effet-de-bord.md)
- [compta-non-seedee-webhook-500.md](../pitfalls/compta-non-seedee-webhook-500.md)
  — le motif « déclaré au schéma, jamais câblé », dont `AUTO_SHOP` est une
  seconde instance
