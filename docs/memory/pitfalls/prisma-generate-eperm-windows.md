# Piège — `prisma generate` fail EPERM sur Windows (DLL lockée)

## Symptôme

```
$ npx prisma generate
Prisma schema loaded from prisma\schema.prisma
Error:
EPERM: operation not permitted, rename
'C:\...\node_modules\.prisma\client\query_engine-windows.dll.node.tmp60688'
-> 'C:\...\node_modules\.prisma\client\query_engine-windows.dll.node'
```

Le générateur a écrit le fichier `.tmp*` mais ne peut pas le renommer
en `query_engine-windows.dll.node` car ce dernier est lock par un autre
process.

## Contexte

Sur Windows uniquement (filesystem locking strict). Arrive quand :
- L'API NestJS tourne en watch mode et a chargé `.prisma/client` (le
  process Node tient un handle sur la DLL)
- Un IDE / TypeScript server scanne `node_modules` en background
- Un autre worktree partage le même `node_modules` (rare, mais arrivé)
- Une commande `npm install` antérieure n'a pas relâché le handle

## Cause root

Windows refuse de remplacer un fichier ouvert par un autre process.
Sous Linux/macOS, c'est permis (le file handle reste valide même si
le fichier est unlinké, le nouveau fichier prend la place).

Prisma tente le `rename(.tmp, final)` standard, ça fail si `final` est
déjà mappé.

## Solution

### Solution rapide (90% des cas)
```bash
# Attendre 5-10 secondes (le watch mode a parfois fini de relâcher)
# puis retry :
npx prisma generate
```

### Solution force (si le retry échoue)
```bash
# Identifier les process Node tenant la DLL
# (PowerShell) :
Get-Process node | Select Id, ProcessName, Path

# Si l'API est en watch sur le port 3000, la stopper :
# Soit via /restart skill
# Soit manuellement :
$port = 3000
$pid = (Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue).OwningProcess
Stop-Process -Id $pid -Force

# Retry prisma generate
npx prisma generate
```

### Prévention
- Avant `prisma generate`, **stop l'API** si elle tourne en watch (cf.
  skill `/restart` qui kill+restart proprement)
- Ne pas lancer `prisma generate` depuis 2 worktrees en parallèle sur
  le même `node_modules`

## Pourquoi NE PAS faire

- ❌ `rm -rf node_modules/.prisma` puis re-install — overkill, prend
  3-5 min vs 5 sec de retry
- ❌ Lancer prisma generate dans une boucle qui re-essaye sans
  diagnostic — gaspillage et masque le vrai problème (process zombie)

## Détection

Si tu vois ce symptôme après un changement de `schema.prisma` :
1. Note l'heure
2. Liste les process Node : `Get-Process node`
3. Si plus d'un, tu as la cause

## Note Linux/macOS

Ce piège **n'existe pas** sur Linux/macOS — `prisma generate` y marche
même API en watch. Le pitfall est strictement Windows.

## Lié

- [knowledge/stack.md](../../knowledge/stack.md) §Décisions piège
- [.claude/skills/restart/SKILL.md](../../../.claude/skills/restart/SKILL.md) (alternative à kill manuel)
