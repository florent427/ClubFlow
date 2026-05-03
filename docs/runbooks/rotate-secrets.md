# Runbook — Rotation des secrets

> Référencé par `knowledge/auth-secrets.md`. Procédure pour roter les
> secrets en cas de compromission ou de bonne hygiène (1x/an minimum).

## Quels secrets ?

| Secret | Emplacement(s) | Impact rotation |
|---|---|---|
| `JWT_SECRET` | `apps/api/.env` + `apps/vitrine/.env.production` | Re-login global |
| `REFRESH_SECRET` | `apps/api/.env` | Re-login global |
| `DATABASE_URL` (mdp) | `apps/api/.env` | Restart API |
| GitHub Actions SSH key | repo Secret `SSH_PRIVATE_KEY` + serveur `~/.ssh/authorized_keys` | Pipeline cassé jusqu'à update |
| Storage Box password | `/root/.clubflow-storagebox-password` + rclone.conf | Backups cassés jusqu'à update |
| `BREVO_API_KEY` | `apps/api/.env` | Mails cassés jusqu'à update |
| Mots de passe admin | DB Postgres | Aucun, à faire via UI |

## Rotation `JWT_SECRET` + `REFRESH_SECRET`

⚠️ **Conséquence** : tous les utilisateurs sont déconnectés et doivent
re-login. Notifier en avance.

```bash
NEW_JWT=$(openssl rand -base64 64 | tr -d '\n')
NEW_REFRESH=$(openssl rand -base64 64 | tr -d '\n')

ssh-into-prod "
  sudo sed -i 's|^JWT_SECRET=.*|JWT_SECRET=$NEW_JWT|' /home/clubflow/clubflow/apps/api/.env
  sudo sed -i 's|^REFRESH_SECRET=.*|REFRESH_SECRET=$NEW_REFRESH|' /home/clubflow/clubflow/apps/api/.env
  sudo sed -i 's|^VITRINE_JWT_SECRET=.*|VITRINE_JWT_SECRET=$NEW_JWT|' /home/clubflow/clubflow/apps/vitrine/.env.production
  cd /home/clubflow/clubflow/apps/vitrine && rm -rf .next/cache .next && npm run build
  sudo systemctl restart clubflow-api clubflow-vitrine
"
```

## Rotation password Postgres `clubflow`

```bash
NEW_DB_PWD=$(openssl rand -base64 32 | tr -d '\n=/')
ssh-into-prod "
  sudo -u postgres psql -c \"ALTER ROLE clubflow PASSWORD '$NEW_DB_PWD';\"
  echo '$NEW_DB_PWD' | sudo tee /root/.clubflow-db-password > /dev/null
  sudo sed -i 's|postgresql://clubflow:[^@]*@|postgresql://clubflow:$NEW_DB_PWD@|' /home/clubflow/clubflow/apps/api/.env
  sudo systemctl restart clubflow-api
"
```

## Rotation clé SSH GitHub Actions

⚠️ Ne pas faire en plein déploiement actif (workflow en cours).

```bash
# 1. Générer nouvelle paire (sur laptop)
ssh-keygen -t ed25519 -C "clubflow-gha-rotated-$(date +%Y%m%d)" \
  -f ~/.ssh/id_ed25519_clubflow_gha_new -N ""

# 2. Ajouter la pubkey sur le serveur (en gardant l'ancienne pour transition)
ssh-into-prod "echo '$(cat ~/.ssh/id_ed25519_clubflow_gha_new.pub)' >> /home/clubflow/.ssh/authorized_keys"

# 3. Update le secret GitHub
gh secret set SSH_PRIVATE_KEY --repo florent427/ClubFlow < ~/.ssh/id_ed25519_clubflow_gha_new

# 4. Déclencher un deploy de test
gh workflow run deploy.yml -f tag=main && gh run watch

# 5. Si OK : supprimer l'ancienne clé du serveur
ssh-into-prod "sed -i '/clubflow-gha [^r]/d' /home/clubflow/.ssh/authorized_keys"
rm ~/.ssh/id_ed25519_clubflow_gha
mv ~/.ssh/id_ed25519_clubflow_gha_new ~/.ssh/id_ed25519_clubflow_gha
mv ~/.ssh/id_ed25519_clubflow_gha_new.pub ~/.ssh/id_ed25519_clubflow_gha.pub
```

## Rotation Storage Box password

Console Hetzner → Storage Boxes → 570065 → Subaccount `u587664-sub1`
→ Reset password.

```bash
NEW_SB_PWD="<nouveau-mdp-affiché-par-Hetzner>"
ssh-into-prod "
  echo '$NEW_SB_PWD' | sudo tee /root/.clubflow-storagebox-password > /dev/null
  sudo -u clubflow sed -i 's|^pass = .*|pass = $(echo \"$NEW_SB_PWD\" | rclone obscure -)|' /home/clubflow/.config/rclone/rclone.conf
  sudo /usr/local/bin/clubflow-backup.sh  # test
"
```

## Rotation `BREVO_API_KEY`

Console Brevo → SMTP & API → API Keys → Generate.

```bash
NEW_BREVO_KEY="<copié-depuis-console-Brevo>"
ssh-into-prod "
  sudo sed -i 's|^BREVO_API_KEY=.*|BREVO_API_KEY=$NEW_BREVO_KEY|' /home/clubflow/clubflow/apps/api/.env
  sudo systemctl restart clubflow-api
"
```

## Rotation mots de passe admin (utilisateurs DB)

Pas de procédure spéciale : chaque admin va dans son profil sur l'admin
web et change son mdp. Si oubli total → reset via Postgres :

```bash
ssh-into-prod "
  cd /home/clubflow/clubflow/apps/api
  npm run -- script:reset-password admin@clubflow.local
  # Le mdp est imprimé dans le terminal, à transmettre en sécurité
"
```

(Script à coder si pas encore présent.)

## Checklist post-rotation

- [ ] Smoke test 4 vhosts (200 attendu)
- [ ] Test login admin web
- [ ] Test envoi mail (depuis admin → "Tester SMTP")
- [ ] Test backup manuel : `sudo /usr/local/bin/clubflow-backup.sh`
- [ ] Test deploy via GHA : `gh workflow run deploy.yml -f tag=main && gh run watch`
- [ ] Documenter la rotation dans un commit `chore: rotate <secret> $(date)` (sans
      la valeur dans le message bien sûr).
