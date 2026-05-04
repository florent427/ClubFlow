#!/bin/bash
#
# bootstrap-staging-vps.sh — One-shot setup d'un VPS Hetzner Ubuntu 24.04
# pour héberger l'environnement staging ClubFlow.
#
# Idempotent : ré-exécutable sans casser l'existant.
#
# Pré-requis :
#   - VPS Hetzner CX22+ Ubuntu 24.04 fraîchement provisionné
#   - SSH key Florent + GitHub Actions key dans /home/clubflow/.ssh/authorized_keys
#   - Domaines DNS pointés sur l'IP du VPS staging :
#     * staging.clubflow.topdigital.re      A <ip>
#     * staging.app.clubflow.topdigital.re  A <ip>
#     * staging.api.clubflow.topdigital.re  A <ip>
#     * staging.portail.clubflow.topdigital.re A <ip>
#     * *.staging.clubflow.topdigital.re    A <ip>  (vitrine subdomain wildcard)
#
# Usage (en root sur le VPS) :
#   curl -sSL https://raw.githubusercontent.com/florent427/ClubFlow/main/bin/bootstrap-staging-vps.sh | sudo bash
#
# Ou copier-paste manuel :
#   scp bin/bootstrap-staging-vps.sh root@<ip>:/tmp/
#   ssh root@<ip> "bash /tmp/bootstrap-staging-vps.sh"

set -euo pipefail
exec > >(tee -a /var/log/clubflow-bootstrap-staging.log) 2>&1

GITHUB_REPO="florent427/ClubFlow"
APP_USER="clubflow"
APP_DIR="/home/$APP_USER/clubflow"
NODE_VERSION="20"

if [ "$EUID" -ne 0 ]; then
  echo "❌ Lance en root (sudo)."
  exit 1
fi

echo ""
echo "============================================================"
echo "🚀 ClubFlow Staging — Bootstrap VPS ($(date +%F\ %T))"
echo "============================================================"

# ============================================================
# 1. Système : update + outils de base
# ============================================================
echo ""
echo "=== 1. Système ==="
apt-get update -qq
DEBIAN_FRONTEND=noninteractive apt-get install -qq -y \
  curl wget git ca-certificates gnupg lsb-release \
  ufw fail2ban jq unattended-upgrades sudo postgresql-common \
  build-essential python3-pip

# ============================================================
# 2. User clubflow + SSH
# ============================================================
echo ""
echo "=== 2. User $APP_USER ==="
if ! id "$APP_USER" >/dev/null 2>&1; then
  useradd -m -s /bin/bash "$APP_USER"
  usermod -aG sudo "$APP_USER"
  echo "$APP_USER ALL=(ALL) NOPASSWD: ALL" > /etc/sudoers.d/$APP_USER
  chmod 440 /etc/sudoers.d/$APP_USER
  echo "  → user $APP_USER créé"
fi
mkdir -p /home/$APP_USER/.ssh
chmod 700 /home/$APP_USER/.ssh
chown -R $APP_USER:$APP_USER /home/$APP_USER/.ssh
# ⚠️ Les SSH keys doivent être ajoutées MANUELLEMENT via :
#     ssh-copy-id clubflow@<ip>
# Le script ne touche pas authorized_keys.

# ============================================================
# 3. Node.js 20
# ============================================================
echo ""
echo "=== 3. Node.js $NODE_VERSION ==="
if ! command -v node >/dev/null 2>&1 || ! node --version | grep -qE "^v$NODE_VERSION\."; then
  curl -fsSL https://deb.nodesource.com/setup_${NODE_VERSION}.x | bash -
  apt-get install -y nodejs
fi
echo "  → $(node --version) / $(npm --version)"

# ============================================================
# 4. PostgreSQL 16
# ============================================================
echo ""
echo "=== 4. PostgreSQL 16 ==="
if ! command -v psql >/dev/null 2>&1; then
  /usr/share/postgresql-common/pgdg/apt.postgresql.org.sh -y
  apt-get install -qq -y postgresql-16
fi
systemctl enable --now postgresql

# Crée DB + user clubflow_staging
sudo -u postgres psql -tc "SELECT 1 FROM pg_user WHERE usename='clubflow_staging'" | grep -q 1 || \
  sudo -u postgres psql -c "CREATE USER clubflow_staging WITH PASSWORD 'staging_dev_password_change_me';"
sudo -u postgres psql -tc "SELECT 1 FROM pg_database WHERE datname='clubflow_staging'" | grep -q 1 || \
  sudo -u postgres psql -c "CREATE DATABASE clubflow_staging OWNER clubflow_staging;"
echo "  → DB clubflow_staging prête"

# ============================================================
# 5. Caddy
# ============================================================
echo ""
echo "=== 5. Caddy ==="
if ! command -v caddy >/dev/null 2>&1; then
  apt-get install -y debian-keyring debian-archive-keyring apt-transport-https
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' \
    | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' \
    | tee /etc/apt/sources.list.d/caddy-stable.list
  apt-get update -qq
  apt-get install -y caddy
fi
mkdir -p /var/log/caddy
chown caddy:caddy /var/log/caddy

# ============================================================
# 6. Clone repo
# ============================================================
echo ""
echo "=== 6. Clone ClubFlow repo ==="
if [ ! -d "$APP_DIR/.git" ]; then
  sudo -u $APP_USER git clone "https://github.com/$GITHUB_REPO.git" "$APP_DIR"
fi
cd "$APP_DIR"
sudo -u $APP_USER git fetch origin
sudo -u $APP_USER git checkout staging 2>/dev/null || \
  sudo -u $APP_USER git checkout -b staging origin/main

# ============================================================
# 7. Caddyfile
# ============================================================
echo ""
echo "=== 7. Caddyfile ==="
if [ -f "$APP_DIR/bin/Caddyfile.staging" ]; then
  cp "$APP_DIR/bin/Caddyfile.staging" /etc/caddy/Caddyfile
  systemctl restart caddy
  echo "  → Caddyfile installé + Caddy restart"
else
  echo "  ⚠️ $APP_DIR/bin/Caddyfile.staging manquant — installation Caddyfile staging plus tard"
fi

# ============================================================
# 8. systemd units
# ============================================================
echo ""
echo "=== 8. systemd units ==="
for svc in api admin vitrine landing portal; do
  src="$APP_DIR/bin/clubflow-${svc}-staging.service"
  dst="/etc/systemd/system/clubflow-${svc}-staging.service"
  if [ -f "$src" ]; then
    cp "$src" "$dst"
    chmod 644 "$dst"
    systemctl daemon-reload
    systemctl enable "clubflow-${svc}-staging.service" 2>&1 | head -1
    echo "  → unit clubflow-${svc}-staging installée"
  fi
done

# ============================================================
# 9. clubflow-deploy-staging.sh
# ============================================================
echo ""
echo "=== 9. Deploy script ==="
if [ -f "$APP_DIR/bin/clubflow-deploy-staging.sh" ]; then
  cp "$APP_DIR/bin/clubflow-deploy-staging.sh" /usr/local/bin/
  chmod +x /usr/local/bin/clubflow-deploy-staging.sh
  echo "  → /usr/local/bin/clubflow-deploy-staging.sh installé"
fi

# ============================================================
# 10. .env.staging files (templates)
# ============================================================
echo ""
echo "=== 10. .env (templates à compléter manuellement) ==="
for app in api admin vitrine landing member-portal; do
  src="$APP_DIR/apps/$app/.env.staging.example"
  case "$app" in
    api) dst="$APP_DIR/apps/$app/.env" ;;
    *)   dst="$APP_DIR/apps/$app/.env.production" ;;
  esac
  if [ -f "$src" ] && [ ! -f "$dst" ]; then
    cp "$src" "$dst"
    chown $APP_USER:$APP_USER "$dst"
    chmod 600 "$dst"
    echo "  → $dst créé depuis template (à éditer si besoin)"
  fi
done

# ============================================================
# 11. UFW firewall
# ============================================================
echo ""
echo "=== 11. UFW firewall ==="
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable
echo "  → ufw active : 22, 80, 443"

# ============================================================
# 12. Premier deploy
# ============================================================
echo ""
echo "=== 12. Premier deploy ==="
if [ -x /usr/local/bin/clubflow-deploy-staging.sh ]; then
  /usr/local/bin/clubflow-deploy-staging.sh || \
    echo "  ⚠️ deploy a échoué, lance-le manuellement après avoir édité les .env"
fi

echo ""
echo "============================================================"
echo "✅ Bootstrap staging terminé ($(date +%F\ %T))"
echo "============================================================"
echo ""
echo "Prochaines étapes :"
echo "  1. Vérifier les .env staging dans $APP_DIR/apps/*/"
echo "  2. Test : https://staging.clubflow.topdigital.re"
echo "  3. Configurer GitHub Actions secret SSH_PRIVATE_KEY_STAGING + STAGING_HOST"
echo "  4. Push sur la branche 'staging' → deploy auto"
echo ""
