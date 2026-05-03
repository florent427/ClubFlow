# Runbook — Ajouter une nouvelle app au monorepo

> Procédure pour créer une nouvelle app dans `apps/` (ex: `apps/admin-mobile-v2`,
> `apps/extranet`, etc.) et l'intégrer au pipeline déploiement.

## 1. Créer l'app dans `apps/<nom>`

Les apps actuelles servent de modèles :
- **Web React + Vite** : copier la structure de `apps/admin/`
- **Web Next.js SSR** : copier `apps/vitrine/`
- **API NestJS** : copier `apps/api/` (rarement, normalement on étend l'API existante)
- **Expo mobile** : copier `apps/mobile/`

Vérifier au minimum :
- `package.json` avec scripts `dev`, `build`, `start` (ou équivalent)
- `tsconfig.json` ou `next.config.ts`
- `.env.example` pour documenter les variables attendues
- Pas de `package-lock.json` partagé avec une autre app (chaque app a le sien)

## 2. Choisir un port dev

Réserver un port libre :

| Port | App actuelle |
|---|---|
| 3000 | API |
| 5173 | admin (Vite) |
| 5174 | member-portal (Vite) |
| 5175 | vitrine (Next.js) |
| 5176 | **disponible** |
| 5177 | **disponible** |
| 8081 | mobile (Metro Expo) |

→ Pour la nouvelle app, prendre `5176`.

Update :
- `.claude/skills/restart/SKILL.md` (liste des ports + Procédure §1 et §2)
- `docs/runbooks/restart-dev.md`
- `docs/knowledge/infra-dev.md`

## 3. Si l'app a besoin d'un sous-domaine prod

### 3.1 DNS

Choisir un nom (ex: `extranet.clubflow.topdigital.re`) et ajouter sur
Cloudflare :

| Type | Name | Content | Proxy |
|---|---|---|---|
| A | extranet.clubflow | 89.167.79.253 | DNS only |
| AAAA | extranet.clubflow | 2a01:4f9:c010:99d3::1 | DNS only |

### 3.2 Caddy vhost

```caddy
extranet.clubflow.topdigital.re {
    encode zstd gzip
    # Pour Vite SPA static :
    root * /home/clubflow/clubflow/apps/extranet/dist
    file_server
    try_files {path} /index.html
    # Pour app dynamique avec serveur Node :
    # reverse_proxy localhost:5176
    log { output file /var/log/caddy/extranet.log { roll_size 10mb roll_keep 5 } }
}
```

```bash
ssh-into-prod "sudo touch /var/log/caddy/extranet.log && sudo chown caddy:caddy /var/log/caddy/extranet.log"
ssh-into-prod "sudo systemctl reload caddy"
```

### 3.3 Permissions home dir (si app servie en static)

```bash
ssh-into-prod "
  sudo chmod o+x /home/clubflow/clubflow/apps/extranet
  sudo find /home/clubflow/clubflow/apps/extranet/dist -type d -exec chmod o+rx {} \;
  sudo find /home/clubflow/clubflow/apps/extranet/dist -type f -exec chmod o+r {} \;
"
```

Cf. `pitfalls/caddy-perms-home-clubflow.md`.

### 3.4 Si app Node serveur (Next.js, Nest, etc.)

Créer un service systemd :

```bash
ssh-into-prod "sudo tee /etc/systemd/system/clubflow-extranet.service <<UNIT
[Unit]
Description=ClubFlow Extranet
After=network.target

[Service]
Type=simple
User=clubflow
WorkingDirectory=/home/clubflow/clubflow/apps/extranet
EnvironmentFile=/home/clubflow/clubflow/apps/extranet/.env.production
ExecStart=/usr/bin/npm run start
Restart=on-failure
StandardOutput=append:/var/log/clubflow-extranet.log
StandardError=append:/var/log/clubflow-extranet.log

[Install]
WantedBy=multi-user.target
UNIT
sudo touch /var/log/clubflow-extranet.log
sudo chown clubflow:clubflow /var/log/clubflow-extranet.log
sudo systemctl daemon-reload
sudo systemctl enable --now clubflow-extranet
"
```

## 4. Mettre à jour `clubflow-deploy.sh`

Sur le serveur, éditer `/usr/local/bin/clubflow-deploy.sh` pour ajouter
une nouvelle phase de build :

```bash
# Phase 5b — Extranet
log "📦 Build extranet"
cd /home/clubflow/clubflow/apps/extranet
npm ci
npx vite build  # ou npm run build
```

Et dans Phase 6 (restart) :

```bash
sudo systemctl restart clubflow-extranet
```

Ne pas oublier la Phase 7 (smoke) :

```bash
check_url "https://extranet.clubflow.topdigital.re/"
```

⚠️ Tester le script en local avant push (le re-uploader via SCP).

## 5. Mettre à jour `release-please-config.json`

Si l'app doit avoir son propre cycle de version (rarement) :

```json
{
  "packages": {
    ".": { ... },
    "apps/extranet": {
      "package-name": "@clubflow/extranet",
      "release-type": "node",
      "include-component-in-tag": true
    }
  }
}
```

Sinon : laisser tomber, l'app sera versionnée avec le projet global.

## 6. Documenter

- `knowledge/repo-structure.md` — ajouter l'app dans la liste
- `knowledge/infra-prod.md` — services systemd + ports
- `knowledge/contacts-ids.md` — URL publique
- CLAUDE.md — orchestrateur si l'app introduit une convention nouvelle

## 7. Premier déploiement

```bash
git add apps/extranet/
git commit -m "feat(extranet): bootstrap nouvelle app"
git push origin main
gh run watch  # deploy.yml
```

## Coût additionnel

- 0 € si mutualisé sur même CX33 (RAM/CPU dispo)
- À surveiller : `htop` côté serveur après mise en prod
