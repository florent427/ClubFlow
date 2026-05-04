# Piège — Apollo Server v5 bloque les POST cross-origin sans header non-simple

## Symptôme

Toute requête POST vers `/graphql` depuis un autre origin que celui d'Apollo
renvoie HTTP 400 :

```json
{
  "errors": [{
    "message": "This operation has been blocked as a potential Cross-Site
                Request Forgery (CSRF). Please either specify a 'content-type'
                header (with a type that is not one of
                application/x-www-form-urlencoded, multipart/form-data,
                text/plain) or provide a non-empty value for one of the
                following headers: x-apollo-operation-name,
                apollo-require-preflight",
    "extensions": { "code": "BAD_REQUEST" }
  }]
}
```

Côté browser → "Failed to fetch" ou page "Application error".

## Contexte

Apollo Server v4+ active par défaut un middleware CSRF qui rejette les
"simple requests" cross-origin (pas de preflight CORS déclenché). Stratégie
inverse de l'habitude : au lieu de whitelister les origins, Apollo exige
**au moins un header non-simple** dans la requête, ce qui force le browser
à faire un preflight OPTIONS (et donc une vérif CORS classique).

Headers acceptés pour bypasser le CSRF :
- `apollo-require-preflight: true`
- `x-apollo-operation-name: <nom>`
- Content-Type qui n'est PAS dans : `application/x-www-form-urlencoded`,
  `multipart/form-data`, `text/plain`

⚠️ `Content-Type: application/json` est PAS dans la liste des "simple"
mais Apollo le considère comme tel pour des raisons de compatibilité
historique → il NE SUFFIT PAS à bypasser CSRF.

## Cause root

Apollo Server CSRF prevention :
https://www.apollographql.com/docs/apollo-server/security/cors/#preventing-cross-site-request-forgery-csrf

Activé par défaut depuis v4. Empêche un site malicieux de POST vers un
endpoint GraphQL en abusant des cookies de session de l'utilisateur.

## Solution

### Côté client : toujours envoyer `apollo-require-preflight`

```typescript
// fetch direct (apps/landing/src/lib/graphql.ts)
await fetch(API_URL, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'apollo-require-preflight': 'true',  // CRITIQUE
  },
  body: JSON.stringify({ query, variables }),
});

// Apollo Client : ajouter dans HttpLink ou link middleware
const httpLink = new HttpLink({
  uri,
  headers: { 'apollo-require-preflight': 'true' },
});
```

### Côté curl (debug/scripts)

```bash
curl -X POST https://api.clubflow.topdigital.re/graphql \
  -H 'apollo-require-preflight: true' \
  -H 'Content-Type: application/json' \
  -d '{"query":"{__typename}"}'
```

### Alternative : utiliser `x-apollo-operation-name`

Si tu fais une mutation/query nommée :
```typescript
headers: { 'x-apollo-operation-name': 'CreateClubAndAdmin' }
```

C'est ce qu'Apollo Client utilise par défaut quand tu utilises
`useMutation`/`useQuery` avec une operation nommée → si le name est dans
le query, ça marche. Sinon, ajouter `apollo-require-preflight`.

## Détection rapide

```bash
# Test sans header → 400
curl -s -X POST https://api.clubflow.topdigital.re/graphql \
  -H 'Content-Type: application/json' \
  -d '{"query":"{__typename}"}' \
  | jq '.errors[0].extensions.code'
# → "BAD_REQUEST"

# Test avec header → 200
curl -s -X POST https://api.clubflow.topdigital.re/graphql \
  -H 'Content-Type: application/json' \
  -H 'apollo-require-preflight: true' \
  -d '{"query":"{__typename}"}'
# → {"data":{"__typename":"Query"}}
```

## Cas observés

- 2026-05-04 (Phase 1 multi-tenant signup) : 4 occurrences :
  1. Test signup via curl SSH server → CSRF block
  2. Test JS fetch via Chrome → CSRF block
  3. apps/landing gqlRequest sans le header → "Application error" en prod
  4. Test admin login → "Failed to fetch" (combiné avec CORS missing origin)

## Pourquoi NE PAS faire

- ❌ Désactiver CSRF Apollo (`csrfPrevention: false` dans ApolloServer
  config) → expose au CSRF attack via image/iframe POST
- ❌ Utiliser `Content-Type: text/plain` pour bypasser → casse le parsing
  JSON côté serveur
- ❌ Croire que `Content-Type: application/json` suffit → faux

## Lié

- [apps/landing/src/lib/graphql.ts](../../../apps/landing/src/lib/graphql.ts) — fetch direct avec header
- [apps/admin/src/lib/apollo.ts](../../../apps/admin/src/lib/apollo.ts) — Apollo Client (operation name suffit)
- [pitfalls/cors-admin-web-origin-missing-domain.md](cors-admin-web-origin-missing-domain.md) — symptôme browser jumeau (Failed to fetch)
- Doc Apollo : https://www.apollographql.com/docs/apollo-server/security/cors/
