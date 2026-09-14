# Piège — `structuredClone` dans Jest rend des `Date` d'un autre contexte

## Symptôme

Un test échoue sur `toBeInstanceOf(Date)`, avec un message qui se contredit :

```text
expect(received).toBeInstanceOf(expected)

Expected constructor: Date
Received constructor: Date
```

Constaté le 2026-09-14 en écrivant le monde de test partagé du lot 5 de la
boutique (`apps/api/test/shop-order-world.ts`) : la valeur était bien une date.

## Cause

Jest exécute chaque fichier de test dans un contexte `vm` à part, avec ses
propres constructeurs globaux. `structuredClone`, lui, est celui de Node : les
`Date` qu'il fabrique appartiennent au contexte principal. `instanceof Date`
compare au `Date` du test, et répond faux.

`toEqual` ne voit rien, puisqu'il compare les valeurs : seuls
`toBeInstanceOf(Date)` et `expect.any(Date)` trébuchent. Le défaut n'apparaît
donc qu'au premier test qui vérifie la classe — ici, après le ROLLBACK simulé
d'un double qui copiait ses lignes.

## Solution

Dans un double qui copie ses données, copier avec une fonction du contexte du
test, qui recrée les dates :

```ts
function clone<T>(value: T): T {
  if (value instanceof Date) return new Date(value.getTime()) as T;
  if (Array.isArray(value)) return value.map((v) => clone(v)) as unknown as T;
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, clone(v)]),
    ) as T;
  }
  return value;
}
```

`structuredClone` reste sans risque sur des données sans date, ou quand aucun
test n'en vérifie la classe.

## Détection

```bash
grep -rn "structuredClone" apps/api/src apps/api/test --include=*.ts
```

Chaque occurrence dans un double de test dont les lignes portent des dates est
suspecte.
