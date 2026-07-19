# ADR-0012 — Tout ce qui est vendable est une variante, et le stock est un journal

## Statut

✅ **Accepté** — 2026-07-20

## Contexte

La boutique vendait des `ShopProduct` portant un `stock Int?` plat. Le besoin :
des déclinaisons configurables par le club (taille, couleur, floquage) et une
gestion de stock réelle avec seuils de réapprovisionnement.

L'exploration préalable a montré que le modèle existant ne pouvait pas être
étendu tel quel, pour une raison plus grave que l'absence de variantes :
**aucune garantie de stock n'était tenue par la base.**

| Défaut | Conséquence |
|---|---|
| `input.lines` jamais dédupliqué | `[{A,3},{A,3}]` sur stock 5 passe la validation et donne **−1**, sans aucune concurrence |
| Lecture hors transaction + `if` applicatif + `decrement` nu | deux commandes concurrentes surventent |
| `markOrderPaid` ne teste aucun statut | une commande `CANCELLED` — dont le stock a été rendu — repasse `PAID` et vend l'article deux fois |

Ajouter des variantes par-dessus aurait dupliqué ces défauts sur un second
chemin de vente.

## Décisions

### 1. La variante est la seule chose vendable, et la seule chose stockée

Un produit **sans** axe de variation possède **exactement une** variante,
`isDefault`, invisible dans l'interface. Il n'existe donc jamais deux chemins
de vente : **une seule garantie à tenir, pas deux.**

Corollaire d'interface, et c'est la contrainte n°1 : la bascule « ce produit a
des déclinaisons » est **décochée par défaut**, et le formulaire d'un produit
simple reste exactement ce qu'il est aujourd'hui. La complexité du modèle ne
doit jamais remonter à l'écran d'un trésorier qui vend un porte-clés.

### 2. `available` est un entier NON NULLABLE, et l'illimité est explicite

Pas de `stock Int?` où « null = illimité ». Le suivi est porté par un booléen
`trackStock` dédié.

Ce n'est pas une préférence d'esthétique. Le décrément est un `updateMany`
conditionnel dont le prédicat `available: { gte: qty }` **est** la garantie.
Or en SQL, `NULL >= 3` vaut `UNKNOWN` : un stock nullable ferait **exclure
silencieusement** les lignes illimitées, l'`updateMany` renverrait `count = 0`,
et une vente parfaitement valide serait refusée. La correction naturelle
— « si le stock est null, sauter le contrôle » — réintroduirait le
check-then-act exactement au cœur de ce qu'on cherche à supprimer.

Le prédicat qui porte l'invariant doit rester **trivialement correct**.

### 3. La garantie anti-survente vit dans un `WHERE`, pas dans un `if`

```sql
UPDATE "ShopProductVariant"
   SET "available" = "available" - $1
 WHERE "id" = $2 AND "clubId" = $3
   AND "active" AND "trackStock" AND "available" >= $1;
-- rowCount = 0 ⇒ refus.   rowCount = 1 ⇒ réservé.
```

Sous `READ COMMITTED`, PostgreSQL verrouille la ligne puis **réévalue le
prédicat sur la version committée**. Deux transactions sur le dernier article :
la seconde attend, retrouve `available = 0`, et son `rowCount` vaut 0. Il
n'existe aucune fenêtre entre la lecture et l'écriture — **parce qu'il n'y a
pas de lecture.**

La forme est déjà employée deux fois dans le dépôt :
`scheduler-lock.service.ts:66` et `payment-schedule-engine.service.ts:287`.

**`prisma db push` ([ADR-0003](0003-prisma-db-push.md)) interdit tout `CHECK`
et tout trigger.** Le `WHERE` conditionnel n'est donc pas un choix parmi
d'autres : c'est le seul mécanisme disponible. D'où l'exigence de la décision 2.

Le `clubId` est **dans l'écriture**, pas dans un `findFirst` préalable : la
frontière multi-tenant est tenue par la même requête que la garantie de stock.

### 4. Le stock est un journal de mouvements, doublé de compteurs matérialisés

`ShopStockMovement` archive chaque entrée, sortie, correction et retour.
`onHand` et `available` sont maintenus dans la **même transaction** que le
mouvement qui les justifie.

Le journal n'est **jamais** sommé pour vendre : `placeOrder` fait deux requêtes
par variante, en O(1). La somme ne sert qu'à l'écran d'historique et à la
réconciliation, tous deux hors chemin critique. Un club vendant 500 articles
par an produit ~1500 lignes de mouvement par an — trois ordres de grandeur
sous ce qui poserait un problème.

Ce que le journal achète : *« pourquoi il manque trois t-shirts ? »* devient
une question à laquelle on peut répondre.

### 5. L'unicité d'une combinaison passe par une signature non nulle

`optionSignature` — les identifiants de valeurs triés, joints — porte
`@@unique([productId, optionSignature])`.

Un `@@unique` sur des colonnes de valeurs nullables ne protégerait rien :
PostgreSQL traite les `NULL` comme **distincts** dans un index unique, donc
plusieurs « variantes par défaut » `(null, null)` cohabiteraient sur le même
produit simple. `NULLS NOT DISTINCT` (PG 15+) n'est pas exprimable en Prisma.
La chaîne vide, elle, est une valeur.

### 6. Le prix de la variante est ABSOLU et nullable, pas un surcoût

`priceCents Int?` : `null` hérite de `ShopProduct.priceCents`.

Un delta signé se défend — « floquage +5 € » se lit bien — mais dans une
matrice de 24 combinaisons, vérifier un prix oblige alors à faire l'addition
de tête, ligne par ligne. Le prix absolu se relit d'un coup d'œil. La vitrine
affiche « à partir de X € » dans les deux cas.

### 7. Aucun envoi d'e-mail sur le chemin d'une vente

L'évaluation des seuils est faite par un **cron quotidien**, jamais dans la
transaction de commande.

Évaluer à la vente rejouerait
[garantie-derrière-effet-de-bord](../pitfalls/garantie-derriere-effet-de-bord.md)
en miroir : soit un SMTP en échec ferait échouer une vente légitime, soit un
`try/catch` avalerait l'alerte et personne ne saurait qu'elle est morte. Une
latence allant jusqu'à 24 h ne coûte rien — le délai de réapprovisionnement
d'un t-shirt floqué se compte en jours.

L'anti-spam suit le même principe que le stock : le passage **réclame**
l'alerte par un `updateMany` conditionnel sur `lowStockAlertedAt: null` avant
d'envoyer quoi que ce soit. Le réarmement se fait à la remontée du stock — et
aussi **au changement de seuil**, sans quoi un seuil relevé n'alerterait plus
jamais.

## Alternatives écartées

**Garder `stock` sur le produit et n'ajouter que des variantes.** Deux
compteurs, deux garanties, deux chemins de décrément — dont un qu'on oublie de
maintenir. C'est précisément ce que la variante par défaut supprime.

**Le journal comme unique source de vérité, sans compteur.** Il faudrait
`SUM(availableDelta)` à chaque ligne de panier puis sérialiser la transaction.
Le compteur matérialisé donne l'arbitrage, le journal donne l'audit ; les
séparer est ce qui rend les deux tenables.

**Une table de jointure variante ↔ valeur d'option** (le modèle canonique de
Medusa). Avec une jointure, « deux variantes ne peuvent pas désigner la même
combinaison » n'est plus exprimable par une contrainte : il faudrait comparer
des ensembles de lignes filles, donc arbitrer en applicatif. La signature
dénormalisée rend l'invariant tenable par la base.

## Conséquences

`ShopProduct.stock` survit une release, **neutralisé** — plus aucun code ne le
lit ni ne l'écrit — et reste exposé en GraphQL comme champ **dérivé** (somme
des `available` des variantes suivies). Les 18 opérations GraphQL existantes,
dont 5 sélectionnent `stock`, continuent donc de compiler le jour du
déploiement. La colonne ne disparaît qu'au lot 5.

Deux sources de vérité concurrentes sur le stock seraient pires que tout : la
colonne devient **morte**, pas secondaire.

## Lié

- [ADR-0003](0003-prisma-db-push.md) — `db push`, donc ni `CHECK` ni trigger
- [garantie-derriere-effet-de-bord.md](../pitfalls/garantie-derriere-effet-de-bord.md)
- [test-verifie-la-forme-pas-le-comportement.md](../pitfalls/test-verifie-la-forme-pas-le-comportement.md)
  — le risque, sur ce lot, est d'écrire des tests qui inspectent le `where` du
  `updateMany` au lieu de le faire appliquer par le double
