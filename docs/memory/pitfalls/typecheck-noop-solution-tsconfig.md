# Piège — `npx tsc --noEmit` qui vérifie 0 fichier et sort 0

## Statut : ✅ RÉSOLU 2026-07-19

## Symptôme

```bash
$ cd apps/admin && npx tsc --noEmit
$ echo $?
0
```

Vert. Toujours vert. Y compris avec une erreur de type flagrante :

```ts
// src/__probe.ts
export const probe: number = "definitely not a number";
```

```bash
$ npx tsc --noEmit ; echo $?
0                                    # ← l'erreur passe
$ npx tsc -b --noEmit ; echo $?
src/__probe.ts(1,14): error TS2322: Type 'string' is not
  assignable to type 'number'.
2                                    # ← elle est bien là
```

## Contexte

Le `tsconfig.json` de `apps/admin` (et de `apps/member-portal`) est un
fichier **« solution »** : il ne contient aucun fichier, il ne fait que
pointer vers deux sous-projets.

```json
{
  "files": [],
  "references": [
    { "path": "./tsconfig.app.json" },
    { "path": "./tsconfig.node.json" }
  ]
}
```

`tsc -p` **n'entre pas dans les `references`** — seul le mode build
(`tsc -b`) les suit. Avec `"files": []` et aucun `include`, le programme
compilé est littéralement vide :

```bash
$ npx tsc --noEmit --listFiles | wc -l
0                                    # ← zéro fichier chargé
$ npx tsc -p tsconfig.app.json --noEmit --listFiles | wc -l
1154
```

Zéro fichier à vérifier ⇒ zéro erreur ⇒ exit 0. La commande n'a jamais
menti : on ne lui a jamais donné de code à lire.

C'est la version outillage de
[test-verifie-la-forme-pas-le-comportement.md](test-verifie-la-forme-pas-le-comportement.md) :
la commande *a la forme* d'un type-check, son nom le dit, son code de
sortie le confirme — et elle ne vérifie rien. Elle est passée inaperçue
d'autant plus facilement qu'elle était **inscrite dans la règle 8 du
CLAUDE.md**, donc exécutée à chaque commit avec la conviction qu'elle
protégeait quelque chose.

## Solution

Un script canonique par app, pour qu'il n'y ait qu'**une** commande à
retenir et qu'elle soit juste :

```json
// apps/admin/package.json, apps/member-portal/package.json
"typecheck": "tsc -b --noEmit"

// apps/api/package.json  (tsconfig classique avec include → -p suffit)
"typecheck": "tsc --noEmit"
```

```bash
cd apps/admin && npm run typecheck
```

### Pourquoi `tsc -b` et pas `-p tsconfig.app.json`

`-p tsconfig.app.json` marche mais ne couvre que `src/`. Le mode build
suit **toutes** les `references`, donc aussi `tsconfig.node.json`
(= `vite.config.ts`). Vérifié :

```bash
# erreur injectée dans vite.config.ts
$ npx tsc -p tsconfig.app.json --noEmit ; echo $?
0                                    # ← rate l'erreur
$ npx tsc -b --noEmit ; echo $?
vite.config.ts(9,7): error TS2322: ...
2                                    # ← la voit
```

`tsc -b --noEmit` exige **TS ≥ 5.6** (ici 5.9.3 ✅). Sur une version
antérieure, `--noEmit` est ignoré en mode build et `tsc -b` écrit des
artefacts.

### Le cache n'avale pas les erreurs

`tsc -b` est incrémental (`tsBuildInfoFile`), ce qui pouvait faire
craindre un « up-to-date » qui masque une erreur au 2ᵉ appel. Testé sur
3 exécutions consécutives à cache chaud : l'erreur est re-signalée à
chaque fois, exit 2. Pas besoin de `--force`.

## Portée

| App | `tsconfig.json` | `npx tsc --noEmit` seul |
|---|---|---|
| `apps/admin` | solution (`files: []`) | ❌ 0 fichier |
| `apps/member-portal` | solution (`files: []`) | ❌ 0 fichier |
| `apps/api` | classique (`include`) | ✅ 4167 fichiers |
| `apps/mobile` | `extends expo/tsconfig.base` | ✅ |

Aucune erreur de type préexistante n'a été révélée sur `admin` ni
`member-portal` : le `build` (`tsc -b && vite build`) jouait déjà le
vrai type-check en CI/déploiement. Le trou concernait la **porte
pré-commit**, pas le bundle livré — sauf quand le déploiement bypasse
`tsc -b` via `npx vite build` (cf.
[build-admin-strict-ts.md](build-admin-strict-ts.md)).

## Comment détecter ce piège ailleurs

Ne jamais faire confiance à un exit 0 : compter les fichiers réellement
chargés.

```bash
npx tsc --noEmit --listFiles | wc -l     # 0 → la commande ne vérifie rien
```

Le contrôle qui tranche, ici comme pour les tests : **injecter une
erreur et vérifier que la commande rougit.** Deux minutes.

## Lié

- [test-verifie-la-forme-pas-le-comportement.md](test-verifie-la-forme-pas-le-comportement.md)
  — même défaut, au niveau des tests
- [build-admin-strict-ts.md](build-admin-strict-ts.md)
  — le bypass `npx vite build` qui retire l'autre filet
