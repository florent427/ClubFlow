# Piège — Next.js : `process.env.X` côté client n'a QUE les `NEXT_PUBLIC_*`

## Symptôme

L'app landing en prod crash sur `/signup` avec :
```
Application error: a client-side exception has occurred while loading
clubflow.topdigital.re (see the browser console for more information).
```

Console montre `fetch http://localhost:3000/graphql failed` ou
`Connection refused` — alors que la prod a bien une API distante.

## Contexte

Dans Next.js 15 (App Router), seules les variables d'environnement
préfixées **`NEXT_PUBLIC_`** sont injectées dans le bundle JavaScript
client. Toutes les autres ne sont accessibles que :
- Côté `Server Components`
- Côté API routes (`app/api/.../route.ts`)
- Pendant le `npm run build` (server-side render)

Côté client (`'use client'`), `process.env.LANDING_API_URL` est
**`undefined`**.

## Cause root

Code typique buggé :
```typescript
// apps/landing/src/lib/graphql.ts (use client)
const PUBLIC_API_URL =
  process.env.NEXT_PUBLIC_LANDING_API_URL ??
  process.env.LANDING_API_URL ??         // ← undefined côté client !
  'http://localhost:3000/graphql';        // fallback dev → crash chez user
```

`apps/landing/.env.production` contenait :
```
LANDING_API_URL=https://api.clubflow.topdigital.re/graphql
```

Côté SSR (build), le fallback `LANDING_API_URL` marchait. Côté client
(JS qui tourne dans le browser de l'utilisateur), il était `undefined`,
donc fallback final sur `localhost:3000` → fetch vers le PC du user
qui n'a pas d'API qui tourne → ECONNREFUSED → crash React.

## Solution

### Toujours utiliser `NEXT_PUBLIC_*` pour les vars du client

Dans `.env.production` :
```bash
# Pour le client (bundlé dans le JS public)
NEXT_PUBLIC_LANDING_API_URL=https://api.clubflow.topdigital.re/graphql
NEXT_PUBLIC_LANDING_ADMIN_URL=https://app.clubflow.topdigital.re

# Pour le SSR uniquement (jamais bundlé client)
LANDING_API_URL=https://api.clubflow.topdigital.re/graphql
```

Et dans le code :
```typescript
const PUBLIC_API_URL =
  process.env.NEXT_PUBLIC_LANDING_API_URL ?? // ← seul fallback réel côté client
  'http://localhost:3000/graphql';            // dev local OK
```

### ⚠️ Toute modif d'env nécessite un REBUILD

Les vars `NEXT_PUBLIC_*` sont **inlinées au build time**, pas lues à
l'exec. Donc :
```bash
# Modifier .env.production
sudo systemctl restart clubflow-landing  # ❌ ne suffit PAS

# Bonne séquence :
npm run build              # rebuild avec les nouvelles vars
sudo systemctl restart clubflow-landing
```

## Détection rapide

```bash
# Grep le bundle client pour vérifier la valeur réelle injectée :
grep -or 'http://localhost:3000\|NEXT_PUBLIC_X' \
  /home/clubflow/clubflow/apps/landing/.next/static/chunks/

# Si tu vois encore localhost:3000 alors que tu pensais avoir fixé :
# → le rebuild n'a pas eu lieu OU la var manquait
```

Test browser direct :
```javascript
// Console DevTools sur la page :
fetch(window.location.origin.replace(':5176', ':3000') + '/graphql')
  .then(r => console.log(r.status))
  .catch(e => console.log('ECONNREFUSED ?', e.message))
```

## Cas observés

- 2026-05-04 (Phase 1 multi-tenant signup) : `apps/landing/.env.production`
  avait `LANDING_API_URL` (sans préfixe). Le fetch côté client tombait sur
  localhost:3000 chez chaque user → "Application error" au submit du
  signup form. Fix : ajouter `NEXT_PUBLIC_LANDING_API_URL` + rebuild.

## Pourquoi NE PAS faire

- ❌ Croire que `process.env.X` (sans NEXT_PUBLIC_) marche partout
- ❌ Ajouter la var en `.env.production` sans rebuild → pas inlinée
- ❌ Mettre des SECRETS dans des `NEXT_PUBLIC_*` → exposés dans le JS public

## Lié

- [apps/landing/src/lib/graphql.ts](../../../apps/landing/src/lib/graphql.ts)
- Doc Next.js env vars : https://nextjs.org/docs/app/building-your-application/configuring/environment-variables
