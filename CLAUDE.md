# CLAUDE.md — ClubFlow

> Mémo opérationnel pour Claude (et tout assistant IA) qui débarque sur ce repo.
> Ce fichier capture **les choix techniques tranchés** + **les opérations courantes**
> (modif, versionning, production, dépannage SSH/serveur). Il évite de
> re-déduire le contexte à chaque session.

---

## 1. Vue d'ensemble du produit

**ClubFlow** = SaaS multi-tenant de gestion de club sportif/associatif.
Multi-clubs, multi-rôles, RGPD, hébergé en France/EU.

Modules livrés (v1) : Members, Families, Adhésions/Cart, Billing, Accounting,
Comms (Email/Push/Messaging interne), Messaging WS, Planning, Events, Projects,
Booking, Shop, Sponsoring, Subsidies, Vitrine site public, Blog, Settings,
Agent IA (Aïko), System Admin.

Conception détaillée : `ClubFlow_Conception_Provisoire.md` (43 KB).

---

## 2. Stack technique (tranchée)

| Couche | Tech | Version | Notes |
|---|---|---|---|
| Backend API | NestJS + GraphQL (Apollo Server v5) | 11.x | TypeScript strict, Prisma client, Socket.IO `/chat` |
| ORM | Prisma | 6.x | PostgreSQL connector, code-first migrations |
| Database | PostgreSQL | **16** | Pas 15, pas 17 — tuning 8 GB hardcodé pour prod |
| Cache/Queue (optionnel) | Redis | 7.x | Sessions Apollo, throttling |
| Admin web | React + Vite + Apollo Client v4 | — | Port dev 5173 |
| Member portal web | React + Vite + Apollo Client v4 | — | Port dev 5174 |
| Mobile membre | Expo SDK 55 + RN 0.83 | — | Apollo, socket.io-client |
| Mobile admin | Expo SDK 55 + RN 0.83 | — | (en cours), package partagé `@clubflow/mobile-shared` |
| Vitrine publique | React + Vite | — | Port dev 5175 |
| Auth | JWT + refresh tokens | — | Bearer + `X-Club-Id` header |
| Mail dev | Mailpit (Docker) | — | UI sur 8025, SMTP 1025 |
| Mail prod | **Brevo** (ex-Sendinblue) | — | Multi-domain, plan gratuit 300 mails/jour |
| OCR | OpenRouter (Claude Sonnet 4.5 vision) | — | Pipeline 3-call, sharp + pdf-parse v1.1.1 + pdf-to-img v4 |

### Décisions piège (à NE PAS toucher sans réfléchir)
- **`pdf-parse v1.1.1` épinglé** (pas v2 — conflit pdfjs-dist avec pdf-to-img v4)
- **`pdf-to-img v4` chargé via `new Function('s', 'return import(s)')`** car ESM-only sur tsconfig CJS
- **Sharp prebuilds** : OK ARM64 et x86_64, pas besoin de libvips system
- **`isBank` par RÔLE débit/crédit**, jamais par code compte (cf. commit `3480fbc`)
- **Apollo refetchQueries by name** systématique sur les mutations (sinon cache stale)
- **`DATABASE_URL` au format Prisma** : `postgresql://user:pwd@host:5432/db`

---

## 3. Repo structure

```
clubflow/
├── apps/
│   ├── api/              NestJS API (port 3000)
│   ├── admin/            Web admin Vite (port 5173)
│   ├── member-portal/    Web portail membre Vite (port 5174)
│   ├── vitrine/          Site public Vite (port 5175)
│   ├── mobile/           Expo membre
│   └── mobile-admin/     Expo admin (en cours)
├── packages/
│   └── mobile-shared/    Theme + UI + Apollo factory partagés mobile
├── docker-compose.yml    Postgres + Mailpit + Postfix relay
├── docs/                 Runbooks, conception
├── .claude/skills/       Skills custom (ex : /restart)
└── CLAUDE.md             ← CE FICHIER
```

`package.json` racine n'existe pas (pas de monorepo npm workspaces global).
Chaque app gère ses dépendances.

---

## 4. Démarrage local

### Pré-requis
- Node.js 20 LTS
- Docker Desktop (pour Postgres + Mailpit) — l'utilisateur le démarre lui-même
- Git Bash ou PowerShell

### Premier setup
```bash
# 1. Postgres + Mailpit
docker compose up -d db mailpit

# 2. API
cd apps/api
npm ci
npx prisma migrate deploy
npm run db:seed     # crée admin@clubflow.local
npm run start:dev   # port 3000

# 3. Admin web
cd ../admin
npm ci
npm run dev         # port 5173

# 4. (équivalent pour member-portal, vitrine, mobile)
```

### Skill `/restart` pour redémarrer toute la stack
Defined in `.claude/skills/restart/SKILL.md`. Tue les processus sur 3000/5173/5174/8081/1025/8025
puis relance API + Admin + Portal + Metro Expo + Mailpit en background.
**Ne touche pas Docker** (l'utilisateur le gère manuellement).

### Variables d'environnement
- Racine : `.env.example` (DATABASE_URL, JWT_SECRET, PORT, CORS)
- API : `apps/api/.env.example` (TELEGRAM_BOT_TOKEN, OPENROUTER_API_KEY, etc.)
- Mobile : `apps/mobile/.env` (EXPO_PUBLIC_API_BASE — IP LAN, doit matcher `ipconfig`)

---

## 5. Workflow modif → versioning → push live (LE PROCESS)

### Principe immuable
**Toute modif passe par git.** Jamais de SSH-edit en prod. La prod est un miroir
de `main` — point. Si tu corriges en SSH, tu introduis de la dette : la prochaine
release écrasera ton fix.

```
┌─ LOCAL ─────────────────────────┐    ┌─ GITHUB ──────┐    ┌─ PROD ────────────┐
│ branche feat/* ou fix/*         │    │ origin/main   │    │ clubflow.topdig.. │
│ → code + npx tsc --noEmit       │ →  │ + tag vX.Y.Z  │ →  │ + sksr.re         │
│ → /restart pour tester          │    │ + release notes│   │                   │
│ → commit conventional FR        │    │               │    │ via /deploy       │
└─────────────────────────────────┘    └───────────────┘    └───────────────────┘
```

### A. Convention de commits (Conventional Commits FR)

```
<type>(<scope>): <description en français impératif>

[corps optionnel — explique le POURQUOI, pas le QUOI]

[footer optionnel — refs/closes #issue, BREAKING CHANGE: ...]

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```

**Types** :
| Type | Bump SemVer | Quand |
|---|---|---|
| `feat` | MINOR | Nouvelle feature visible utilisateur |
| `fix` | PATCH | Bug corrigé |
| `refactor` | aucun | Restructuration sans changer le comportement |
| `perf` | PATCH | Amélioration performance |
| `docs` | aucun | CLAUDE.md, README, runbooks |
| `chore` | aucun | Deps, config, outillage, CI |
| `style` | aucun | Formatage |
| `test` | aucun | Ajout/modif de tests |
| `BREAKING CHANGE:` (footer) | MAJOR | Casse une API publique |

**Scopes** : `admin`, `api`, `mobile`, `mobile-admin`, `vitrine`, `portail`,
`accounting`, `adhesions`, `comms`, `messaging`, `members`, `ocr`, `infra`, `db`.

**Exemples bons** :
```
feat(vitrine): nouvelle page Stages avec calendrier sessions
fix(accounting): isBank par RÔLE débit/crédit (drawer Modifier inopérant)
refactor(comms): refonte multi-canal + audience riche
chore(infra): script clubflow-deploy.sh + smoke test post-deploy
```

**Règle** : 1 commit = 1 intention. Pas de "wip" / "fix typo" en prod.

### B. Branches

- `main` : prod, **toujours déployable**. Protégée (futur : règles GitHub
  empêchant push direct).
- `feat/<scope>-<court-titre>` : nouvelle feature
- `fix/<scope>-<court-titre>` : bug fix
- `hotfix/<scope>-<urgence>` : bug bloquant prod, à merger ASAP
- `claude/*` : worktrees Claude auto-créés (n'apparaissent pas sur GitHub)

### C. Cycle de vie d'une modif (ce que TU fais)

```bash
# 1. Démarre depuis main à jour
cd /c/Users/flore/ClubFlow
git checkout main && git pull
git checkout -b feat/vitrine-stages

# 2. Code + teste localement
docker compose up -d db mailpit   # si pas déjà up
# ... édite les fichiers ...
# Tu peux dire à Claude "/restart" pour relancer la stack dev

# 3. Type-check obligatoire
cd apps/api && npx tsc --noEmit
cd ../admin && npx tsc --noEmit  # ⚠️ certaines pages ont des erreurs TS, voir §12 pièges

# 4. Commit atomique (Claude propose le message, tu valides)
git add <fichiers liés à 1 intention>
git commit -m "feat(vitrine): page Stages avec calendrier sessions

Why: les visiteurs cherchent les dates de stages avant inscription.
Composant calendrier réutilisable pour autres sections événements.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"

# 5. Push + PR (même solo — historique propre)
git push -u origin feat/vitrine-stages
gh pr create --title "feat(vitrine): page Stages" --body "$(cat <<'EOF'
## Summary
- Nouvelle page /stages avec liste sessions à venir
- Composant SessionCard réutilisable
- Mise à jour menu vitrine

## Test plan
- [x] Type-check OK
- [x] Local : http://localhost:5175/stages
- [ ] Prod après deploy
EOF
)"

# 6. Tu relis sur github.com (Claude peut le faire pour toi)
gh pr view --web

# 7. Merge — squash pour aplatir l'historique main
gh pr merge --squash --delete-branch

# 8. Deploy — UNE commande
"/c/Windows/System32/OpenSSH/ssh.exe" clubflow@89.167.79.253 \
  "sudo /usr/local/bin/clubflow-deploy.sh"
# OU via le skill `/deploy` quand il sera créé
```

### D. Versioning sémantique + tags + release notes (AUTOMATISÉ)

**Pas de release manuelle**. On utilise **`release-please`** (Google) qui :
- Lit les commits Conventional depuis le dernier tag
- Calcule le bump SemVer (`feat` → minor, `fix` → patch, `BREAKING` → major)
- Génère un `CHANGELOG.md` group par catégorie
- Ouvre une PR "release vX.Y.Z" prête à merger
- Au merge → crée le tag git + GitHub Release avec notes auto

**Setup en 5 min** (à faire une fois) :

```bash
# .github/workflows/release-please.yml
name: release-please
on:
  push:
    branches: [main]
permissions:
  contents: write
  pull-requests: write
jobs:
  release-please:
    runs-on: ubuntu-latest
    steps:
      - uses: googleapis/release-please-action@v4
        with:
          release-type: simple
          package-name: clubflow
```

```json
// release-please-config.json
{
  "release-type": "simple",
  "include-component-in-tag": false,
  "include-v-in-tag": true,
  "changelog-sections": [
    {"type": "feat", "section": "✨ Features"},
    {"type": "fix", "section": "🐛 Fixes"},
    {"type": "perf", "section": "⚡ Performance"},
    {"type": "refactor", "section": "♻️ Refactor"},
    {"type": "docs", "section": "📝 Docs", "hidden": true},
    {"type": "chore", "section": "🔧 Chore", "hidden": true}
  ]
}
```

```json
// .release-please-manifest.json
{ ".": "0.1.0" }
```

**Comment ça tourne** ensuite :
1. Tu push des commits `feat/fix/...` sur `main`
2. release-please ouvre/met à jour une PR "chore(main): release v0.2.0"
3. La PR contient le `CHANGELOG.md` régénéré + bump version
4. Tu merges la PR quand tu décides "OK on release"
5. release-please crée le tag `v0.2.0` + GitHub Release avec notes
6. (Bonus) Le workflow deploy.yml se déclenche sur le tag → push prod

→ **Zéro effort manuel pour les release notes**. Tes commits SONT les notes.

### E. Script `/usr/local/bin/clubflow-deploy.sh` (sur le serveur)

Voir §13. Idempotent, smoke-testé, log dans `/var/log/clubflow-deploy.log`.

### F. CI/CD GitHub Actions (étape suivante)

Quand le pipeline manuel sera rodé, on ajoutera :

```yaml
# .github/workflows/deploy.yml
name: Deploy to production
on:
  push:
    tags: ['v*']         # déclenche sur tag créé par release-please
  workflow_dispatch:      # permet aussi un trigger manuel
jobs:
  deploy:
    runs-on: ubuntu-latest
    environment: production
    steps:
      - uses: appleboy/ssh-action@v1
        with:
          host: 89.167.79.253
          username: clubflow
          key: ${{ secrets.SSH_PRIVATE_KEY }}
          script: sudo /usr/local/bin/clubflow-deploy.sh
```

→ `git tag v0.3.0` puis `git push origin v0.3.0` = deploy auto en ~2 min.
Avec release-please : un simple merge de la PR de release suffit.

### G. Rollback

Si la dernière release casse la prod :

```bash
# Sur le serveur
cd /home/clubflow/clubflow
sudo -u clubflow git fetch --tags
sudo -u clubflow git reset --hard <tag-précédent>   # ex v0.2.0
sudo /usr/local/bin/clubflow-deploy.sh
```

Si la DB a été corrompue par une migration : restore depuis Storage Box (cf. §9).

### H. Hotfix urgent

```bash
git checkout main && git pull
git checkout -b hotfix/api-crash-checkout
# fix
git commit -m "fix(api): crash checkout quand cart vide

Why: NullPointerException sur viewerCart() ligne 142.
Reproduit en prod le 2026-05-04 (sentry alert).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
gh pr create --title "fix(api): crash checkout cart vide" --body "Hotfix"
gh pr merge --squash --delete-branch
# Deploy immédiat
"/c/Windows/System32/OpenSSH/ssh.exe" clubflow@89.167.79.253 \
  "sudo /usr/local/bin/clubflow-deploy.sh"
# release-please détectera le `fix:` et proposera v0.2.1 dans la prochaine PR de release
```

### I. Règles d'or (Claude doit respecter)

- ❌ **JAMAIS** `git commit` / `git push` sans demande explicite utilisateur
- ❌ **JAMAIS** `git push --force` sur `main`
- ❌ **JAMAIS** skip pre-commit hooks (`--no-verify`) sans accord
- ❌ **JAMAIS** éditer du code directement sur la prod par SSH
- ✅ **TOUJOURS** type-check avant commit (`apps/api` + `apps/admin` au minimum)
- ✅ **TOUJOURS** un commit = une intention (pas de mix feat+fix)
- ✅ **TOUJOURS** la convention FR (Conventional Commits, scope, impératif)
- ✅ **TOUJOURS** une branche dédiée pour > 3 lignes de code (pas direct sur `main`)

---

## 6. Production — Serveur Hetzner

### Identité du serveur
```
Provider     : Hetzner Cloud
Type         : CX33 (4 vCPU x86 Intel/AMD shared, 8 GB RAM, 80 GB NVMe)
Datacenter   : Helsinki (eu-central) — RGPD ok, ping ~245 ms depuis Paris
Public IPv4  : 89.167.79.253
Public IPv6  : 2a01:4f9:c010:99d3::/64
Hostname     : clubflow-prod
OS           : Ubuntu 24.04 LTS
Coût         : 6,99 €/mois HT (server + IPv4)
Console web  : https://console.hetzner.com/projects/14444062/servers/128890739/overview
```

### Storage Box (backups)
```
Type         : BX11 (1 TB)
Datacenter   : Helsinki (HEL1-BX470)
Hostname     : u587664.your-storagebox.de
Subaccount   : u587664-sub1.your-storagebox.de (chrooté /backups/)
SSH/SFTP port: 23 (PAS 22 !)
Console web  : https://console.hetzner.com/projects/14444062/storage-boxes/570065/overview
Coût         : 3,20 €/mois HT
```

Mots de passe stockés sur le serveur :
```bash
sudo cat /root/.clubflow-db-password           # PostgreSQL user clubflow
sudo cat /root/.clubflow-storagebox-password   # Subaccount Storage Box
```

---

## 7. ⚠️ SSH vers le serveur — CRITIQUE pour Claude

### Le piège Windows + Git Bash + ssh-agent

L'utilisateur tourne **Windows + Git Bash**. La clé SSH `~/.ssh/id_ed25519`
est **protégée par passphrase**. Le shell Bash de Claude est **non-interactif**
(pas de TTY) → impossible de saisir la passphrase à la volée.

**La solution** : utiliser le binaire **Windows OpenSSH** (`C:\Windows\System32\OpenSSH\ssh.exe`)
qui parle au **service Windows ssh-agent** dans lequel l'utilisateur a chargé
sa clé une fois pour la session.

### Procédure côté utilisateur (PowerShell admin, à faire 1 fois par boot)
```powershell
Set-Service ssh-agent -StartupType Automatic
Start-Service ssh-agent
ssh-add $env:USERPROFILE\.ssh\id_ed25519
# tape la passphrase une fois
```

### Côté Claude — TOUJOURS utiliser ce binaire
```bash
"/c/Windows/System32/OpenSSH/ssh.exe" clubflow@89.167.79.253 "commande"
```

❌ **NE PAS** utiliser `ssh ...` direct → résout vers `/usr/bin/ssh` de Git Bash
qui ne voit PAS l'ssh-agent Windows → "Permission denied" même clé bonne.

### User à utiliser : `clubflow` (pas `root`)
- Root SSH désactivé (cf. `/etc/ssh/sshd_config.d/99-hardening.conf`)
- `clubflow` a `sudo NOPASSWD:ALL`
- Sa clé SSH = la même que le user laptop (copiée dans `~/.ssh/authorized_keys`)

### ⚠️ fail2ban — éviter de se faire bannir
Le serveur a **fail2ban actif** sur la jail `sshd`. Default :
- 5 tentatives échouées en 10 min → ban 10 min
- Après ban, **TCP timeout** sur port 22 (pas "refused")

L'IP de l'utilisateur **`102.35.136.228`** est whitelistée dans
`/etc/fail2ban/jail.d/clubflow.local`. Si elle change (mobile/VPN), il faut
mettre à jour. Pour vérifier l'IP actuelle :
```bash
curl -s https://ifconfig.me
```

Si banni quand même → attendre 10 min OU se connecter via la **console web**
Hetzner (https://console.hetzner.com/console/14444062/128890739) — mais
attention : ni `root` (pas de mdp) ni `clubflow` (pas de mdp, juste clé SSH)
ne peuvent s'y connecter via TTY direct. Donc en pratique : **attendre**.

Pour **débanner manuellement** une fois reconnecté :
```bash
sudo fail2ban-client unban 102.35.136.228
```

---

## 8. Services tournant en prod

| Service | Port | Statut/Commandes |
|---|---|---|
| sshd | 22 | `sudo systemctl status ssh` |
| http (Caddy) | 80 | redirect → https |
| https (Caddy) | 443 | TLS auto Let's Encrypt |
| PostgreSQL 16 | 5432 (local only) | `sudo systemctl status postgresql` |
| Redis | 6379 (local only) | `redis-cli ping` |
| Caddy 2.11 | 80/443 | `sudo systemctl status caddy` |
| ufw firewall | — | `sudo ufw status verbose` |
| fail2ban | — | `sudo fail2ban-client status sshd` |

### Tuning PostgreSQL (8 GB RAM)
Dans `/etc/postgresql/16/main/postgresql.conf` :
```
shared_buffers = 2GB
effective_cache_size = 6GB
work_mem = 16MB
maintenance_work_mem = 256MB
wal_buffers = 16MB
```

### Caddy
Config dans `/etc/caddy/Caddyfile`. Logs dans `/var/log/caddy/<vhost>.log`
(rotation 10 MB × 5).

⚠️ **Si tu modifies le Caddyfile** :
1. Valider d'abord : `sudo caddy validate --config /etc/caddy/Caddyfile`
2. Reload : `sudo systemctl reload caddy`
3. Si reload reste coincé en "reloading" → `sudo systemctl restart caddy` (hard restart)
4. Vérif logs : `sudo journalctl -u caddy -n 30 --no-pager`

⚠️ Si tu ajoutes une nouvelle directive `log { output file ... }` pointant vers
un nouveau fichier, **crée d'abord** le fichier avec les bonnes perms :
```bash
sudo touch /var/log/caddy/<nom>.log
sudo chown caddy:caddy /var/log/caddy/<nom>.log
```
Sinon le reload échoue avec "permission denied" et reste bloqué.

---

## 9. Backups quotidiens

### Script
`/usr/local/bin/clubflow-backup.sh` — exécuté chaque nuit à **3h Paris**.

Workflow :
1. `pg_dump -Fc clubflow | gzip -9` → `/var/backups/clubflow/clubflow_<DATE>.sql.gz`
2. `rclone copy` (en tant que clubflow) → `hetzner-sb:postgres/`
3. Rotation locale : garde 7 jours
4. Rotation distante : garde 30 jours
5. Logs via `logger -t clubflow-backup` (visibles dans `journalctl -t clubflow-backup`)

### Cron
`/etc/cron.d/clubflow-backup` :
```cron
0 3 * * * root /usr/local/bin/clubflow-backup.sh >> /var/log/clubflow-backup.log 2>&1
```

### Lancer un backup à la main
```bash
"/c/Windows/System32/OpenSSH/ssh.exe" clubflow@89.167.79.253 "sudo /usr/local/bin/clubflow-backup.sh"
```

### Vérifier les backups distants
```bash
"/c/Windows/System32/OpenSSH/ssh.exe" clubflow@89.167.79.253 "rclone ls hetzner-sb:postgres/ | tail -10"
```

### Restaurer un backup (en cas d'incident)
```bash
# 1. Récupérer le dump
rclone copy hetzner-sb:postgres/clubflow_20260503_030000.sql.gz /tmp/

# 2. Décompresser
gunzip /tmp/clubflow_20260503_030000.sql.gz

# 3. Restaurer (DETRUIT la DB courante)
sudo -u postgres dropdb clubflow
sudo -u postgres createdb -O clubflow clubflow
sudo -u postgres pg_restore -d clubflow /tmp/clubflow_20260503_030000.sql
```

---

## 10. Mail prod — Brevo

### Setup multi-domaine
Pour chaque club avec son propre domaine (ex : `tonclub.fr`) :
1. Brevo console → "Sender domains" → Add domain
2. Brevo donne 3 enregistrements DNS à ajouter chez le registrar :
   - `brevo._domainkey.tonclub.fr` (DKIM)
   - `tonclub.fr TXT v=spf1 include:spf.brevosend.com ~all` (SPF)
   - `_dmarc.tonclub.fr TXT v=DMARC1; p=none; rua=mailto:dmarc@tonclub.fr`
3. Une fois vérifié, on enregistre le domaine côté API via `ClubSendingDomainService`

### Côté API
- SMTP host : `smtp-relay.brevo.com`
- SMTP port : 587 (STARTTLS) — port 25 outbound n'est pas utilisé (Brevo passe par 587)
- Variables d'env API : `BREVO_API_KEY`, `BREVO_SMTP_USER`, `BREVO_SMTP_PASSWORD`

### Volumétrie
Plan gratuit : 300 mails/jour (≈ 9000/mois). Largement suffisant pour 1 club
de 200 membres. Au-delà, plan payant ou IP dédiée.

---

## 11. Domaines + DNS (configuré)

### Architecture finale

```
ClubFlow product (sur topdigital.re via DNS Cloudflare)
├─ clubflow.topdigital.re            → admin web (Vite static)
├─ api.clubflow.topdigital.re        → NestJS API + WS /chat
└─ portail.clubflow.topdigital.re    → portail membre (Vite static)

Club SKSR (sur sksr.re via DNS OVH)
├─ sksr.re                           → vitrine publique du club SKSR
└─ www.sksr.re                       → 301 redirect → sksr.re

→ Tous pointent vers 89.167.79.253 (IPv4) + 2a01:4f9:c010:99d3::1 (IPv6)
→ TLS auto Let's Encrypt via Caddy
```

### Où sont gérés les DNS ?

| Domaine | Registrar | DNS hébergé chez | Console |
|---|---|---|---|
| **`topdigital.re`** | OVH | **Cloudflare** (`kevin.ns.cloudflare.com`) | https://dash.cloudflare.com/414b39a309ac266f34111f8b1973df80/topdigital.re/dns/records |
| **`sksr.re`** | OVH | **OVH** (`dns10.ovh.net`) | https://manager.eu.ovhcloud.com/#/web/domain/sksr.re/zone |
| `un-temps-pour-soi.re` | OVH | OVH | (pas utilisé pour ClubFlow) |
| `coeur2couple.fr` | OVH | OVH (suspendu/expiré) | — |

⚠️ **NE PAS toucher les NS du domaine `topdigital.re`** : ils sont chez Cloudflare,
pas OVH. Toute modif DNS pour `*.topdigital.re` doit se faire **côté Cloudflare**.

### Records actifs

**Cloudflare → topdigital.re** (6 records ClubFlow + records existants OVH mail) :
| Type | Name | Content | Proxy |
|---|---|---|---|
| A | clubflow | 89.167.79.253 | ⚠️ **DNS only** (gris) |
| AAAA | clubflow | 2a01:4f9:c010:99d3::1 | DNS only |
| A | api.clubflow | 89.167.79.253 | DNS only |
| AAAA | api.clubflow | 2a01:4f9:c010:99d3::1 | DNS only |
| A | portail.clubflow | 89.167.79.253 | DNS only |
| AAAA | portail.clubflow | 2a01:4f9:c010:99d3::1 | DNS only |

**OVH → sksr.re** (4 records ClubFlow + records mail OVH existants) :
| Type | Name | Content |
|---|---|---|
| A | @ | 89.167.79.253 |
| AAAA | @ | 2a01:4f9:c010:99d3::1 |
| A | www | 89.167.79.253 |
| AAAA | www | 2a01:4f9:c010:99d3::1 |

### ⚠️ Pièges à éviter

1. **Cloudflare proxy = OFF** sur les records ClubFlow.
   Le nuage doit être **gris (DNS only)**, PAS orange (Proxied).
   Sinon Cloudflare intercepte le challenge HTTP-01 et Caddy ne peut pas
   obtenir/renouveler les certificats Let's Encrypt.

2. **Records A parasites OVH** : à l'achat d'un domaine OVH,
   un A `185.158.133.1` (welcome page OVH) est créé automatiquement
   sur `@` et `www`. **Le supprimer** sinon round-robin DNS et 50 %
   du trafic part sur la welcome page OVH au lieu du serveur.
   → Vérifier toutes les pages de la zone OVH (paginé) après ajout d'un domaine.

3. **Propagation** : Cloudflare = quasi-instantané (Anycast). OVH = quelques
   minutes. TTL des records = 0/300s donc pas de cache long.

### Vérifier la résolution
```bash
# Depuis le serveur ou ton laptop
for h in clubflow.topdigital.re api.clubflow.topdigital.re portail.clubflow.topdigital.re sksr.re www.sksr.re; do
  echo "--- $h ---"
  dig +short A $h @1.1.1.1
  dig +short AAAA $h @1.1.1.1
done
```

Toutes les lignes doivent renvoyer **uniquement** :
- `89.167.79.253` (A)
- `2a01:4f9:c010:99d3::1` (AAAA)

Si une autre IP apparaît → A parasite OVH à supprimer.

### Caddyfile actuel

`/etc/caddy/Caddyfile` — phase **placeholder** (chaque vhost répond du texte
simple, on switchera vers les vraies apps quand elles seront déployées) :

```caddy
{
    email florent.morel427@gmail.com
}

clubflow.topdigital.re {
    encode zstd gzip
    respond "ClubFlow Admin — placeholder OK"
    log { output file /var/log/caddy/clubflow-admin.log { roll_size 10mb roll_keep 5 } }
}

api.clubflow.topdigital.re {
    encode zstd gzip
    respond "ClubFlow API — placeholder OK"
    # TODO when API up:
    #   reverse_proxy localhost:3000
    log { output file /var/log/caddy/clubflow-api.log { roll_size 10mb roll_keep 5 } }
}

portail.clubflow.topdigital.re {
    encode zstd gzip
    respond "ClubFlow Portail — placeholder OK"
    log { output file /var/log/caddy/clubflow-portail.log { roll_size 10mb roll_keep 5 } }
}

sksr.re {
    encode zstd gzip
    respond "SKSR — vitrine club — placeholder OK"
    log { output file /var/log/caddy/sksr.log { roll_size 10mb roll_keep 5 } }
}

www.sksr.re {
    redir https://sksr.re{uri} permanent
}
```

### Ajouter un nouveau club (futur)

Pour un club X avec son propre domaine `clubX.fr` :
1. Le club ajoute les enregistrements DNS chez SON registrar :
   - `clubX.fr` A → 89.167.79.253
   - `clubX.fr` AAAA → 2a01:4f9:c010:99d3::1
   - `www.clubX.fr` A → 89.167.79.253
   - `www.clubX.fr` AAAA → 2a01:4f9:c010:99d3::1
2. Ajouter au Caddyfile :
   ```caddy
   clubX.fr {
       reverse_proxy localhost:3000
       # ou : root * /var/www/clubs/clubX/dist
       #     file_server
   }
   www.clubX.fr {
       redir https://clubX.fr{uri} permanent
   }
   ```
3. `sudo touch /var/log/caddy/clubX.log && sudo chown caddy:caddy /var/log/caddy/clubX.log`
4. `sudo systemctl reload caddy` (Caddy obtient le cert Let's Encrypt en ~10s)

---

## 12. Déploiement apps (LIVE — tout fonctionne)

### Architecture déployée

```
[Internet]
    ↓ DNS Cloudflare/OVH (DNS only)
    ↓
[Caddy 443 — TLS auto Let's Encrypt]
    ├─ clubflow.topdigital.re      → file_server (Vite SPA static)
    │                                  /home/clubflow/clubflow/apps/admin/dist
    ├─ portail.clubflow.topdigital.re → file_server (Vite SPA static)
    │                                  /home/clubflow/clubflow/apps/member-portal/dist
    ├─ api.clubflow.topdigital.re  → reverse_proxy localhost:3000 (+ WS /chat)
    │                                  systemd: clubflow-api.service (NestJS)
    └─ sksr.re                     → reverse_proxy localhost:5175
                                       systemd: clubflow-vitrine.service (Next.js SSR)
```

### Services systemd

| Unit | Port | Source | Logs |
|---|---|---|---|
| `clubflow-api.service` | 3000 | `/home/clubflow/clubflow/apps/api/dist/main.js` | `/var/log/clubflow-api.log` |
| `clubflow-vitrine.service` | 5175 | `cd apps/vitrine && npm run start` | `/var/log/clubflow-vitrine.log` |

```bash
# Status / restart
sudo systemctl status clubflow-api clubflow-vitrine
sudo systemctl restart clubflow-api
sudo systemctl restart clubflow-vitrine

# Logs en live
sudo tail -f /var/log/clubflow-api.log
sudo tail -f /var/log/clubflow-vitrine.log
```

### Variables d'env à connaître

**`/home/clubflow/clubflow/apps/api/.env`** (chmod 600) :
- `DATABASE_URL` : postgres clubflow:<pwd>@localhost:5432/clubflow (pwd dans `/root/.clubflow-db-password`)
- `JWT_SECRET` / `REFRESH_SECRET` : générés à l'init (random 64-byte base64)
- `JWT_EXPIRES_IN=7d`
- `CLUB_ID=a8a1041c-ec1e-4e4d-a1cc-cd58247cf982` (Club démo seedé, à renommer en SKSR via admin)
- `ADMIN_WEB_ORIGIN` : 4 domaines prod + localhost dev
- `CORS_ALLOW_NO_ORIGIN=true` ⚠️ **REQUIS** sinon vitrine SSR ne peut pas appeler l'API
- `SMTP_HOST=` / `SMTP_PORT=` (vides = mode placeholder, mails loggés au lieu d'envoyés)

**`/home/clubflow/clubflow/apps/vitrine/.env.production`** (chmod 600) :
- `VITRINE_API_URL=http://localhost:3000/graphql` (server-side, jamais exposé client)
- `VITRINE_PUBLIC_API_URL=https://api.clubflow.topdigital.re/graphql`
- `VITRINE_DEFAULT_CLUB_SLUG=demo-club` (à changer pour `sksr` une fois le club renommé)
- `VITRINE_REVALIDATE_SECRET` : random 24-char
- `VITRINE_JWT_SECRET` : doit matcher `JWT_SECRET` de l'API
- `VITRINE_ADMIN_URL=https://clubflow.topdigital.re`

**`/home/clubflow/clubflow/apps/{admin,member-portal}/.env.production`** :
- `VITE_GRAPHQL_HTTP=https://api.clubflow.topdigital.re/graphql`
- `VITE_GRAPHQL_WS=wss://api.clubflow.topdigital.re/chat`
- `VITE_MEDIA_BASE=https://api.clubflow.topdigital.re/media`

### Compte admin initial
- **Email** : `admin@clubflow.local`
- **Password** : `ClubFlowAdmin2026!` (à changer dans le profil après 1er login)
- **CLUB_ID header** : `a8a1041c-ec1e-4e4d-a1cc-cd58247cf982`
- **URL admin** : https://clubflow.topdigital.re

### Pièges + Workarounds appliqués

⚠️ **Branche `main` GitHub a 17 migrations Prisma incomplètes** (ordre cassé)
   → Le déploiement a été fait via **transfert tar+ssh du worktree** (59 migrations
   correctement ordonnées) au lieu de `git clone`. À corriger : push le worktree
   sur main et squash les migrations buggées.

⚠️ **Migrations Prisma cassées même dans le worktree** : `20260430100000_projects_module`
   référence le type `AiUsageFeature` non créé à ce stade.
   → Workaround utilisé : **`prisma db push`** au lieu de `prisma migrate deploy`.
   Conséquence : pas d'historique de migrations en DB. À fixer avant le 1er déploiement
   incrémental (migration baseline manuelle).

⚠️ **Build admin + vitrine échouent en strict TS** (TS2304/TS2339 sur fichiers refactor)
   → Workaround : `npx vite build` (admin) au lieu de `tsc -b && vite build`.
   Bypass le type-check, garde le bundle. À fixer dans le code source.

⚠️ **API CORS strict en NODE_ENV=production** : si une nouvelle origin appelle l'API
   sans être dans `ADMIN_WEB_ORIGIN`, retourne 500 "Not allowed by CORS".
   Pour les appels server-to-server (Vitrine SSR → API), `CORS_ALLOW_NO_ORIGIN=true`
   est obligatoire.

⚠️ **Permissions home dir** : `/home/clubflow` est `drwxr-x---` par défaut, donc Caddy
   (user `caddy`) ne peut pas traverser. Fix appliqué :
   ```bash
   sudo chmod o+x /home/clubflow /home/clubflow/clubflow /home/clubflow/clubflow/apps \
                  /home/clubflow/clubflow/apps/admin /home/clubflow/clubflow/apps/member-portal
   sudo find <dist-dirs> -type d -exec chmod o+rx {} \;
   sudo find <dist-dirs> -type f -exec chmod o+r {} \;
   ```

### Procédure de mise à jour (script + skill `/deploy`)

**Script idempotent sur le serveur** : `/usr/local/bin/clubflow-deploy.sh`
(à créer une fois — voir bloc ci-dessous).

```bash
#!/bin/bash
# /usr/local/bin/clubflow-deploy.sh
# Déploiement idempotent ClubFlow. À lancer en root (sudo).
set -euo pipefail
LOG=/var/log/clubflow-deploy.log
exec > >(tee -a "$LOG") 2>&1
echo ""
echo "============================================================"
echo "🚀 Deploy started at $(date '+%F %T')"
echo "============================================================"

cd /home/clubflow/clubflow

# 1. Pull (uniquement si fetch a quelque chose de nouveau)
echo "=== git pull ==="
sudo -u clubflow git fetch origin
LOCAL=$(sudo -u clubflow git rev-parse HEAD)
REMOTE=$(sudo -u clubflow git rev-parse origin/main)
if [ "$LOCAL" = "$REMOTE" ]; then
  echo "Already up to date ($LOCAL)"
  echo "Forcing rebuild anyway? (set FORCE=1 to skip exit)"
  [ "${FORCE:-0}" = "1" ] || exit 0
fi
sudo -u clubflow git reset --hard origin/main
echo "Now at $(sudo -u clubflow git log -1 --oneline)"

# 2. API : install + prisma + build
echo "=== api: npm ci + prisma + build ==="
cd apps/api
sudo -u clubflow npm ci --no-audit --no-fund
sudo -u clubflow npx prisma generate
# ⚠️ Tant que les migrations ne sont pas reset propres, on utilise db push.
# À switcher vers `prisma migrate deploy` quand l'historique sera baseline.
sudo -u clubflow npx prisma db push --skip-generate
sudo -u clubflow npm run build

# 3. Admin (Vite static, bypass tsc voir §12 pièges)
echo "=== admin: build ==="
cd ../admin
sudo -u clubflow npm ci --no-audit --no-fund
sudo -u clubflow npx vite build

# 4. Portail (Vite static)
echo "=== portail: build ==="
cd ../member-portal
sudo -u clubflow npm ci --no-audit --no-fund
sudo -u clubflow npx vite build

# 5. Vitrine (Next.js SSR)
echo "=== vitrine: build ==="
cd ../vitrine
sudo -u clubflow npm ci --no-audit --no-fund
sudo -u clubflow rm -rf .next/cache       # purge ISR
sudo -u clubflow npm run build

# 6. Restart services
echo "=== systemd restart ==="
systemctl restart clubflow-api clubflow-vitrine
systemctl reload caddy

# 7. Smoke test
echo "=== smoke test ==="
sleep 4
FAIL=0
for h in clubflow.topdigital.re portail.clubflow.topdigital.re sksr.re; do
  code=$(curl -s -o /dev/null -w '%{http_code}' "https://$h/" || echo "000")
  printf '  %s  %s\n' "$code" "$h"
  [ "$code" = "200" ] || FAIL=1
done

# API GraphQL probe (avec Origin pour passer CORS)
api_code=$(curl -s -o /dev/null -w '%{http_code}' \
  -X POST https://api.clubflow.topdigital.re/graphql \
  -H 'Content-Type: application/json' \
  -H 'Origin: https://clubflow.topdigital.re' \
  -d '{"query":"{__typename}"}')
printf '  %s  https://api.clubflow.topdigital.re/graphql\n' "$api_code"
[ "$api_code" = "200" ] || FAIL=1

if [ "$FAIL" = "0" ]; then
  echo "✅ Deploy OK at $(date '+%F %T')"
else
  echo "❌ Deploy completed but smoke test failed — check logs"
  exit 1
fi
```

**Installation** (une fois) :
```bash
"/c/Windows/System32/OpenSSH/ssh.exe" clubflow@89.167.79.253 \
  "sudo nano /usr/local/bin/clubflow-deploy.sh"
# Coller le contenu ci-dessus
"/c/Windows/System32/OpenSSH/ssh.exe" clubflow@89.167.79.253 \
  "sudo chmod +x /usr/local/bin/clubflow-deploy.sh"
```

**Usage manuel** :
```bash
"/c/Windows/System32/OpenSSH/ssh.exe" clubflow@89.167.79.253 \
  "sudo /usr/local/bin/clubflow-deploy.sh"
```

**Usage via skill Claude** : `/deploy`
(défini dans `.claude/skills/deploy/SKILL.md` — Claude run la commande SSH, suit
les logs en live via Monitor, et te notifie au succès / échec).

### Automatisation GitHub Actions (étape suivante)

Quand `release-please` sera installé (cf. §5.D), ajouter `.github/workflows/deploy.yml`
qui se déclenche sur tag `v*` ou sur merge de PR de release et exécute le script
ci-dessus via SSH. Workflow complet :

1. Push commit `feat: ...` sur `main`
2. release-please ouvre PR "release v0.X.0" avec CHANGELOG auto
3. Tu merges la PR de release → tag `v0.X.0` créé auto
4. Workflow `deploy.yml` SSH le serveur → lance `clubflow-deploy.sh`
5. Notification (Slack/email) au succès ou échec

→ Workflow human-in-the-loop : tu valides le contenu de la release (PR), tout le
reste est auto.

### Étapes de personnalisation à faire (utilisateur)

1. **Renommer le Club seedé** : `Club démo` → `SKSR` (via admin web)
   → Update aussi `slug=sksr` puis `VITRINE_DEFAULT_CLUB_SLUG=sksr`
2. **Brevo SMTP credentials** : créer compte Brevo, générer clé SMTP, remplir
   `SMTP_HOST=smtp-relay.brevo.com SMTP_PORT=587 SMTP_USER=... SMTP_PASS=...`
   dans `apps/api/.env` puis `sudo systemctl restart clubflow-api`
3. **Vérifier domaine sksr.re dans Brevo** : ajouter DKIM/SPF DNS records côté OVH
4. **Changer mot de passe admin** : login → profil → changer mot de passe
5. **Créer les pages vitrine SKSR** : via admin → Site vitrine → Pages
6. **Configurer modules** : via admin → Paramètres → Modules du club

### Mise à jour Caddyfile (sauvegarde du placeholder précédent)
- Backup ancien Caddyfile placeholder : `/etc/caddy/Caddyfile.placeholder.bak`
- Nouveau Caddyfile prod : `/etc/caddy/Caddyfile`

---

## 13. Cheat-sheet commandes Claude

### Connexion SSH
```bash
"/c/Windows/System32/OpenSSH/ssh.exe" clubflow@89.167.79.253 "<commande>"
```

### Type-check
```bash
cd apps/api && npx tsc --noEmit
cd apps/admin && npx tsc --noEmit
```

### Logs prod en live
```bash
"/c/Windows/System32/OpenSSH/ssh.exe" clubflow@89.167.79.253 "sudo journalctl -u clubflow-api -f"
"/c/Windows/System32/OpenSSH/ssh.exe" clubflow@89.167.79.253 "sudo journalctl -u caddy -f"
"/c/Windows/System32/OpenSSH/ssh.exe" clubflow@89.167.79.253 "sudo journalctl -t clubflow-backup -n 50"
```

### Stats serveur
```bash
"/c/Windows/System32/OpenSSH/ssh.exe" clubflow@89.167.79.253 "free -h && df -h / && uptime"
```

### Update système
```bash
"/c/Windows/System32/OpenSSH/ssh.exe" clubflow@89.167.79.253 "sudo apt update && sudo DEBIAN_FRONTEND=noninteractive apt upgrade -y"
```

### Reboot (après kernel update)
```bash
"/c/Windows/System32/OpenSSH/ssh.exe" clubflow@89.167.79.253 "sudo reboot" ; sleep 60
```

### Inspecter Postgres
```bash
"/c/Windows/System32/OpenSSH/ssh.exe" clubflow@89.167.79.253 "sudo -u postgres psql clubflow -c 'SELECT count(*) FROM \"Member\";'"
```

### GraphQL API probe
```bash
curl -s -X POST http://89.167.79.253/graphql -H "Content-Type: application/json" -d '{"query":"{__typename}"}'
# ou (quand l'API sera derrière Caddy) :
curl -s -X POST https://api.clubflow.topdigital.re/graphql -H "Content-Type: application/json" -d '{"query":"{__typename}"}'
```

### Vérifier la résolution DNS des 5 domaines
```bash
for h in clubflow.topdigital.re api.clubflow.topdigital.re portail.clubflow.topdigital.re sksr.re www.sksr.re; do
  echo "--- $h ---"; dig +short A $h @1.1.1.1; dig +short AAAA $h @1.1.1.1
done
```

### Tester HTTPS sur les 4 vhosts
```bash
for h in clubflow.topdigital.re api.clubflow.topdigital.re portail.clubflow.topdigital.re sksr.re; do
  echo "--- $h ---"; curl -s -m 15 -o /dev/null -w "Status: %{http_code} | TLS: %{ssl_verify_result}\n" https://$h/
done
```

### Inspecter les certs Let's Encrypt installés
```bash
"/c/Windows/System32/OpenSSH/ssh.exe" clubflow@89.167.79.253 \
  "sudo ls -la /var/lib/caddy/.local/share/caddy/certificates/acme-v02.api.letsencrypt.org-directory/"
```

### Logs Caddy par vhost
```bash
"/c/Windows/System32/OpenSSH/ssh.exe" clubflow@89.167.79.253 \
  "sudo tail -f /var/log/caddy/clubflow-admin.log"
# clubflow-admin.log | clubflow-api.log | clubflow-portail.log | sksr.log
```

---

## 14. Coûts mensuels (récap, France TTC)

| Poste | TTC/mois |
|---|---|
| Hetzner CX33 + IPv4 | 8,39 € |
| Hetzner Storage Box BX11 | 3,84 € |
| Brevo (gratuit 300 mails/j) | 0 € |
| Domaine `.fr` (Gandi/OVH ~12 €/an) | ~1 € |
| **Total** | **~13,23 €** |

À upgrade quand :
- Plus de 1 club → CCX13 (vCPU dédiés AMD, ~15-16 €/mois TTC)
- Plus de 9000 mails/mois → Brevo payant (25 € pour 20k)
- Disque saturé → Storage Box BX21 (5 TB, ~13 €/mois)

---

## 15. Quand ça pète — playbook 30 secondes

| Symptôme | Diag | Fix |
|---|---|---|
| `ssh: Permission denied` | ssh-agent vide | `Start-Service ssh-agent ; ssh-add` (PS admin) |
| `ssh: Connection timed out` | fail2ban a banni | Attendre 10 min, **NE PAS** retry en boucle |
| API ne répond pas | Service down | `sudo systemctl status clubflow-api && sudo journalctl -u clubflow-api -n 50` |
| 502 sur le domaine | Caddy down ou backend down | `sudo systemctl reload caddy && curl -I http://localhost:3000` |
| Backup cron silencieux | Vérifier logs | `sudo journalctl -t clubflow-backup -n 100` |
| Disque plein | `df -h` | Purge `/var/log/*.log.*.gz` + cron rotation backups locaux |
| OOM kill | `dmesg \| grep -i kill` | Swap à 4 GB déjà actif, sinon scale up VPS |
| Domaine répond pas | `dig +short A <domaine> @1.1.1.1` | Vérif DNS propagé / Cloudflare proxy = OFF / record A pas parasité |
| Cert Let's Encrypt fail | `sudo journalctl -u caddy \| grep -i acme` | Vérif `Cloudflare proxy = OFF`, vérif port 80 ouvert (`ufw status`) |
| Caddy "reloading" coincé | reload échoué + boucle | `sudo systemctl restart caddy` (hard restart au lieu de reload) |
| Sub-routing double-IP | `dig` retourne 2 IPs | Supprimer A parasite OVH (ex: 185.158.133.1 welcome page) |

---

## 16. Skills Claude personnalisés

| Skill | Path | Quand l'utiliser |
|---|---|---|
| **`/restart`** | `.claude/skills/restart/SKILL.md` | Redémarre toute la stack dev (API + Admin + Portal + Metro Expo + Mailpit). Ne touche pas Docker. |
| **`/deploy`** | `.claude/skills/deploy/SKILL.md` | Déploie `main` → prod via SSH + smoke test. Pré-requis : être sur `main` à jour, aucun changement non-commité. Reporte succès/échec + URLs. |
| **`/release`** | `.claude/skills/release/SKILL.md` | Setup initial release-please OU cycle de release courant (review PR de release, merge, tag auto, GitHub Release auto, deploy auto). Pas d'écriture manuelle des release notes. |

### Skills upstream Claude Code (utiles ici)

| Skill | Quand |
|---|---|
| `/init` | Régénérer/mettre à jour CLAUDE.md à partir de l'état du codebase |
| `/review` | Revue de code d'une PR (à utiliser sur les PRs `feat/*` et `fix/*` avant merge) |
| `/security-review` | Audit sécurité des changements de la branche courante |

### Cycle complet via skills

```
Code en local → commit Conventional → push main
        ↓
release-please ouvre PR "release vX.Y.Z" (auto)
        ↓
/release  ← review + merge la PR de release
        ↓
Tag git créé + GitHub Release publiée (auto)
        ↓
/deploy   ← lance le pipeline (ou workflow GHA auto sur tag v*)
        ↓
Smoke test + URLs prod 200 OK
```

---

## 17. Personnes / contacts + IDs externes

### Owner
- Florent Morel (`florent.morel427@gmail.com`)

### Hetzner
- **Project ID** : 14444062
- **Server ID** : 128890739 (clubflow-prod, CX33, Helsinki)
- **Storage Box ID** : 570065 (clubflow-backups, BX11)

### Cloudflare
- **Account ID** : 414b39a309ac266f34111f8b1973df80
- **Zone gérée** : `topdigital.re` (DNS only mode)
- Console : https://dash.cloudflare.com/414b39a309ac266f34111f8b1973df80/topdigital.re

### OVH
- **Compte** : Florent Morel
- **Domaines actifs** : `topdigital.re` (registrar uniquement, DNS chez Cloudflare),
  `sksr.re` (registrar + DNS), `un-temps-pour-soi.re`, `coeur2couple.fr` (suspendu)
- Console : https://manager.eu.ovhcloud.com

### Brevo (mail prod, à configurer)
- Account : Florent Morel (`florent.morel427@gmail.com`)
- Plan : gratuit (300 mails/jour)

### GitHub
- https://github.com/florent427/ClubFlow

### URLs publiques (tous live derrière Caddy + Let's Encrypt)
- **Admin** : https://clubflow.topdigital.re
- **API** : https://api.clubflow.topdigital.re
- **Portail** : https://portail.clubflow.topdigital.re
- **Vitrine SKSR** : https://sksr.re (+ www → 301)

---

_Dernière mise à jour : 2026-05-03 (workflow modif → release-please → /deploy automatisé,
skills `/deploy` + `/release` créés)_
