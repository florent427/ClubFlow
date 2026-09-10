#!/usr/bin/env bash
# bin/web-push-vapid-setup.sh — Génère la paire VAPID (Web Push) SUR le
# serveur, l'ajoute à apps/api/.env et redémarre l'API. Idempotent : ne
# touche à rien si la clé publique est déjà présente. La clé privée n'est
# jamais affichée (elle ne doit exister que dans le .env du serveur).
#
# Usage depuis le poste de travail (staging) :
#   "/c/Windows/System32/OpenSSH/ssh.exe" clubflow@46.62.197.93 \
#     'SVC=clubflow-api-staging bash -s' < bin/web-push-vapid-setup.sh
# Prod :
#   "/c/Windows/System32/OpenSSH/ssh.exe" clubflow@89.167.79.253 \
#     'SVC=clubflow-api bash -s' < bin/web-push-vapid-setup.sh
#
# Pré-requis : apps/api/node_modules/web-push installé (fait par le déploiement).
# Changer la paire invalide tous les abonnements : les adhérents devront
# réactiver les notifications (cf. docs/runbooks/restore-env.md).
set -eu
SVC="${SVC:-clubflow-api-staging}"
cd /home/clubflow/clubflow/apps/api

if grep -q '^WEB_PUSH_VAPID_PUBLIC_KEY=' .env; then
  echo "déjà présent : $(grep '^WEB_PUSH_VAPID_PUBLIC_KEY=' .env)"
else
  node -e '
const wp = require("web-push");
const fs = require("fs");
const k = wp.generateVAPIDKeys();
let s = fs.readFileSync(".env", "utf8");
if (!s.endsWith("\n")) s += "\n";
s += "\n# Web Push (portail) — paire VAPID générée le " + new Date().toISOString().slice(0, 10) + "\n";
s += "WEB_PUSH_VAPID_PUBLIC_KEY=" + k.publicKey + "\n";
s += "WEB_PUSH_VAPID_PRIVATE_KEY=" + k.privateKey + "\n";
s += "WEB_PUSH_VAPID_SUBJECT=https://clubflow.topdigital.re\n";
fs.writeFileSync(".env", s, { mode: 0o600 });
console.log("ajouté : WEB_PUSH_VAPID_PUBLIC_KEY=" + k.publicKey);
'
  chmod 600 .env
fi

sudo systemctl restart "$SVC"
LOG="/var/log/${SVC}.log"
for _ in $(seq 1 30); do
  sleep 3
  if [ -f "$LOG" ] && tail -n 50 "$LOG" | grep -q "successfully started"; then break; fi
done
echo "service : $(sudo systemctl is-active "$SVC")"
if [ -f "$LOG" ]; then
  last=$(grep -n "Starting Nest application" "$LOG" | tail -1 | cut -d: -f1)
  echo "avertissements « Web Push désactivé » au dernier démarrage : $(tail -n +"${last:-1}" "$LOG" | grep -c 'Web Push désactivé' || true) (0 attendu)"
fi
