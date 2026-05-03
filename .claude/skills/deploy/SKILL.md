---
name: deploy
description: Déploie la dernière version de main vers la prod ClubFlow (Hetzner Helsinki). Lance /usr/local/bin/clubflow-deploy.sh sur le serveur via SSH, suit les logs en live et reporte le résultat. À utiliser quand l'utilisateur dit "/deploy", "déploie en prod", "push live", "release", après un merge de PR sur main, ou après création d'un tag de release.
---

# /deploy — Pipeline de déploiement ClubFlow

## Quand utiliser

L'utilisateur a fini une feature/fix sur `main` (mergé via PR ou commit direct
en hotfix) et veut la voir en production.

## Pré-requis (vérifier avant de lancer)

1. **Tu es bien sur `main` à jour** côté local (sinon dis-le à l'utilisateur)
   ```bash
   git rev-parse --abbrev-ref HEAD   # doit être main
   git fetch origin && git status     # doit être "up to date"
   ```

2. **Aucun changement non-commité** que l'utilisateur aurait oublié
   ```bash
   git status --porcelain   # doit être vide
   ```

3. **Confirme à l'utilisateur le commit qui va partir en prod** :
   ```bash
   git log -3 --oneline
   ```
   Et demande confirmation explicite avant de procéder (action irréversible
   visible publiquement).

## Procédure de déploiement

### 1. Lance le script via SSH

```bash
"/c/Windows/System32/OpenSSH/ssh.exe" clubflow@89.167.79.253 \
  "sudo /usr/local/bin/clubflow-deploy.sh"
```

⚠️ **Toujours via le binaire Windows OpenSSH** (`/c/Windows/System32/OpenSSH/ssh.exe`)
qui parle au service ssh-agent Windows où la passphrase de la clé est cachée.
JAMAIS le `ssh` natif Git Bash — il ne voit pas l'agent et échoue avec
"Permission denied".

### 2. Suis les logs en live (optionnel)

Si la commande tourne longtemps (>30s), utilise `run_in_background: true` puis
poll avec Monitor sur les marqueurs clés :

```
=== git pull ===           ← début
=== api: npm ci + ... ===  ← phase API
=== smoke test ===         ← presque fini
✅ Deploy OK ...           ← succès
❌ Deploy completed ...    ← échec
```

### 3. Vérifie le résultat

Le script termine en exit 0 (succès) ou exit 1 (smoke test KO).
- ✅ Succès → confirme à l'utilisateur les 4 URLs OK + le commit déployé
- ❌ Échec → récupère `/var/log/clubflow-deploy.log` (last 50 lines) et propose
  un rollback

## Smoke test (le script le fait, mais valide-le aussi côté laptop)

Après le script, refais un test rapide depuis ton bash local :

```bash
for h in clubflow.topdigital.re portail.clubflow.topdigital.re sksr.re; do
  echo "$(curl -s -o /dev/null -w '%{http_code}' https://$h/)  $h"
done
curl -s -o /dev/null -w "%{http_code}\n" \
  -X POST https://api.clubflow.topdigital.re/graphql \
  -H 'Content-Type: application/json' \
  -H 'Origin: https://clubflow.topdigital.re' \
  -d '{"query":"{__typename}"}'
```

Tous doivent renvoyer `200`.

## Rollback (si échec)

```bash
"/c/Windows/System32/OpenSSH/ssh.exe" clubflow@89.167.79.253 << 'EOF'
cd /home/clubflow/clubflow
sudo -u clubflow git fetch --tags
PREV_TAG=$(sudo -u clubflow git tag --sort=-creatordate | head -1)
echo "Rolling back to $PREV_TAG"
sudo -u clubflow git reset --hard "$PREV_TAG"
sudo /usr/local/bin/clubflow-deploy.sh
EOF
```

## Reporter à l'utilisateur

Format de réponse final attendu :

```
✅ Déployé sur prod en 2m18s

Commit : abc1234 feat(vitrine): page Stages avec calendrier
Tag    : v0.3.0 (si release-please en place)

Smoke test :
  200  https://clubflow.topdigital.re/
  200  https://portail.clubflow.topdigital.re/
  200  https://sksr.re/
  200  https://api.clubflow.topdigital.re/graphql

Logs : /var/log/clubflow-deploy.log
```

## Pièges connus + safeguards (déjà en place)

### Phase 0 du script — pré-checks `.env` (CRITIQUE)
Le script vérifie la présence des 4 `.env` requis avant d'exécuter quoi que
ce soit, et exit early avec message clair si l'un manque. Si tu vois ce
message, suit la procédure de restore dans CLAUDE.md §12.

### `.env.production` perdus après deploy
**Cause** : si `git add -A` a accidentellement tracked des `.env.production`
(malgré gitignore), un `git reset --hard origin/main` les supprime.
**Symptôme** : vitrine 500 "VITRINE_API_URL manquant", admin/portail page
blanche (bundle sans `VITE_GRAPHQL_HTTP`).
**Fix** : phase 0 du script bloque déjà ça ; sinon recréer manuellement
(cf. CLAUDE.md §12 « Procédure de restore »).

### Migrations Prisma
Le script utilise `prisma db push` (pas `migrate deploy`) parce que les
migrations historiques de main sont en ordre cassé. Non-destructif sur les
données — ajoute/modifie juste le schema selon `schema.prisma`.

### Build admin/vitrine en strict TS
Le script utilise `npx vite build` (sans `tsc -b`). Des erreurs TypeScript
existent dans certaines pages refactor en cours — elles compilent côté
Vite/esbuild mais peuvent crasher au runtime. À fixer ASAP dans le code.

### Cache ISR Next.js
Le script fait `rm -rf .next/cache .next` avant chaque rebuild vitrine.
Ne pas enlever — sinon la vitrine peut servir des pages 404 stale (cas
rencontré : on insert des VitrinePage en DB mais Next.js retourne toujours
le 404 caché).

### fail2ban
Mon IP laptop (`102.35.136.228`) est whitelistée dans
`/etc/fail2ban/jail.d/clubflow.local`. Si elle change (mobile/VPN), j'ai
~10 min de bantime à attendre OU je peux unban via la console web Hetzner.

### Permissions /home/clubflow
Déjà ouvertes (`o+x`) pour que Caddy serve les `dist/`. Si un nouveau dossier
d'app apparaît, refaire :
```bash
sudo chmod o+x /home/clubflow/clubflow/apps/<nouveau>
sudo find /home/clubflow/clubflow/apps/<nouveau>/dist -type d -exec chmod o+rx {} \;
sudo find /home/clubflow/clubflow/apps/<nouveau>/dist -type f -exec chmod o+r {} \;
```

### CORS API en prod
`CORS_ALLOW_NO_ORIGIN=true` est requis dans `apps/api/.env` pour que la
vitrine SSR puisse appeler l'API server-to-server (sans Origin header).
Sinon : 500 "Not allowed by CORS".

### Workflow GHA déclenche pas
`paths-ignore` exclut les modifs purement docs/CI (CLAUDE.md, *.md, .github/,
docs/). Si tu modifies que du code applicatif → deploy se déclenche. Si tu
modifies que de la doc/CI → pas de redeploy (économie).
