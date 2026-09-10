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

## Le réflexe à garder

- Avant de faire confiance à un test d'atomicité, **appliquer la mutation
  qu'il vise** : sortir une écriture de la transaction. S'il reste vert, le
  double est trop généreux.
- Un double doit reproduire **ce qui distingue** le bon code du mauvais,
  pas seulement le chemin heureux. Pour une transaction, ce qui distingue,
  c'est : « les écritures hors `tx` ne sont pas annulées ».

## Lié

- [test-verifie-la-forme-pas-le-comportement.md](test-verifie-la-forme-pas-le-comportement.md)
- [garantie-derriere-effet-de-bord.md](garantie-derriere-effet-de-bord.md)
  — l'invariant que le test devait protéger
