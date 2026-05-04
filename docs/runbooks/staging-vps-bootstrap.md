# Runbook — Bootstrap d'un environnement staging dédié (2e VPS)

> Mise en place complète d'un environnement staging ClubFlow sur un
> VPS Hetzner dédié, isolé de la prod. Permet de tester en conditions
> réelles (vrais domaines, vrai TLS, vrai SMTP/captcha sandbox) avant
> de merger sur main.

## Architecture cible

```
                ┌──────────────────────────────────┐
                │ VPS prod   (89.167.79.253)       │
                │  clubflow.topdigital.re          │ ← branche main
                │  app.* / api.* / portail.*       │
                │  sksr.re                         │
                └──────────────────────────────────┘

                ┌──────────────────────────────────┐
                │ VPS staging  (NEW)               │
                │  staging.clubflow.topdigital.re  │ ← branche staging
                │  staging.app.* / staging.api.*   │
                │  staging.portail.*               │
                │  *.staging.*                     │
                └──────────────────────────────────┘
```

DB Postgres séparée par VPS (pas de partage). SMTP/captcha = clés sandbox
distinctes des clés prod.

## Coût

CX22 Helsinki = ~5€/mois. Suffisant pour l'usage staging perso.

## Procédure

### 1. Provisionner le VPS Hetzner

Via console Hetzner (ou API si tu as un token avec rights `servers:write`) :
- Type : **CX22** (2 vCPU, 4 Go RAM, 40 Go SSD)
- Image : **Ubuntu 24.04**
- Datacenter : **Helsinki** (même que prod, latence min)
- Nom : `clubflow-staging`
- Network : default
- SSH keys : ajoute ta clé publique Florent + une clé GitHub Actions dédiée

Une fois créé, note l'**IP IPv4** (et IPv6 si besoin).

### 2. DNS Cloudflare (5 records)

Via skill `/provision` (les commandes existent déjà), ajouter :
- `staging.clubflow.topdigital.re`         A `<IP_STAGING>`
- `staging.app.clubflow.topdigital.re`     A `<IP_STAGING>`
- `staging.api.clubflow.topdigital.re`     A `<IP_STAGING>`
- `staging.portail.clubflow.topdigital.re` A `<IP_STAGING>`
- `*.staging.clubflow.topdigital.re`       A `<IP_STAGING>`

Tous en **DNS only** (pas de proxy CF).

### 3. SSH au VPS + créer user `clubflow`

```bash
ssh root@<IP_STAGING>
# Le bootstrap script crée le user, mais en attendant :
adduser --disabled-password --gecos "" clubflow
mkdir -p /home/clubflow/.ssh
cp ~/.ssh/authorized_keys /home/clubflow/.ssh/
chown -R clubflow:clubflow /home/clubflow/.ssh
chmod 700 /home/clubflow/.ssh
chmod 600 /home/clubflow/.ssh/authorized_keys
exit
```

### 4. Lancer le bootstrap

```bash
ssh root@<IP_STAGING> "curl -sSL https://raw.githubusercontent.com/florent427/ClubFlow/main/bin/bootstrap-staging-vps.sh | bash"
```

Le script :
- Installe Node 20, PostgreSQL 16, Caddy, ufw, fail2ban
- Crée user `clubflow` + sudo NOPASSWD
- Crée DB `clubflow_staging`
- Clone le repo + checkout branche `staging`
- Installe Caddyfile staging + 5 systemd units staging
- Installe `.env` templates
- Active ufw (22/80/443 only)
- Lance le 1er deploy

⚠️ Le 1er deploy va probablement fail (env vars vides : SMTP_USER, JWT_SECRET, etc.). C'est normal — éditer ensuite et relancer.

### 5. Compléter les `.env` staging

```bash
ssh clubflow@<IP_STAGING>
# Édite chaque .env avec les vraies valeurs (clés Brevo sandbox, JWT_SECRET)
sudo nano /home/clubflow/clubflow/apps/api/.env
sudo nano /home/clubflow/clubflow/apps/landing/.env.production
# etc.
```

Variables critiques à régénérer **distinctes de la prod** :
- `JWT_SECRET` (utilise `openssl rand -base64 32`)
- `DATABASE_URL` password (par défaut `staging_dev_password_change_me` dans bootstrap — change-le)
- `SMTP_USER` + `SMTP_PASS` (génère une SMTP key Brevo dédiée staging)
- `HCAPTCHA_SECRET` + `NEXT_PUBLIC_HCAPTCHA_SITE_KEY` (sandbox keys hCaptcha doc)

### 6. GitHub Actions secrets

Sur https://github.com/florent427/ClubFlow/settings/secrets/actions :
- `STAGING_HOST` → IP du VPS staging
- `SSH_PRIVATE_KEY_STAGING` → la clé privée correspondant à la pub key ajoutée au VPS

### 7. Premier deploy auto

```bash
git checkout -b staging
git push -u origin staging
# → déclenche .github/workflows/deploy-staging.yml
gh run watch
```

Si OK : https://staging.clubflow.topdigital.re répond.

## Workflow quotidien

```bash
# Développer une feature
git checkout -b feat/X main
# code...

# Tester en conditions staging
git checkout staging
git merge feat/X
git push           # → deploy auto sur staging.*
gh run watch
# Test live sur staging.app.clubflow.topdigital.re

# Si OK → merge sur main (deploy prod)
git checkout main
git merge feat/X
git push           # → deploy auto sur clubflow.topdigital.re
```

## Reset DB staging (rollback rapide)

Si la DB staging est cassée :
```bash
ssh clubflow@<IP_STAGING> "
  sudo -u postgres dropdb clubflow_staging
  sudo -u postgres createdb -O clubflow_staging clubflow_staging
  cd /home/clubflow/clubflow/apps/api && npx prisma db push --accept-data-loss
"
```

## Backups

Pas de backup auto staging par défaut (data jetable). Si besoin :
- Adapter `bin/clubflow-backup.sh` pour pointer sur la DB staging
- Configurer un Storage Box Hetzner séparé (ou simple cron `pg_dump`)

## Quand ça marche pas

| Symptôme | Action |
|---|---|
| `git push staging` ne déclenche pas le workflow | check `.github/workflows/deploy-staging.yml` présent + secret `SSH_PRIVATE_KEY_STAGING` set |
| API staging fail au boot | check `/var/log/clubflow-api-staging.log` |
| Caddy refuse vhost staging | check `/etc/caddy/Caddyfile` (doit être Caddyfile.staging) |
| Vitrine subdomain `<X>.staging.X` cert TLS fail | check endpoint `/v1/vitrine/check-domain` côté API staging |
| Smoke test 502 | services pas restart proprement → `systemctl status clubflow-api-staging` |

## Rollback complet

Pour détruire tout l'environnement staging (cleanup) :

1. Console Hetzner → delete server `clubflow-staging`
2. CF API → delete les 5 DNS records `staging.*`
3. GitHub → delete branche `staging` + secrets staging
4. Local : `git branch -D staging`

## Lié

- [.github/workflows/deploy-staging.yml](../../.github/workflows/deploy-staging.yml)
- [bin/bootstrap-staging-vps.sh](../../bin/bootstrap-staging-vps.sh)
- [bin/clubflow-deploy-staging.sh](../../bin/clubflow-deploy-staging.sh)
- [bin/Caddyfile.staging](../../bin/Caddyfile.staging)
- [.claude/skills/provision/SKILL.md](../../.claude/skills/provision/SKILL.md) — provisioning DNS Cloudflare
- [docs/runbooks/deploy.md](deploy.md) — procédure deploy prod
