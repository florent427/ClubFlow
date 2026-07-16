#!/bin/bash
# bin/clubflow-deploy.sh — Déploiement idempotent ClubFlow PROD.
#
# Exécuté par .github/workflows/deploy.yml qui pull d'abord le repo puis
# lance CE script (source de vérité versionnée — la copie historique
# /usr/local/bin/clubflow-deploy.sh est dépréciée). Lancer en root (sudo).
set -euo pipefail
LOG=/var/log/clubflow-deploy.log
mkdir -p "$(dirname "$LOG")"
exec > >(tee -a "$LOG") 2>&1

echo ""
echo "============================================================"
echo "Deploy PROD started at $(date '+%F %T')"
echo "============================================================"

cd /home/clubflow/clubflow

# 0. Pre-checks : les .env DOIVENT exister (sinon build silencieux KO)
echo "=== pre-checks .env ==="
MISSING=0
for f in apps/api/.env apps/admin/.env.production apps/member-portal/.env.production apps/vitrine/.env.production; do
  if [ ! -f "$f" ]; then
    echo "  MISSING: $f"
    MISSING=1
  else
    echo "  OK: $f"
  fi
done
if [ "$MISSING" = "1" ]; then
  echo "FATAL: un ou plusieurs .env sont manquants. Les recréer avant de relancer."
  echo "Voir docs/runbooks/restore-env.md."
  exit 1
fi

# 1. Pull (le workflow a déjà fetch+reset, mais on re-sécurise)
echo "=== git pull ==="
sudo -u clubflow git fetch origin
sudo -u clubflow git reset --hard origin/main
echo "Now at: $(sudo -u clubflow git log -1 --oneline)"

# 2. API
echo "=== api: npm ci + prisma + build ==="
cd apps/api
sudo -u clubflow npm ci --no-audit --no-fund
sudo -u clubflow npx prisma generate
# --accept-data-loss : requis pour les changements de contrainte non
# destructifs en pratique (ex. nouvel index unique sur colonne qui n'a
# que des null). Aligné sur le deploy staging. La stratégie db push est
# documentée dans ADR-0003.
sudo -u clubflow npx prisma db push --skip-generate --accept-data-loss
sudo -u clubflow npm run build

# 3. Admin
echo "=== admin: build ==="
cd ../admin
sudo -u clubflow npm ci --no-audit --no-fund
sudo -u clubflow npx vite build

# 4. Portail
echo "=== portail: build ==="
cd ../member-portal
sudo -u clubflow npm ci --no-audit --no-fund
sudo -u clubflow npx vite build

# 5. Vitrine
echo "=== vitrine: build ==="
cd ../vitrine
sudo -u clubflow npm ci --no-audit --no-fund
sudo -u clubflow rm -rf .next/cache .next
sudo -u clubflow npm run build

# 6. Restart
echo "=== systemd restart ==="
systemctl restart clubflow-api clubflow-vitrine
systemctl reload caddy

# 7. Smoke test — l'API NestJS met 30-60 s à booter (Prisma + schéma
# GraphQL) : on retente jusqu'à 6× espacées de 10 s au lieu d'échouer sur
# la race restart/smoke.
echo "=== smoke test ==="
FAIL=0
for h in clubflow.topdigital.re portail.clubflow.topdigital.re sksr.re; do
  code=$(curl -s -o /dev/null -w '%{http_code}' "https://$h/" || echo "000")
  printf '  %s  https://%s/\n' "$code" "$h"
  [ "$code" = "200" ] || FAIL=1
done
api_code=000
for attempt in 1 2 3 4 5 6; do
  api_code=$(curl -s -o /dev/null -w '%{http_code}' \
    -X POST https://api.clubflow.topdigital.re/graphql \
    -H 'Content-Type: application/json' \
    -H 'Origin: https://clubflow.topdigital.re' \
    -d '{"query":"{__typename}"}' || echo 000)
  if [ "$api_code" = "200" ]; then
    break
  fi
  echo "  … API pas encore prête ($api_code), tentative $attempt/6"
  sleep 10
done
printf '  %s  https://api.clubflow.topdigital.re/graphql\n' "$api_code"
[ "$api_code" = "200" ] || FAIL=1

if [ "$FAIL" = "0" ]; then
  echo "OK Deploy PROD réussi à $(date '+%F %T')"
else
  echo "KO Deploy PROD terminé mais smoke test failed — voir logs"
  exit 1
fi
