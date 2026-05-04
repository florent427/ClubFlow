#!/bin/bash
#
# clubflow-deploy-staging.sh — Pipeline deploy staging
#
# Calque sur clubflow-deploy.sh prod, mais :
#  - branche `staging` (au lieu de main)
#  - DB clubflow_staging
#  - services systemd clubflow-{api,vitrine,landing}-staging
#  - smoke test sur staging.* domains
#
# Lancé en root sur le VPS staging via SSH (GitHub Actions ou manuel).

set -euo pipefail
exec > >(tee -a /var/log/clubflow-deploy-staging.log) 2>&1

REPO_DIR=/home/clubflow/clubflow
APP_USER=clubflow

cd "$REPO_DIR"

echo ""
echo "============================================================"
echo "🚀 ClubFlow STAGING deploy ($(date +%F\ %T))"
echo "============================================================"

# ============================================================
# Phase 0 — Pre-checks .env staging
# ============================================================
echo ""
echo "=== Phase 0 — Pre-checks ==="
for f in apps/api/.env apps/admin/.env.production apps/vitrine/.env.production apps/landing/.env.production; do
  if [ ! -f "$REPO_DIR/$f" ]; then
    echo "  ❌ $f manquant — runbook : docs/runbooks/staging-vps-bootstrap.md"
    exit 1
  fi
done
echo "  ✅ tous les .env présents"

# ============================================================
# Phase 1 — git pull staging
# ============================================================
echo ""
echo "=== Phase 1 — git pull staging ==="
sudo -u $APP_USER git fetch origin
sudo -u $APP_USER git reset --hard origin/staging
HEAD=$(git rev-parse --short HEAD)
echo "  → HEAD : $HEAD"

# ============================================================
# Phase 2 — API NestJS
# ============================================================
echo ""
echo "=== Phase 2 — API ==="
cd "$REPO_DIR/apps/api"
sudo -u $APP_USER npm ci 2>&1 | tail -3
sudo -u $APP_USER npx prisma generate 2>&1 | tail -2
# db push : crée/sync le schema sans migration (cf. ADR-0003)
sudo -u $APP_USER npx prisma db push --accept-data-loss 2>&1 | tail -3
sudo -u $APP_USER npx nest build 2>&1 | tail -3

# ============================================================
# Phase 3 — Admin (Vite SPA)
# ============================================================
echo ""
echo "=== Phase 3 — Admin ==="
cd "$REPO_DIR/apps/admin"
sudo -u $APP_USER npm ci 2>&1 | tail -3
sudo -u $APP_USER npx vite build 2>&1 | tail -3

# ============================================================
# Phase 4 — Portail
# ============================================================
echo ""
echo "=== Phase 4 — Portail ==="
cd "$REPO_DIR/apps/member-portal"
sudo -u $APP_USER npm ci 2>&1 | tail -3
sudo -u $APP_USER npx vite build 2>&1 | tail -3

# ============================================================
# Phase 5 — Vitrine (Next.js)
# ============================================================
echo ""
echo "=== Phase 5 — Vitrine ==="
cd "$REPO_DIR/apps/vitrine"
sudo -u $APP_USER npm ci 2>&1 | tail -3
sudo -u $APP_USER rm -rf .next/cache .next
sudo -u $APP_USER npm run build 2>&1 | tail -3

# ============================================================
# Phase 6 — Landing (Next.js)
# ============================================================
echo ""
echo "=== Phase 6 — Landing ==="
cd "$REPO_DIR/apps/landing"
sudo -u $APP_USER npm ci 2>&1 | tail -3
sudo -u $APP_USER rm -rf .next/cache .next
sudo -u $APP_USER npm run build 2>&1 | tail -3

# ============================================================
# Phase 7 — Restart services + reload Caddy
# ============================================================
echo ""
echo "=== Phase 7 — Restart services ==="
systemctl restart clubflow-api-staging clubflow-vitrine-staging clubflow-landing-staging
systemctl reload caddy
sleep 5
for svc in clubflow-api-staging clubflow-vitrine-staging clubflow-landing-staging; do
  if systemctl is-active --quiet "$svc"; then
    echo "  ✅ $svc active"
  else
    echo "  ❌ $svc DOWN"
    systemctl status "$svc" --no-pager | head -10
    exit 1
  fi
done

# ============================================================
# Phase 8 — Smoke test
# ============================================================
echo ""
echo "=== Phase 8 — Smoke test ==="
SMOKE_OK=1
for h in staging.clubflow.topdigital.re staging.app.clubflow.topdigital.re staging.portail.clubflow.topdigital.re; do
  code=$(curl -sS -o /dev/null -w '%{http_code}' "https://$h/" --max-time 10 || echo 000)
  echo "  $code  https://$h/"
  [ "$code" = "200" ] || SMOKE_OK=0
done

api_code=$(curl -sS -o /dev/null -w '%{http_code}' \
  -X POST https://staging.api.clubflow.topdigital.re/graphql \
  -H 'Content-Type: application/json' \
  -H 'apollo-require-preflight: true' \
  -H 'Origin: https://staging.app.clubflow.topdigital.re' \
  -d '{"query":"{__typename}"}')
echo "  $api_code  https://staging.api.clubflow.topdigital.re/graphql"
[ "$api_code" = "200" ] || SMOKE_OK=0

if [ "$SMOKE_OK" = "1" ]; then
  echo ""
  echo "============================================================"
  echo "✅ STAGING deploy OK ($HEAD)"
  echo "============================================================"
  exit 0
else
  echo ""
  echo "============================================================"
  echo "❌ STAGING smoke test failed (HEAD $HEAD)"
  echo "============================================================"
  exit 1
fi
