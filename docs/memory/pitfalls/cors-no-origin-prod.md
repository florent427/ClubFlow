# Piège — CORS API en `NODE_ENV=production` bloque les appels SSR

## Symptôme

```
$ curl https://sksr.re/
Internal Server Error

$ ssh-into-prod "sudo journalctl -u clubflow-vitrine -n 20 | grep -i cors"
ApolloError: Response not successful: Received status code 500
$ ssh-into-prod "sudo journalctl -u clubflow-api -n 20 | grep -i cors"
Error: Not allowed by CORS
```

## Contexte

L'API NestJS configure CORS strict en production :

```ts
app.enableCors({
  origin: process.env.ADMIN_WEB_ORIGIN.split(','),
  credentials: true,
});
```

→ Toute requête sans `Origin` header **OU** avec un `Origin` non-listé
est rejetée.

Or la vitrine Next.js (SSR) fait des appels **server-to-server** vers
l'API depuis Node.js (`node-fetch` ou Apollo client SSR). Ces requêtes
**n'ont pas de header Origin** (server-to-server, pas browser).

→ API rejette → SSR plante → 500.

## Solution

Ajouter un flag `CORS_ALLOW_NO_ORIGIN` qui autorise les requêtes sans
Origin (i.e. server-to-server uniquement, pas de browser sans Origin
en prod) :

```ts
app.enableCors({
  origin: (origin, cb) => {
    if (!origin && process.env.CORS_ALLOW_NO_ORIGIN === 'true') {
      return cb(null, true);
    }
    if (process.env.ADMIN_WEB_ORIGIN.split(',').includes(origin)) {
      return cb(null, true);
    }
    return cb(new Error('Not allowed by CORS'));
  },
  credentials: true,
});
```

Et dans `apps/api/.env` :

```
CORS_ALLOW_NO_ORIGIN=true
```

## Pourquoi pas juste `origin: '*'`

`origin: '*'` désactive `credentials: true` (cookies, headers Auth).
Et ouvre l'API à n'importe quel site, ce qu'on ne veut pas.

La règle "no Origin = server-to-server = OK" est sûre car en prod
on tourne derrière HTTPS + firewall, et seuls nos services
backend (vitrine SSR, API admin Brevo) ont l'IP loopback pour
appeler l'API.

## Vérification

```bash
# Avec Origin légitime → 200
curl -s -o /dev/null -w "%{http_code}\n" \
  -X POST https://api.clubflow.topdigital.re/graphql \
  -H 'Content-Type: application/json' \
  -H 'Origin: https://clubflow.topdigital.re' \
  -d '{"query":"{__typename}"}'

# Sans Origin (simule SSR) → 200 si CORS_ALLOW_NO_ORIGIN=true
curl -s -o /dev/null -w "%{http_code}\n" \
  -X POST https://api.clubflow.topdigital.re/graphql \
  -H 'Content-Type: application/json' \
  -d '{"query":"{__typename}"}'

# Avec Origin random → 500 (rejected)
curl -s -o /dev/null -w "%{http_code}\n" \
  -X POST https://api.clubflow.topdigital.re/graphql \
  -H 'Content-Type: application/json' \
  -H 'Origin: https://evil.com' \
  -d '{"query":"{__typename}"}'
```

## Lié

- [runbooks/restore-env.md](../../runbooks/restore-env.md)
- [knowledge/infra-prod.md](../../knowledge/infra-prod.md)
