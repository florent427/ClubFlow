# Runbook — Déploiement prod

> Référencé par le skill `/deploy`. Si le pipeline auto échoue, ce runbook
> permet de faire le déploiement à la main.

## Pipeline auto (cas nominal — RIEN À FAIRE)

```
git push main
   ├─ deploy.yml (immédiat) → Hetzner SSH → clubflow-deploy.sh → smoke OK
   └─ release-please.yml :
        → ouvre PR de release (CHANGELOG auto)
        → AUTO-MERGE squash via API
        → tag vX.Y.Z + GitHub Release publiée
        → deploy.yml retrigger sur tag → re-deploy + smoke OK
```

## Déploiement manuel (depuis laptop)

```bash
"/c/Windows/System32/OpenSSH/ssh.exe" clubflow@89.167.79.253 \
  "sudo /usr/local/bin/clubflow-deploy.sh"
```

## Déploiement manuel (depuis GitHub UI)

```bash
gh workflow run deploy.yml -f tag=main
gh run watch
```

## Que fait le script `clubflow-deploy.sh` v2

7 phases idempotentes :

1. **Phase 0 — Pre-checks `.env`** : vérifie présence des 4 fichiers requis
   (`apps/api/.env`, `apps/{admin,member-portal,vitrine}/.env.production`).
   Exit early si manquant → cf. `runbooks/restore-env.md`.

2. **Phase 1 — git pull** : `git fetch origin && git reset --hard origin/main`.
   Si déjà à jour → exit 0 (sauf `FORCE=1`).

3. **Phase 2 — API** : `npm ci` + `prisma generate` + `prisma db push` +
   `nest build`. ⚠️ `db push` (pas `migrate deploy`) — cf. ADR-0003.

4. **Phase 3 — Admin** : `npm ci` + `npx vite build` (bypass `tsc -b` —
   cf. pitfall `build-admin-strict-ts.md`).

5. **Phase 4 — Portail** : idem admin.

6. **Phase 5 — Vitrine** : `npm ci` + `rm -rf .next/cache .next` (CRITIQUE,
   cf. pitfall `nextjs-isr-cache-stale.md`) + `npm run build` (Next.js).

7. **Phase 6 — Restart services** : `systemctl restart clubflow-api clubflow-vitrine`
   + `systemctl reload caddy`.

8. **Phase 7 — Smoke test** : `curl` sur 4 vhosts (200 attendu) + GraphQL
   probe sur API. Exit 1 si un seul échec.

## Logs

- Logs cumulatifs script : `/var/log/clubflow-deploy.log`
- Logs API : `/var/log/clubflow-api.log`
- Logs Vitrine : `/var/log/clubflow-vitrine.log`
- Logs Caddy : `/var/log/caddy/<vhost>.log`
- Logs systemd : `journalctl -u clubflow-api -u clubflow-vitrine -u caddy`

## En cas d'échec

| Symptôme | Action |
|---|---|
| Phase 0 : `.env` manquant | `runbooks/restore-env.md` |
| Phase 1 : `git fetch` Permission denied | `pitfalls/ssh-passphrase-non-tty.md` |
| Phase 2 : Prisma error | `pitfalls/prisma-migration-order-broken.md` |
| Phase 5 : vitrine build "Cannot resolve entry" | check `apps/vitrine/.env.production` (VITRINE_API_URL) |
| Phase 7 : sksr.re 500 "VITRINE_API_URL manquant" | `pitfalls/env-production-perdus-reset-hard.md` |
| Phase 7 : api/graphql 500 "Not allowed by CORS" | check `CORS_ALLOW_NO_ORIGIN=true` dans api/.env |
| Phase 7 : admin/portail 403 | `pitfalls/caddy-perms-home-clubflow.md` |
| Smoke OK mais sksr.re 404 routes | `runbooks/seed-vitrine-pages.md` |

## Rollback

Cf. `runbooks/rollback.md`.

## Smoke test à faire en complément (depuis laptop)

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
