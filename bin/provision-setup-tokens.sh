#!/bin/bash
#
# provision-setup-tokens.sh — One-time setup interactif des tokens API
#
# Lance directement dans le terminal SSH côté serveur. Demande les tokens
# 1×, les stocke dans /etc/clubflow/secrets.env (root:root, 600).
# Aucun token ne transite par le chat Claude — saisie uniquement par
# read -s dans le terminal.
#
# Pré-requis : sudo accès. Idéalement lancer en root direct ou via sudo.
#
# Usage :
#   sudo bash /usr/local/bin/provision-setup-tokens.sh
#
# Une fois fait, Claude peut tout faire en autonomie via le skill /provision.

set -euo pipefail

SECRETS_FILE=/etc/clubflow/secrets.env

# Vérif sudo
if [ "$EUID" -ne 0 ]; then
  echo "❌ Ce script doit être lancé en root (sudo)."
  exit 1
fi

mkdir -p /etc/clubflow
touch "$SECRETS_FILE"
chmod 600 "$SECRETS_FILE"
chown root:root "$SECRETS_FILE"

echo ""
echo "============================================================"
echo "🔐 ClubFlow — Setup des tokens API tier-3rd-party"
echo "============================================================"
echo ""
echo "Ce script va te demander de coller 4 tokens API."
echo "Aucun token ne sera affiché à l'écran (saisie masquée)."
echo "Tokens stockés dans $SECRETS_FILE (chmod 600 root only)."
echo ""

# Helper : prompt + write to file
prompt_token() {
  local var_name="$1"
  local provider="$2"
  local generation_url="$3"
  local hint="$4"

  echo "──────────────────────────────────────────────"
  echo "📝 $provider"
  echo "──────────────────────────────────────────────"
  echo "  → $hint"
  echo "  → Console : $generation_url"
  echo ""

  # Check si déjà présent
  if grep -q "^${var_name}=" "$SECRETS_FILE" 2>/dev/null; then
    read -r -p "⚠️  $var_name déjà défini. Remplacer ? [y/N] " replace
    if [ "${replace,,}" != "y" ]; then
      echo "  → Skip $var_name"
      return
    fi
    sed -i "/^${var_name}=/d" "$SECRETS_FILE"
  fi

  read -r -s -p "Coller le token (saisie masquée, Enter pour skip) : " token
  echo ""
  if [ -z "$token" ]; then
    echo "  → Skip $var_name"
    return
  fi

  echo "${var_name}=${token}" >> "$SECRETS_FILE"
  echo "  → ✅ Stocké dans $SECRETS_FILE"
  echo ""
}

# 1. Cloudflare
prompt_token "CF_API_TOKEN" "Cloudflare API Token" \
  "https://dash.cloudflare.com/profile/api-tokens" \
  "Permissions Zone:DNS:Edit + Zone:Read sur topdigital.re"

# 2. hCaptcha
prompt_token "HCAPTCHA_API_KEY" "hCaptcha Account Owner Secret" \
  "https://dashboard.hcaptcha.com/account_settings" \
  "Settings → Account → 'Account Owner Secret'. Permet le mgmt API des sites."

# 3. Brevo (REST API)
prompt_token "BREVO_API_KEY" "Brevo REST API Key" \
  "https://app.brevo.com/security/api-keys" \
  "SMTP & API → API Keys → Generate. Format xkeysib-..."

# 4. Hetzner (optionnel)
prompt_token "HETZNER_API_TOKEN" "Hetzner Cloud API Token (optionnel)" \
  "https://console.hetzner.com/projects/14444062/security/api-tokens" \
  "Read & Write. Pour snapshots pre-maintenance + monitoring."

# Test des 4 accès
echo ""
echo "============================================================"
echo "🧪 Test des accès"
echo "============================================================"
source "$SECRETS_FILE"

echo ""
echo -n "Cloudflare : "
if [ -n "${CF_API_TOKEN:-}" ]; then
  curl -s -H "Authorization: Bearer $CF_API_TOKEN" \
    "https://api.cloudflare.com/client/v4/user/tokens/verify" \
    | jq -r '.success | if . then "✅ token valide" else "❌ rejeté" end' 2>/dev/null || echo "❌ erreur curl"
else
  echo "⏭️  skipped"
fi

echo -n "hCaptcha    : "
if [ -n "${HCAPTCHA_API_KEY:-}" ]; then
  resp=$(curl -s -H "Authorization: Bearer $HCAPTCHA_API_KEY" \
    "https://api.hcaptcha.com/sitekeys" 2>/dev/null)
  if echo "$resp" | grep -q '"success":true' 2>/dev/null; then
    echo "✅ token valide"
  elif echo "$resp" | grep -q "site" 2>/dev/null; then
    echo "✅ token valide"
  else
    echo "⚠️  réponse inattendue (peut être OK selon endpoint)"
  fi
else
  echo "⏭️  skipped"
fi

echo -n "Brevo       : "
if [ -n "${BREVO_API_KEY:-}" ]; then
  email=$(curl -s -H "api-key: $BREVO_API_KEY" \
    "https://api.brevo.com/v3/account" | jq -r '.email // "ERROR"' 2>/dev/null)
  if [ "$email" != "ERROR" ] && [ "$email" != "null" ]; then
    echo "✅ compte $email"
  else
    echo "❌ token rejeté"
  fi
else
  echo "⏭️  skipped"
fi

echo -n "Hetzner     : "
if [ -n "${HETZNER_API_TOKEN:-}" ]; then
  name=$(curl -s -H "Authorization: Bearer $HETZNER_API_TOKEN" \
    "https://api.hetzner.cloud/v1/servers?per_page=1" | jq -r '.servers[0].name // "ERROR"' 2>/dev/null)
  if [ "$name" != "ERROR" ] && [ "$name" != "null" ]; then
    echo "✅ server $name"
  else
    echo "❌ token rejeté"
  fi
else
  echo "⏭️  skipped"
fi

echo ""
echo "============================================================"
echo "✅ Setup terminé."
echo "============================================================"
echo ""
echo "Tokens stockés dans : $SECRETS_FILE"
echo ""
echo "Usage côté Claude :"
echo "  Le skill /provision peut maintenant ajouter des records DNS,"
echo "  créer des sites hCaptcha, configurer des sender domains Brevo,"
echo "  etc. en autonomie via les APIs."
echo ""
echo "Re-lance ce script si tu veux ajouter / changer un token :"
echo "  sudo bash $(realpath "$0")"
echo ""
