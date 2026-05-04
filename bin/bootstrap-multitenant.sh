#!/bin/bash
#
# bootstrap-multitenant.sh — Phase 1 du plan multi-tenant ClubFlow
#
# Provisionne en une seule passe (idempotent) :
#  1. DNS A app.clubflow.topdigital.re via Cloudflare API
#  2. Activation Caddy admin API (port 2019 local-only) + vhost app.clubflow + wildcard vitrine
#  3. Service systemd clubflow-landing (Next.js port 5176)
#  4. Build + start de apps/landing
#  5. SQL migration : SKSR rename + Florent SUPER_ADMIN
#  6. Smoke tests
#
# Pré-requis :
#  - tokens API stockés dans /etc/clubflow/secrets.env (CF_API_TOKEN minimum)
#  - apps/landing build OK (npm ci && npm run build dans /home/clubflow/clubflow/apps/landing)
#  - PostgreSQL accessible via `sudo -u postgres psql clubflow`
#  - artefacts copiés depuis le repo : bin/clubflow-landing.service, bin/migrate-sksr-and-superadmin.sql
#
# Usage côté serveur :
#   sudo bash /usr/local/bin/bootstrap-multitenant.sh
#
# Pour déployer/copier le script depuis le laptop :
#   "/c/Windows/System32/OpenSSH/scp.exe" \
#     bin/bootstrap-multitenant.sh \
#     bin/clubflow-landing.service \
#     bin/caddy-multitenant.snippet \
#     bin/migrate-sksr-and-superadmin.sql \
#     clubflow@89.167.79.253:/tmp/
#   "/c/Windows/System32/OpenSSH/ssh.exe" clubflow@89.167.79.253 \
#     "sudo mv /tmp/bootstrap-multitenant.sh /usr/local/bin/ && \
#      sudo chmod +x /usr/local/bin/bootstrap-multitenant.sh && \
#      sudo bash /usr/local/bin/bootstrap-multitenant.sh"

set -euo pipefail
exec > >(tee -a /var/log/clubflow-bootstrap-multitenant.log) 2>&1

ZONE_ID=159db89b3f066ba9ea329bc08f3d3f1c
SERVER_IPV4=89.167.79.253
SERVER_IPV6=2a01:4f9:c010:99d3::1
APP_DOMAIN=app.clubflow.topdigital.re
LANDING_DOMAIN=clubflow.topdigital.re

if [ "$EUID" -ne 0 ]; then
  echo "❌ Ce script doit être lancé en root (sudo)."
  exit 1
fi

if [ ! -f /etc/clubflow/secrets.env ]; then
  echo "❌ /etc/clubflow/secrets.env manquant. Lance d'abord provision-setup-tokens.sh"
  exit 1
fi

source /etc/clubflow/secrets.env

if [ -z "${CF_API_TOKEN:-}" ]; then
  echo "❌ CF_API_TOKEN absent du secrets.env"
  exit 1
fi

echo ""
echo "============================================================"
echo "🚀 ClubFlow — Bootstrap Phase 1 multi-tenant ($(date +%F\ %T))"
echo "============================================================"

# ============================================================
# 1. DNS A app.clubflow.topdigital.re via CF API (idempotent)
# ============================================================
echo ""
echo "=== 1. DNS Cloudflare ==="

ensure_dns_record() {
  local TYPE="$1"
  local NAME="$2"
  local CONTENT="$3"

  # Cherche un record existant
  local existing
  existing=$(curl -s -H "Authorization: Bearer $CF_API_TOKEN" \
    "https://api.cloudflare.com/client/v4/zones/$ZONE_ID/dns_records?type=$TYPE&name=$NAME.topdigital.re" \
    | jq -r '.result[0].id // empty')

  if [ -n "$existing" ]; then
    # Patch si content diffère
    local current_content
    current_content=$(curl -s -H "Authorization: Bearer $CF_API_TOKEN" \
      "https://api.cloudflare.com/client/v4/zones/$ZONE_ID/dns_records/$existing" \
      | jq -r '.result.content')
    if [ "$current_content" = "$CONTENT" ]; then
      echo "  → $TYPE $NAME = $CONTENT (déjà en place)"
      return
    fi
    curl -s -X PATCH -H "Authorization: Bearer $CF_API_TOKEN" \
      -H "Content-Type: application/json" \
      "https://api.cloudflare.com/client/v4/zones/$ZONE_ID/dns_records/$existing" \
      -d "{\"content\":\"$CONTENT\"}" \
      | jq -r '.success | if . then "  → ✅ '"$TYPE $NAME"' patché → '"$CONTENT"'" else "  → ❌ patch failed" end'
  else
    curl -s -X POST -H "Authorization: Bearer $CF_API_TOKEN" \
      -H "Content-Type: application/json" \
      "https://api.cloudflare.com/client/v4/zones/$ZONE_ID/dns_records" \
      -d "{\"type\":\"$TYPE\",\"name\":\"$NAME\",\"content\":\"$CONTENT\",\"proxied\":false,\"ttl\":1}" \
      | jq -r '.success | if . then "  → ✅ '"$TYPE $NAME"' créé → '"$CONTENT"'" else "  → ❌ création failed" end'
  fi
}

ensure_dns_record A    app.clubflow  "$SERVER_IPV4"
ensure_dns_record AAAA app.clubflow  "$SERVER_IPV6"
ensure_dns_record A    "*.clubflow"  "$SERVER_IPV4"
ensure_dns_record AAAA "*.clubflow"  "$SERVER_IPV6"

# ============================================================
# 2. Caddy admin API + vhosts
# ============================================================
echo ""
echo "=== 2. Caddyfile (admin api + vhosts) ==="

CADDYFILE=/etc/caddy/Caddyfile

if [ ! -f "$CADDYFILE" ]; then
  echo "❌ $CADDYFILE manquant — installation Caddy non standard"
  exit 1
fi

# 2a. admin localhost:2019 + on_demand_tls dans le bloc global { ... }
BACKUP="$CADDYFILE.bak.$(date +%s)"
cp "$CADDYFILE" "$BACKUP"

if grep -qE '^\s*admin\s+localhost:2019' "$CADDYFILE"; then
  echo "  → admin localhost:2019 déjà actif"
else
  awk '
    BEGIN { added=0 }
    /^\{/ && !added { print; print "    admin localhost:2019"; added=1; next }
    { print }
  ' "$BACKUP" > "$CADDYFILE.tmp" && mv "$CADDYFILE.tmp" "$CADDYFILE" || \
    echo "  ⚠️ awk patch admin a échoué, ajoute manuellement 'admin localhost:2019' dans le bloc { ... }"
  echo "  → ✅ admin localhost:2019 ajouté"
fi

if grep -qE '^\s*on_demand_tls' "$CADDYFILE"; then
  echo "  → on_demand_tls déjà actif"
else
  cp "$CADDYFILE" "$BACKUP.on_demand"
  awk '
    BEGIN { added=0 }
    /^\{/ && !added {
      print
      print "    on_demand_tls {"
      print "        ask http://localhost:3000/v1/vitrine/check-domain"
      print "        interval 2m"
      print "        burst 5"
      print "    }"
      added=1
      next
    }
    { print }
  ' "$BACKUP.on_demand" > "$CADDYFILE.tmp" && mv "$CADDYFILE.tmp" "$CADDYFILE" || \
    echo "  ⚠️ awk patch on_demand_tls a échoué, ajoute manuellement le bloc"
  echo "  → ✅ on_demand_tls (ask check-domain) ajouté"
fi

# 2b. vhost app.clubflow.topdigital.re
if grep -q "^app.clubflow.topdigital.re" "$CADDYFILE"; then
  echo "  → vhost $APP_DOMAIN déjà présent"
else
  cat >> "$CADDYFILE" <<'CADDY_APP'

# === app.clubflow.topdigital.re — admin multi-tenant (auto-géré) ===
app.clubflow.topdigital.re {
    encode gzip zstd
    log {
        output file /var/log/caddy/app.clubflow.topdigital.re.log
    }
    root * /home/clubflow/clubflow/apps/admin/dist
    file_server
    try_files {path} /index.html
}
CADDY_APP
  echo "  → ✅ vhost $APP_DOMAIN ajouté"
fi

# 2c. vhost wildcard *.clubflow.topdigital.re (vitrine fallback)
if grep -qE '^\s*\*\.clubflow\.topdigital\.re' "$CADDYFILE"; then
  echo "  → vhost wildcard *.clubflow déjà présent"
else
  cat >> "$CADDYFILE" <<'CADDY_WILDCARD'

# === *.clubflow.topdigital.re — vitrine fallback subdomain ===
# TLS on_demand (HTTP-01 par sous-domaine, sans wildcard cert).
*.clubflow.topdigital.re {
    tls {
        on_demand
    }
    encode gzip zstd
    log {
        output file /var/log/caddy/wildcard-clubflow.log
    }
    reverse_proxy localhost:5175
}
CADDY_WILDCARD
  echo "  → ✅ vhost wildcard *.clubflow.topdigital.re ajouté"
fi

# 2d. Validate + reload Caddy
caddy validate --config "$CADDYFILE" --adapter caddyfile && \
  systemctl reload caddy && \
  echo "  → ✅ Caddy reloaded"

# 2e. Vérif admin API up
sleep 2
if curl -s -o /dev/null -w "%{http_code}" http://localhost:2019/config/ | grep -q '^200$'; then
  echo "  → ✅ admin API joignable sur http://localhost:2019"
else
  echo "  ⚠️ admin API NON joignable (http://localhost:2019). Vérifier le bloc global { admin localhost:2019 }"
fi

# ============================================================
# 3. Service systemd clubflow-landing
# ============================================================
echo ""
echo "=== 3. systemd clubflow-landing ==="

if [ -f /tmp/clubflow-landing.service ]; then
  cp /tmp/clubflow-landing.service /etc/systemd/system/clubflow-landing.service
  chmod 644 /etc/systemd/system/clubflow-landing.service
  systemctl daemon-reload
  systemctl enable clubflow-landing.service 2>&1 | head -2
  echo "  → ✅ unit installée"
else
  echo "  ⚠️ /tmp/clubflow-landing.service manquant — copier depuis le repo (bin/)"
fi

# ============================================================
# 4. Build + start landing
# ============================================================
echo ""
echo "=== 4. Build apps/landing ==="

LANDING_DIR=/home/clubflow/clubflow/apps/landing
if [ -d "$LANDING_DIR" ]; then
  cd "$LANDING_DIR"
  sudo -u clubflow npm ci --omit=dev=false 2>&1 | tail -3
  sudo -u clubflow npm run build 2>&1 | tail -3
  systemctl restart clubflow-landing.service
  sleep 3
  if systemctl is-active --quiet clubflow-landing.service; then
    echo "  → ✅ clubflow-landing UP sur port 5176"
  else
    echo "  ❌ clubflow-landing NOT running"
    systemctl status clubflow-landing.service --no-pager | head -10
  fi
else
  echo "  ⚠️ $LANDING_DIR n'existe pas (le code n'a pas encore été pull)"
fi

# ============================================================
# 5. SQL migration SKSR + Florent SUPER_ADMIN
# ============================================================
echo ""
echo "=== 5. SQL migration SKSR + SUPER_ADMIN ==="

if [ -f /tmp/migrate-sksr-and-superadmin.sql ]; then
  sudo -u postgres psql clubflow -f /tmp/migrate-sksr-and-superadmin.sql 2>&1 | tail -20
else
  echo "  ⚠️ /tmp/migrate-sksr-and-superadmin.sql manquant — copier depuis le repo (bin/)"
fi

# ============================================================
# 6. Smoke tests
# ============================================================
echo ""
echo "=== 6. Smoke tests ==="

for h in clubflow.topdigital.re app.clubflow.topdigital.re api.clubflow.topdigital.re sksr.re; do
  code=$(curl -sS -o /dev/null -w '%{http_code}' "https://$h/" --max-time 10 || echo "000")
  echo "  $code  https://$h/"
done

echo ""
echo "============================================================"
echo "✅ Bootstrap Phase 1 terminé ($(date +%F\ %T))"
echo "============================================================"
echo ""
echo "Prochaines étapes :"
echo "  - Vérifier https://clubflow.topdigital.re (landing) et https://app.clubflow.topdigital.re (admin)"
echo "  - Tester le signup auto sur /signup"
echo "  - Tester createClubAndAdmin via mutation GraphQL"
echo "  - Déployer un nouveau club via signup → vitrine subdomain doit être live en <30s"
echo ""
