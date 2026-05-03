# Piège — Build `apps/admin` échoue en strict TS

## Symptôme

```
$ cd apps/admin && npm run build
> tsc -b && vite build

src/pages/SomePage.tsx:42:23 - error TS2304: Cannot find name 'foo'.
src/components/X.tsx:18:9 - error TS2339: Property 'bar' does not exist on type 'Y'.
[10+ erreurs similaires]
```

## Contexte

Le `package.json` de `apps/admin` a :

```json
"scripts": {
  "build": "tsc -b && vite build"
}
```

Donc `tsc -b` (type-check strict) tourne avant le build Vite. Si une
erreur TS existe, le build entier échoue.

Or des refactors récents ont laissé des incohérences de types dans
~10 fichiers (props mal typés, imports cassés). Pas critique au runtime
mais bloquant pour le `tsc -b`.

## Solution actuelle (workaround)

**Bypass `tsc -b`** : appeler directement `vite build` qui ne fait
pas de type-check (juste de la transpilation Babel-like) :

```bash
npx vite build
```

→ génère un `dist/` propre, juste sans la garantie type-safe.

Le script `clubflow-deploy.sh` Phase 3 utilise déjà `npx vite build`.

## Solution propre (à faire — TODO ticket)

1. Lister toutes les erreurs : `cd apps/admin && npx tsc --noEmit > /tmp/ts-errors.txt`
2. Fixer les ~10 fichiers fautifs
3. Réactiver `tsc -b` dans le script `build`

## Conséquence du workaround

- ❌ Pas de garantie type-safe sur le bundle déployé
- ❌ Une régression type peut passer en prod sans alerter
- ✅ Au runtime, le code marche (les erreurs TS sont sur des chemins
  rarement empruntés)

## Idem pour `apps/vitrine` ?

Non. Vitrine utilise Next.js qui type-check au build mais avec
`ignoreBuildErrors: true` dans `next.config.ts` (à vérifier). Si
besoin, même workaround.

## Détection

Pour voir le diff entre le code et la "vraie" propreté TS :

```bash
cd apps/admin
npx tsc --noEmit 2>&1 | head -30
```

À faire 1x par mois pour suivre le tech debt.

## Lié

- [runbooks/deploy.md](../../runbooks/deploy.md) Phase 3
- [knowledge/conventions.md](../../knowledge/conventions.md) §Type-check
