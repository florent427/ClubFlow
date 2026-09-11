# Piège — un double qui ignore une clause du `where` certifie un filtre absent

## Symptôme

On retire un filtre d'une requête Prisma — celui-là même qu'un test est
censé protéger — et **les tests restent verts**. Le test décrit le bon
comportement, mais le monde simulé le rend vrai quel que soit le code.

Rencontré trois fois en deux jours, sur trois filtres différents :

| Date | Filtre retiré | Ce qui aurait dû casser |
|---|---|---|
| 2026-09-11 (lot 6) | `reimbursementItems: { none: { … POSTED } }` | un reçu déjà remboursé redevenait remboursable |
| 2026-09-11 (lot 7) | `lines: { some: { accountCode } }` remplacé par `financialAccountId` | les dépôts d'espèces disparaissaient du livre de la caisse |
| 2026-09-11 (lot 7) | `status: UNMATCHED` sur une ligne de relevé | une ligne déjà rapprochée se faisait rapprocher une seconde fois |

## Cause

Le double applique **sa propre logique métier** au lieu de lire la requête.

```ts
// Le double « sait » que les reçus remboursés ne comptent pas.
findMany: jest.fn(async ({ where }) =>
  entries.filter((e) => e.advancedByMemberId === where.advancedByMemberId && !isReimbursed(e.id))
),
```

Tant que le double filtre de lui-même, le service peut oublier la clause :
le résultat est le même. Le test certifie un invariant que le code n'a pas.

C'est la même famille que
[double-transaction-rollback-trop-genereux](double-transaction-rollback-trop-genereux.md),
sur les clauses plutôt que sur l'atomicité.

## Solution

Le double lit le `where` et applique **exactement** les clauses que le
service écrit — ni plus, ni moins. Une clause absente de la requête doit
faire revenir davantage de lignes.

```ts
findMany: jest.fn(async ({ where }) => {
  // Sans la clause, les reçus remboursés reviennent : c'est ce que le
  // test doit voir.
  const excludeReimbursed = where.reimbursementItems !== undefined;
  return entries.filter(
    (e) =>
      e.advancedByMemberId === where.advancedByMemberId &&
      (!excludeReimbursed || !isReimbursed(e.id)),
  );
}),
```

Rejouée, chaque mutation fait rougir de 1 à 5 tests.

## Le réflexe à garder

- Écrire le double **en face de la requête**, clause par clause. Chaque
  `if (where.x !== undefined)` correspond à une clause du service.
- Ne jamais mettre dans un double une règle métier que le service est censé
  porter : le double doit être bête, c'est le service qui décide.
- Le seul contrôle qui le démasque est la mutation : retirer la clause,
  relancer. Vert = le double est trop généreux, pas le code correct.

## Lié

- [double-transaction-rollback-trop-genereux.md](double-transaction-rollback-trop-genereux.md)
- [test-verifie-la-forme-pas-le-comportement.md](test-verifie-la-forme-pas-le-comportement.md)
