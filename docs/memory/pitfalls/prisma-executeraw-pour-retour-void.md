# `$queryRaw` sur une fonction qui retourne `void` : la fonctionnalité est morte, les tests sont verts

## Symptôme

**Aucun en test.** C'est tout l'intérêt de cette fiche.

En E2E, chaque appel de la mutation échoue avec une erreur de
désérialisation Prisma évoquant un type de retour inattendu — mais on n'y
arrive que si on exécute vraiment le chemin. La suite unitaire, elle,
reste intégralement au vert.

## Ce qui s'est passé

Le verrou d'exclusion du module « équipe » (garantie : ne jamais retirer le
dernier accès back-office d'un club) était posé ainsi :

```ts
// ❌ lève à CHAQUE appel
await tx.$queryRaw`SELECT pg_advisory_xact_lock(
  hashtext('clubflow:club-team'), hashtext(${clubId}))`;
```

`pg_advisory_xact_lock()` retourne `void`. `$queryRaw` attend un **jeu de
résultats** et tente de le désérialiser ; le `void` de PostgreSQL n'a pas
de correspondance côté client, donc l'appel lève systématiquement.

Comme le verrou est la **première instruction** de la transaction, toute la
fonctionnalité était morte. En production, personne n'aurait pu retirer ni
ajouter un membre de l'équipe.

```ts
// ✅ n'attend aucune ligne en retour
await tx.$executeRaw`SELECT pg_advisory_xact_lock(
  hashtext('clubflow:club-team'), hashtext(${clubId}))`;
```

## Pourquoi 12 mutations vertes n'ont rien vu

Le faux Prisma du spec exposait `$queryRaw` comme un stub qui rend un
tableau vide, sans jamais reproduire la désérialisation réelle. Le test
vérifiait donc que **le code appelle un verrou**, pas que **le verrou
fonctionne**. Le mutation testing confirmait la première propriété avec
zèle — 12 mutations tuées — en certifiant un invariant que le code n'avait
pas.

C'est exactement le motif de
[test-verifie-la-forme-pas-le-comportement.md](test-verifie-la-forme-pas-le-comportement.md),
mais aggravé : ici le faux ne se contentait pas d'être trop permissif, il
**divergeait du vrai client** sur le point précis qui casse.

## La règle

- `$executeRaw` pour tout SQL dont on n'attend **pas** de lignes :
  `pg_advisory_xact_lock`, `SET`, `LOCK TABLE`, la plupart des `SELECT
  fonction_void()`. `$queryRaw` seulement quand on lit vraiment des lignes.
- Un faux qui remplace un client de base **doit refuser ce que le vrai
  refuse**. Un stub qui accepte tout transforme la suite en théâtre.
- Corollaire général : **une garantie qui ne s'exécute qu'en base ne peut
  pas être validée par un faux.** Il lui faut au moins un passage E2E sur
  la vraie base — c'est le seul juge.

## Comment il a été trouvé

Par un E2E sur staging contre la vraie base, après que toute la suite
unitaire soit passée. Aucune relecture de code ne l'aurait sorti : la ligne
fautive est *lisible* et *plausible*.

## Rencontré

2026-07-20, module « équipe » (accès back-office). Cf. aussi le trou
d'écriture concurrente que ce verrou existe pour fermer : sous READ
COMMITTED, PostgreSQL réévalue le prédicat sur la ligne cible verrouillée
mais **pas** sur les lignes d'une sous-requête, d'où le write-skew.

## Lié

- [test-verifie-la-forme-pas-le-comportement.md](test-verifie-la-forme-pas-le-comportement.md)
- [garantie-derriere-effet-de-bord.md](garantie-derriere-effet-de-bord.md)
- [ADR-0003 — `prisma db push` (pas de CHECK ni de trigger)](../decisions/0003-prisma-db-push.md)
