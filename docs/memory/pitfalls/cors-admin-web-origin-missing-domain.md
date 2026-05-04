# Piège — Login admin "Failed to fetch" : nouveau sous-domaine pas dans ADMIN_WEB_ORIGIN

## Symptôme

Tu accèdes à un nouveau sous-domaine d'admin (ex: `app.clubflow.topdigital.re`
post Phase 1 multi-tenant) et au login click "Se connecter" :

```
Identifiants invalides ou compte inaccessible.
[ou]
Failed to fetch
```

Console DevTools du browser :
```
Access to fetch at 'https://api.clubflow.topdigital.re/graphql'
from origin 'https://app.clubflow.topdigital.re' has been blocked
by CORS policy: Response to preflight request doesn't pass access
control check: No 'Access-Control-Allow-Origin' header is present
on the requested resource.
```

Côté serveur l'API tourne, le user existe en DB, mais le browser ne peut
pas même envoyer la requête.

## Contexte

L'API `apps/api` lit `ADMIN_WEB_ORIGIN` (env var) pour configurer le CORS
allowlist. Toute origin pas listée → preflight OPTIONS rejeté avant même
que la requête arrive à GraphQL.

Distinct de [cors-no-origin-prod.md](cors-no-origin-prod.md) qui parle du
SSR vitrine (Origin absente). Ici l'Origin est PRÉSENTE mais pas autorisée.

## Cause root

Quand on ajoute un nouveau front admin (subdomain, custom domain, env de
preview...), il faut **mettre à jour** `ADMIN_WEB_ORIGIN` côté server
**ET** restart `clubflow-api`. Le code n'a aucun mécanisme de discovery.

## Solution

### Add l'origin + restart

```bash
ssh-into-prod "
  sudo sed -i 's|ADMIN_WEB_ORIGIN=\"|ADMIN_WEB_ORIGIN=\"https://app.clubflow.topdigital.re,|' \
    /home/clubflow/clubflow/apps/api/.env
  sudo systemctl restart clubflow-api
  sleep 5
  curl -s -o /dev/null -w 'preflight: %{http_code}\n' \
    -X OPTIONS https://api.clubflow.topdigital.re/graphql \
    -H 'Origin: https://app.clubflow.topdigital.re' \
    -H 'Access-Control-Request-Method: POST' \
    -H 'Access-Control-Request-Headers: content-type,apollo-require-preflight'
"
# Doit afficher : preflight: 204
```

### Format de la var

`ADMIN_WEB_ORIGIN` est une liste **séparée par virgules**, **avec protocole** :

```bash
ADMIN_WEB_ORIGIN="https://app.clubflow.topdigital.re,https://clubflow.topdigital.re,https://portail.clubflow.topdigital.re,https://sksr.re,http://localhost:5173,http://localhost:5174"
```

Inclure systématiquement :
- Tous les sous-domaines d'admin/portail
- Le domaine landing (pour le signup public)
- Les domaines vitrines (custom + wildcard fallback si CORS impacted)
- Les ports localhost dev (5173 admin, 5174 portail, 5175 vitrine, 5176 landing)

## Détection rapide

```bash
# Côté server
sudo grep ADMIN_WEB_ORIGIN /home/clubflow/clubflow/apps/api/.env

# Test preflight depuis l'origin suspect
curl -s -o /dev/null -w '%{http_code}\n' \
  -X OPTIONS https://api.clubflow.topdigital.re/graphql \
  -H 'Origin: https://<NOUVEAU-SUBDOMAIN>' \
  -H 'Access-Control-Request-Method: POST' \
  -H 'Access-Control-Request-Headers: content-type'
# 204 = OK, 400/403 = origin pas whitelistée
```

## Cas observés

- 2026-05-04 (Phase 1 multi-tenant) : `app.clubflow.topdigital.re`
  ajoutée comme nouveau host admin (le `clubflow.topdigital.re` racine
  étant devenu landing marketing). ADMIN_WEB_ORIGIN listait toujours
  `clubflow.topdigital.re` mais pas `app.clubflow.topdigital.re`.
  Login "Failed to fetch" pendant 30 min de debug avant de regarder env.

## Pourquoi NE PAS faire

- ❌ Mettre `ADMIN_WEB_ORIGIN="*"` → expose le CORS à n'importe qui
  (combiné avec credentials: include = catastrophe)
- ❌ Modifier le code CORS direct (apps/api/src/main.ts) au lieu de
  l'env var → durcit la config, casse les autres environnements
- ❌ Désactiver CORS via flag → laisse le risque ouvert

## Lié

- [pitfalls/cors-no-origin-prod.md](cors-no-origin-prod.md) — cas SSR distinct (Origin absente)
- [pitfalls/apollo-server-csrf-cross-origin.md](apollo-server-csrf-cross-origin.md) — autre cause de "Failed to fetch" (CSRF Apollo, à checker en parallèle)
- [docs/runbooks/phase1-bootstrap-multi-tenant.md](../../runbooks/phase1-bootstrap-multi-tenant.md) — section "switch landing ↔ admin"
- `apps/api/.env` côté server : `ADMIN_WEB_ORIGIN`
