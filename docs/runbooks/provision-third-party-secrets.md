# Runbook — One-time setup des tokens API tier-3rd-party

> Permet à Claude (via le skill [`/provision`](../../.claude/skills/provision/SKILL.md))
> de gérer DNS, hCaptcha, Brevo, Hetzner via leurs APIs sans cliquer dans les
> dashboards. **À faire 1× par projet**, puis tout le reste devient autonome.

## Pourquoi ?

Les actions "shared infrastructure" (DNS, accounts) via Chrome MCP sont
**bloquées par les safety checks** de Claude Code. Workaround universel :
provisioning via API tokens stockés côté serveur.

Une fois les tokens en place, Claude peut :
- Ajouter/supprimer des records DNS Cloudflare
- Créer/lister des sites hCaptcha
- Configurer des sender domains Brevo
- Faire un snapshot Hetzner avant maintenance

## Étape 1 — Créer le fichier de secrets centralisé

Sur le serveur, **action utilisateur** (1× au setup) :

```bash
ssh-into-prod 'sudo mkdir -p /etc/clubflow && \
  sudo touch /etc/clubflow/secrets.env && \
  sudo chmod 600 /etc/clubflow/secrets.env && \
  sudo chown root:root /etc/clubflow/secrets.env && \
  ls -la /etc/clubflow/secrets.env'
```

→ doit afficher `-rw------- root root`

## Étape 2 — Cloudflare API token

### a. Créer le token
1. Aller sur https://dash.cloudflare.com/profile/api-tokens
2. Cliquer **"Create Token"** → **"Custom token"**
3. Permissions :
   - Zone — Zone — Read
   - Zone — DNS — Edit
4. Zone Resources : **Include** → Specific zone → `topdigital.re`
5. Cliquer **Continue → Create Token**
6. Copier le token (visible **une seule fois**)

### b. Stocker côté serveur
```bash
# REMPLACER le placeholder par ton vrai token
ssh-into-prod 'echo "CF_API_TOKEN=YOUR_TOKEN_HERE" | sudo tee -a /etc/clubflow/secrets.env'
```

### c. Test
```bash
ssh-into-prod 'source /etc/clubflow/secrets.env && \
  curl -s -H "Authorization: Bearer $CF_API_TOKEN" \
  "https://api.cloudflare.com/client/v4/user/tokens/verify" | jq ".success, .result.status"'
```
→ `true, "active"`

## Étape 3 — hCaptcha

### a. Compte (si pas existant)
1. https://dashboard.hcaptcha.com → Sign Up (email + password)
2. Vérifier email
3. Login

### b. Récupérer la **secret key** du compte (pour API admin)
1. Settings → Account → "Account Owner Secret"
2. Ou : créer un site → noter la secret key affichée
3. Copier dans :

```bash
ssh-into-prod 'echo "HCAPTCHA_API_KEY=YOUR_KEY" | sudo tee -a /etc/clubflow/secrets.env'
```

### c. Pour le 1er site (signup ClubFlow), créer manuellement
1. Dashboard → New Site → Hostnames: `clubflow.topdigital.re`
2. Copier **Site Key** (publique) → `apps/landing/.env.production` :
   ```
   NEXT_PUBLIC_HCAPTCHA_SITE_KEY=10000000-ffff-...
   ```
3. Copier **Secret Key** → `apps/api/.env` :
   ```
   HCAPTCHA_SECRET=0xAAAAAAAAA...
   ```
4. Restart API : `sudo systemctl restart clubflow-api`

Pour les **sites suivants** (un par club si besoin), Claude pourra les
créer via le skill `/provision`.

## Étape 4 — Brevo

### a. Compte
1. https://app.brevo.com → Sign Up (formule gratuite : 300 mails/jour)
2. Vérifier email
3. Login

### b. Générer une clé API SMTP + REST
1. Console → "SMTP & API" → "API Keys" → "Generate a new API key"
2. Nom : "ClubFlow API"
3. Copier la clé (visible 1×, format `xkeysib-...`)

```bash
ssh-into-prod 'echo "BREVO_API_KEY=xkeysib-YOUR_KEY" | sudo tee -a /etc/clubflow/secrets.env'
```

### c. Stocker aussi côté API ClubFlow (pour TransactionalMailService)
```bash
ssh-into-prod 'sudo nano /home/clubflow/clubflow/apps/api/.env'
# Ajouter :
SMTP_HOST=smtp-relay.brevo.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=YOUR_BREVO_LOGIN_EMAIL
SMTP_PASS=YOUR_SMTP_KEY  # PAS la API key, mais la "SMTP key" séparée affichée dans SMTP & API
```

⚠️ Brevo distingue :
- **API key** (REST API, format `xkeysib-...`) → pour le skill `/provision`
- **SMTP key** (format `xsmtpsib-...`) → pour Nodemailer côté API

Les 2 sont nécessaires pour des usages différents.

### d. Vérifier domaine d'envoi
Pour chaque domaine d'expédition (clubflow.topdigital.re, sksr.re, etc.),
ajouter les records DNS DKIM/SPF/DMARC fournis par Brevo. Le skill
`/provision` peut le faire pour Cloudflare-managed domains :

```bash
# Crée le domaine côté Brevo + récupère les DNS records à poser
# (cf. /provision section "Brevo")
```

## Étape 5 — Hetzner Cloud (optionnel)

Pour snapshot pré-maintenance, scaling, monitoring :

### a. Token API
1. https://console.hetzner.com/projects → ClubFlow project (14444062)
2. Security → API Tokens → "Generate API token"
3. Read & Write
4. Copier

```bash
ssh-into-prod 'echo "HETZNER_API_TOKEN=YOUR_TOKEN" | sudo tee -a /etc/clubflow/secrets.env'
```

## Étape 6 — Vérification finale

```bash
ssh-into-prod 'sudo cat /etc/clubflow/secrets.env | grep -c "^[A-Z]" && echo "tokens présents"'
# Doit afficher 4 ou 5 (CF + HCAPTCHA + BREVO + HETZNER)
```

Test des accès :

```bash
ssh-into-prod 'source /etc/clubflow/secrets.env

# CF
echo "=== Cloudflare ==="
curl -s -H "Authorization: Bearer $CF_API_TOKEN" \
  "https://api.cloudflare.com/client/v4/user/tokens/verify" | jq -r ".success"

# hCaptcha
echo "=== hCaptcha ==="
curl -s -H "Authorization: Bearer $HCAPTCHA_API_KEY" \
  "https://api.hcaptcha.com/sites?limit=1" | jq -r "if .sites then \"OK\" else .error end"

# Brevo
echo "=== Brevo ==="
curl -s -H "api-key: $BREVO_API_KEY" \
  "https://api.brevo.com/v3/account" | jq -r ".email"

# Hetzner (optionnel)
echo "=== Hetzner ==="
curl -s -H "Authorization: Bearer $HETZNER_API_TOKEN" \
  "https://api.hetzner.cloud/v1/servers?per_page=1" | jq -r ".servers[0].name"'
```

→ 4 lignes "OK" / "true" / email / "clubflow-prod" = setup complet ✅

## Rotation des tokens

Tous les 6 mois minimum :
1. Régénérer chaque token côté provider
2. Update `/etc/clubflow/secrets.env`
3. Restart les services qui les consomment :
   ```bash
   ssh-into-prod 'sudo systemctl restart clubflow-api'
   ```

## Sécurité

- `/etc/clubflow/secrets.env` chmod 600 owner root → **PAS lisible par user clubflow**
  - Si un script en user `clubflow` doit lire, il passe par sudo
- **JAMAIS** commiter dans git
- **JAMAIS** afficher les valeurs dans des logs ou messages chat
- Backup chiffré (clé GPG perso) sur ton laptop pour rollback

## Lié

- [.claude/skills/provision/SKILL.md](../../.claude/skills/provision/SKILL.md) — utilisation des tokens
- [docs/memory/pitfalls/safety-blocks-shared-infra-mcp.md](../memory/pitfalls/safety-blocks-shared-infra-mcp.md)
- [docs/runbooks/rotate-secrets.md](rotate-secrets.md)
