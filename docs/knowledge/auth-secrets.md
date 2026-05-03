# Authentification, secrets, comptes ClubFlow

> ⚠️ Ce fichier liste les EMPLACEMENTS et l'usage des secrets, pas leurs valeurs.
> Les valeurs réelles sont sur le serveur ou dans GitHub Secrets, jamais committées.

## Comptes admin

### Admin web ClubFlow
- **Email** : `admin@clubflow.local`
- **Password initial** : `ClubFlowAdmin2026!` (à changer après 1er login)
- **CLUB_ID** : `a8a1041c-ec1e-4e4d-a1cc-cd58247cf982`

## Secrets sur le serveur

```bash
# DB password Postgres (user clubflow)
sudo cat /root/.clubflow-db-password

# Storage Box subaccount (chrooté /backups/)
sudo cat /root/.clubflow-storagebox-password
```

## Secrets dans `apps/api/.env` (chmod 600)

| Variable | Source | Notes |
|---|---|---|
| `DATABASE_URL` | `/root/.clubflow-db-password` | format Prisma : `postgresql://clubflow:PWD@localhost:5432/clubflow` |
| `JWT_SECRET` | random base64 64-byte (généré au setup) | doit matcher `VITRINE_JWT_SECRET` |
| `JWT_EXPIRES_IN` | `7d` (prod) | `none` en dev |
| `REFRESH_SECRET` | random base64 64-byte | distinct de JWT_SECRET |
| `CLUB_ID` | `a8a1041c-ec1e-4e4d-a1cc-cd58247cf982` | club seedé |
| `ADMIN_WEB_ORIGIN` | liste CORS | https domaines + localhost dev |
| `CORS_ALLOW_NO_ORIGIN` | `true` | ⚠️ requis pour SSR vitrine → API |
| `PORT` | `3000` | service systemd |
| `NODE_ENV` | `production` | strict CORS, perfs |
| `SMTP_HOST` etc. | (vides en mode placeholder) | Brevo à configurer |

## Secrets dans `apps/vitrine/.env.production` (chmod 600)

| Variable | Valeur |
|---|---|
| `VITRINE_API_URL` | `http://localhost:3000/graphql` (server-side, jamais exposée client) |
| `VITRINE_PUBLIC_API_URL` | `https://api.clubflow.topdigital.re/graphql` |
| `VITRINE_DEFAULT_CLUB_SLUG` | `sksr` |
| `VITRINE_REVALIDATE_SECRET` | random 24-char (généré au setup) |
| `VITRINE_EDIT_COOKIE_NAME` | `clubflow_vitrine_edit` |
| `VITRINE_ADMIN_URL` | `https://clubflow.topdigital.re` |
| `VITRINE_JWT_SECRET` | **doit matcher `JWT_SECRET` de l'API** |

## Secrets dans `apps/{admin,member-portal}/.env.production`

```
VITE_GRAPHQL_HTTP=https://api.clubflow.topdigital.re/graphql
VITE_GRAPHQL_WS=wss://api.clubflow.topdigital.re/chat
VITE_MEDIA_BASE=https://api.clubflow.topdigital.re/media
```

## Clés SSH

| Clé | Emplacement | Usage |
|---|---|---|
| `~/.ssh/id_ed25519` (laptop) | passphrase-protégée | SSH manuel admin |
| `~/.ssh/id_ed25519_clubflow_gha` (laptop) | sans passphrase | uniquement pour copier vers GitHub Secrets |
| `/home/clubflow/.ssh/authorized_keys` (serveur) | 2 clés acceptées | clé laptop + clé GHA |

## GitHub Secrets

| Nom | Source | Usage |
|---|---|---|
| `SSH_PRIVATE_KEY` | `~/.ssh/id_ed25519_clubflow_gha` | utilisé par `.github/workflows/deploy.yml` pour SSH |
| `GITHUB_TOKEN` | auto-fourni par GHA | utilisé par release-please |

## Rotation des secrets

Cf. `runbooks/rotate-secrets.md` pour la procédure complète (DB password,
JWT, clé SSH GHA, password Storage Box).

## Procédure de restore (si .env perdus)

Cf. `runbooks/restore-env.md` — copy-paste d'une seule commande SSH qui
recrée les 4 fichiers `.env` proprement.

## Ne JAMAIS commit

- `apps/*/.env` ou `apps/*/.env.production` (gitignored)
- Clés privées SSH
- Passwords en plain text dans le code
- Tokens JWT capturés en debug

⚠️ Si un secret fuite : rotation IMMÉDIATE via `runbooks/rotate-secrets.md` +
notifier dans `memory/pitfalls/secret-leak-<date>.md` (avec post-mortem).
