# Piège — `tsc --noEmit` qui ne compile aucun fichier et sort toujours 0

## Symptôme

Il n'y en a pas. C'est un contrôle **vert**, et c'est tout le problème.

```bash
cd apps/admin && npx tsc --noEmit
# (aucune sortie, exit 0)
```

Sauf qu'il n'a rien lu :

```bash
npx tsc --noEmit --listFiles | grep -c "/src/"
# 0
npx tsc -p tsconfig.app.json --noEmit --listFiles | grep -c "/src/"
# 184
```

## Contexte

Découvert le 2026-07-20, par un agent qui vérifiait son propre travail et a
eu la curiosité de compter ce que la commande lisait.

`apps/admin` et `apps/member-portal` étaient concernés. `apps/mobile-admin`
non — sa commande mordait sur 351 fichiers.

La règle d'or n°8 de CLAUDE.md prescrivait `npx tsc --noEmit` sur `apps/admin`
depuis la mise en place du système de mémoire. Ce contrôle n'a donc **jamais
rien contrôlé** sur cette app, et chaque « tsc propre » annoncé à son sujet —
y compris plusieurs fois dans la session du 2026-07-20 — était vide de sens.

## Cause root

Le scaffold Vite + TypeScript moderne éclate la configuration en **projets
référencés** :

```json
// apps/admin/tsconfig.json
{
  "files": [],
  "references": [
    { "path": "./tsconfig.app.json" },
    { "path": "./tsconfig.node.json" }
  ]
}
```

`"files": []` est littéral : ce projet ne contient aucun fichier. `tsc
--noEmit` compile **le projet courant**, pas ses références — il faut
`tsc -b` (build mode) pour que les références soient suivies.

La commande réussit donc, instantanément, sans avoir ouvert une seule ligne
de code.

## Pourquoi ça n'a pas explosé

Parce que `npm run build` fait `tsc -b && vite build`, et que `tsc -b`, lui,
suit les références. La CI et les déploiements ont donc toujours vérifié les
types.

Seul le contrôle **manuel** était creux — celui qu'on lance justement avant de
commiter, pour ne pas casser la CI.

## Solution

Un script explicite, qui ne laisse pas le choix de la commande :

```json
// apps/admin/package.json et apps/member-portal/package.json
"scripts": {
  "build": "tsc -b && vite build",
  "typecheck": "tsc -b --noEmit"
}
```

```bash
cd apps/api           && npx tsc --noEmit   # 1 projet, la commande mord
cd apps/admin         && npm run typecheck
cd apps/member-portal && npm run typecheck
cd apps/mobile-admin  && npx tsc --noEmit
```

## Le réflexe à garder

> **Un contrôle vert ne vaut que si on a vérifié qu'il peut rougir.**

C'est le même principe que le mutation testing pour les tests
([test-verifie-la-forme-pas-le-comportement.md](test-verifie-la-forme-pas-le-comportement.md)),
appliqué à l'outillage. Devant une commande de vérification, se demander :
*combien de fichiers a-t-elle réellement lus ?*

```bash
npx tsc --noEmit --listFiles | grep -c "/src/"   # doit être NON NUL
```

Le cas est d'autant plus vicieux que la commande est **plus rapide** quand
elle ne fait rien — ce qui passe pour une bonne nouvelle.

## Lié

- [test-verifie-la-forme-pas-le-comportement.md](test-verifie-la-forme-pas-le-comportement.md)
  — même motif, appliqué aux tests
- [garantie-derriere-effet-de-bord.md](garantie-derriere-effet-de-bord.md)
- [build-admin-strict-ts.md](build-admin-strict-ts.md) — l'autre piège tsc de
  cette app
