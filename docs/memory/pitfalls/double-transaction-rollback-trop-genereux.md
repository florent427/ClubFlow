# Piège — un double de transaction qui annule TOUT à l'échec ne prouve rien

## Symptôme

Un test « remise entière ou rien » est vert. On applique la mutation qu'il
est censé détecter — le passage des chèques en `DEPOSITED` sort de la
transaction (`this.prisma.cheque.updateMany` au lieu de
`tx.cheque.updateMany`) — et **il reste vert**. Le test certifie un
invariant que le code n'a pas.

Rencontré le 2026-09-10 sur `cheque-deposits.service.spec.ts` (ADR-0015).

## Cause

Le double de Prisma tenait des tables en mémoire et simulait
`$transaction` ainsi : instantané avant, exécution du callback sur les
tables **réelles**, restauration de l'instantané si le callback lève.

Sous ce double, toute écriture faite pendant le callback est annulée à
l'échec — **qu'elle passe par `tx` ou par `prisma`**. Le double ne
reproduit pas l'asymétrie sur laquelle repose l'invariant : seules les
écritures de la transaction sont annulées, les autres sont déjà commitées.

C'est une instance de
[test-verifie-la-forme-pas-le-comportement](test-verifie-la-forme-pas-le-comportement.md) :
le test décrivait bien le comportement attendu, mais le monde simulé
rendait ce comportement vrai quel que soit le code.

## Solution

Le client `tx` travaille sur une **copie de travail** ; elle est recopiée
dans les tables réelles seulement si le callback réussit (commit). Une
écriture via `prisma.*` touche les tables réelles tout de suite et
**survit** à l'échec.

```ts
$transaction: jest.fn(async (fn) => {
  const work = clone(state);          // copie de travail pour `tx`
  const result = await fn(bind(work)); // lève → rien n'est recopié
  commit(state, work);                 // succès → recopie
  return result;
}),
```

Rejouée, la mutation fait rougir deux tests. C'est le test qu'on voulait.

## Le miroir côté lecture : `prisma` voit ce que `tx` n'a pas encore committé

Rencontré le 2026-09-14 sur `shop-purchase-orders.service.spec.ts`
(ADR-0021, lot 2). `createRestockOrders` crée plusieurs brouillons dans
**une** transaction et propose chaque référence `CF-…` à partir du maximum
observé. La mutation qui déplace cette lecture HORS de la transaction —
`nextReference(this.prisma, …)` au lieu de `nextReference(tx, …)` — **restait
verte** : 68 tests sur 68.

Le double faisait lire à `prisma` les tables mêmes où `tx` venait d'écrire.
Sous PostgreSQL, la lecture hors transaction ne voit pas le premier
brouillon, pas encore committé : le second aurait reçu la même référence, la
contrainte unique aurait levé P2002, et la transaction rejouée serait
retombée sur la même collision jusqu'à épuisement des tentatives. Tout
réapprovisionnement chez deux fournisseurs sans brouillon aurait échoué.

Correctif du double : une ligne créée pendant la transaction reste
**masquée** aux lectures faites par `prisma`, jusqu'au commit.

```ts
const pendingOrderIds = new Set<string>();
orderTable.create.mockImplementation(async (args) => {
  const row = await insertOrder(args);
  if (depth > 0) pendingOrderIds.add(row.id); // pas encore committée
  return row;
});
const committedOrders = {
  ...orderTable,
  findMany: jest.fn(async (args = {}) => {
    const rows = await orderTable.findMany(args);
    return depth > 0 ? rows.filter((r) => !pendingOrderIds.has(r.id)) : rows;
  }),
};
const prisma = { ...tx, shopPurchaseOrder: committedOrders, $transaction /* … */ };
// … et `pendingOrderIds.clear()` quand la transaction se referme.
```

Contre-épreuve faite : double sans ce masquage + mutation → 68 verts ; avec
→ « crée un brouillon par fournisseur » rougit (référence `-002` attendue,
`-001` obtenue deux fois).

## Le réflexe à garder

- Avant de faire confiance à un test d'atomicité, **appliquer la mutation
  qu'il vise** : sortir une écriture de la transaction. S'il reste vert, le
  double est trop généreux.
- Un double doit reproduire **ce qui distingue** le bon code du mauvais,
  pas seulement le chemin heureux. Pour une transaction, ce qui distingue,
  c'est : « les écritures hors `tx` ne sont pas annulées » **et** « une
  lecture hors `tx` ne voit pas ce que `tx` n'a pas encore committé ».
- Une transaction qui LIT ce qu'elle vient d'écrire (référence, maximum + 1,
  compteur) : appliquer la mutation qui déplace cette lecture sur `prisma`.
  Verte = le double montre à `prisma` des écritures non committées.

## Lié

- [test-verifie-la-forme-pas-le-comportement.md](test-verifie-la-forme-pas-le-comportement.md)
- [garantie-derriere-effet-de-bord.md](garantie-derriere-effet-de-bord.md)
  — l'invariant que le test devait protéger
