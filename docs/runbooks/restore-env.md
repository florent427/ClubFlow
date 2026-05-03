# Runbook — Restaurer les `.env` de production

> Référencé par `runbooks/deploy.md` (Phase 0) et `pitfalls/env-production-perdus-reset-hard.md`.
> Procédure de re-création des 4 fichiers `.env` essentiels après leur perte
> (ex: `git reset --hard` malheureux ou serveur reprovisionné).

## Quels fichiers ?

Tous sur le serveur Hetzner, sous `/home/clubflow/clubflow/` :

| Fichier | Type | chmod | Critique si manquant |
|---|---|---|---|
| `apps/api/.env` | API server-side | `600` | API ne démarre pas |
| `apps/admin/.env.production` | Vite build-time | `600` | Build admin OK mais 404 GraphQL |
| `apps/member-portal/.env.production` | Vite build-time | `600` | Build portail OK mais 404 GraphQL |
| `apps/vitrine/.env.production` | Next.js build + runtime | `600` | Build OK mais SSR 500 |

## Procédure

### 1. Récupérer les secrets stockés sur le serveur

```bash
ssh-into-prod "sudo cat /root/.clubflow-db-password"
ssh-into-prod "sudo cat /root/.clubflow-storagebox-password"
```

⚠️ **JWT_SECRET et REFRESH_SECRET** : si perdus, **forcent un re-login global**.
Vérifier d'abord s'ils sont sauvegardés ailleurs (gestionnaire de mots de
passe, backup config, ou GitHub Secrets si exposés en CI). Si totalement
perdus : régénérer + accepter le re-login.

```bash
# Génération de nouveaux secrets si nécessaire
openssl rand -base64 64 | tr -d '\n'
```

### 2. Reconstruire `apps/api/.env`

```bash
ssh-into-prod 'cat > /home/clubflow/clubflow/apps/api/.env <<ENV
NODE_ENV=production
PORT=3000

DATABASE_URL=postgresql://clubflow:CHANGE_ME_DB_PWD@localhost:5432/clubflow

JWT_SECRET=CHANGE_ME_64B_BASE64
REFRESH_SECRET=CHANGE_ME_64B_BASE64
JWT_EXPIRES_IN=7d

CLUB_ID=a8a1041c-ec1e-4e4d-a1cc-cd58247cf982

ADMIN_WEB_ORIGIN=https://clubflow.topdigital.re,https://portail.clubflow.topdigital.re,https://sksr.re,https://www.sksr.re,http://localhost:5173,http://localhost:5174,http://localhost:5175
CORS_ALLOW_NO_ORIGIN=true

SMTP_HOST=
SMTP_PORT=
SMTP_USER=
SMTP_PASS=
ENV
chmod 600 /home/clubflow/clubflow/apps/api/.env'
```

⚠️ **CORS_ALLOW_NO_ORIGIN=true** est obligatoire — sinon vitrine SSR (Next.js
server-to-server vers API) reçoit `500 "Not allowed by CORS"`.
Cf. `pitfalls/cors-no-origin-prod.md`.

### 3. Reconstruire `apps/admin/.env.production`

```bash
ssh-into-prod 'cat > /home/clubflow/clubflow/apps/admin/.env.production <<ENV
VITE_GRAPHQL_HTTP=https://api.clubflow.topdigital.re/graphql
VITE_GRAPHQL_WS=wss://api.clubflow.topdigital.re/chat
VITE_MEDIA_BASE=https://api.clubflow.topdigital.re/media
ENV
chmod 600 /home/clubflow/clubflow/apps/admin/.env.production'
```

### 4. Reconstruire `apps/member-portal/.env.production`

```bash
ssh-into-prod 'cat > /home/clubflow/clubflow/apps/member-portal/.env.production <<ENV
VITE_GRAPHQL_HTTP=https://api.clubflow.topdigital.re/graphql
VITE_GRAPHQL_WS=wss://api.clubflow.topdigital.re/chat
VITE_MEDIA_BASE=https://api.clubflow.topdigital.re/media
ENV
chmod 600 /home/clubflow/clubflow/apps/member-portal/.env.production'
```

### 5. Reconstruire `apps/vitrine/.env.production`

```bash
ssh-into-prod 'cat > /home/clubflow/clubflow/apps/vitrine/.env.production <<ENV
NODE_ENV=production
PORT=5175

VITRINE_API_URL=http://localhost:3000/graphql
VITRINE_PUBLIC_API_URL=https://api.clubflow.topdigital.re/graphql

VITRINE_DEFAULT_CLUB_SLUG=demo-club

VITRINE_REVALIDATE_SECRET=CHANGE_ME_24CHARS
VITRINE_JWT_SECRET=MUST_MATCH_API_JWT_SECRET

VITRINE_ADMIN_URL=https://clubflow.topdigital.re
ENV
chmod 600 /home/clubflow/clubflow/apps/vitrine/.env.production'
```

⚠️ `VITRINE_JWT_SECRET` **doit matcher** `JWT_SECRET` de l'API. Sinon les
JWT signés admin ne sont pas validés par la vitrine côté SSR pour le mode
preview.

### 6. Re-build + restart

```bash
ssh-into-prod 'cd /home/clubflow/clubflow/apps/admin && npx vite build'
ssh-into-prod 'cd /home/clubflow/clubflow/apps/member-portal && npx vite build'
ssh-into-prod 'cd /home/clubflow/clubflow/apps/vitrine && rm -rf .next/cache .next && npm run build'
ssh-into-prod 'sudo systemctl restart clubflow-api clubflow-vitrine'
```

### 7. Smoke test

```bash
for h in clubflow.topdigital.re portail.clubflow.topdigital.re sksr.re; do
  echo "$(curl -s -o /dev/null -w '%{http_code}' https://$h/) $h"
done
curl -s -o /dev/null -w "%{http_code}\n" \
  -X POST https://api.clubflow.topdigital.re/graphql \
  -H 'Content-Type: application/json' \
  -H 'Origin: https://clubflow.topdigital.re' \
  -d '{"query":"{__typename}"}'
```

Tous doivent renvoyer `200`.

## Prévention

- Ne **JAMAIS** faire `git add -A` sur le serveur (ça embarque les `.env`).
- Le `.gitignore` racine doit toujours contenir `.env` et `.env.production`.
- Considérer un backup chiffré des `.env` sur Storage Box (à mettre en place).
- Voir `pitfalls/env-production-perdus-reset-hard.md` pour le scénario qui
  a causé l'incident initial.
