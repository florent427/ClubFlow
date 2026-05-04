# Piège — Brevo SMTP : `SMTP_USER` n'est PAS l'email du compte

## Symptôme

Configuration SMTP côté API NestJS pour relayer via Brevo :
```bash
SMTP_HOST=smtp-relay.brevo.com
SMTP_PORT=587
SMTP_USER=florent.morel427@gmail.com   # ← email du compte Brevo
SMTP_PASS=xsmtpsib-...                  # ← SMTP key valide
```

Au 1er envoi de mail, l'API affiche :
```
Envoi SMTP impossible : Invalid login: 535 5.7.8 Authentication failed
```

## Contexte

Brevo SMTP relay utilise un **SMTP user dédié** (de la forme
`<id>@smtp-brevo.com`), pas l'email du compte humain qui a créé le
compte Brevo. C'est contre-intuitif vs Gmail SMTP / Mailgun où l'email
du compte sert d'identifiant.

## Cause root

Dans le panel Brevo `Settings → SMTP & API → SMTP`, le champ "SMTP
identifier" (ou "SMTP user") est généré automatiquement. Pas affiché
au même endroit que la SMTP key.

## Solution

### Récupérer le bon SMTP user via API

```bash
sudo bash -c 'source /etc/clubflow/secrets.env && \
  curl -s https://api.brevo.com/v3/account \
  -H "api-key: $BREVO_API_KEY" \
  | jq ".relay"'
```

Réponse :
```json
{
  "enabled": true,
  "data": {
    "userName": "9cc2eb001@smtp-brevo.com",
    "relay": "smtp-relay.brevo.com",
    "port": 587
  }
}
```

→ `userName` = la valeur à mettre dans `SMTP_USER`.

### Config finale `.env` API

```bash
SMTP_HOST=smtp-relay.brevo.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=9cc2eb001@smtp-brevo.com   # ← le SMTP user dédié
SMTP_PASS=xsmtpsib-...                # ← SMTP key (générée dans dashboard)
MAIL_FROM=ClubFlow <noreply@clubflow.topdigital.re>
```

Restart `clubflow-api` après modif.

## Détection rapide

```bash
# Tail API logs après tentative d'envoi
sudo tail /var/log/clubflow-api.log | grep -iE 'smtp|535|invalid login'
# Si "535 5.7.8 Authentication failed" → vérifier SMTP_USER
```

## Cas observés

- 2026-05-04 (Phase 1 setup mail prod) : 1er essai forgot password →
  "Invalid login 535". 30 min de debug avant de trouver le `userName`
  via `/v3/account`. Fix : remplacer `SMTP_USER=florent.morel427@gmail.com`
  par `SMTP_USER=9cc2eb001@smtp-brevo.com`.

## Pourquoi NE PAS faire

- ❌ Mettre l'email du compte humain comme SMTP_USER → 535 systématique
- ❌ Hardcoder le SMTP user dans le code → si tu changes de compte
  Brevo, tu dois modifier le code

## Lié

- [pitfalls/brevo-sender-domain-must-be-authenticated.md](brevo-sender-domain-must-be-authenticated.md) — autre cause de mail rejeté Brevo (sender pas authentifié)
- [pitfalls/signup-unverified-email-blocks-login.md](signup-unverified-email-blocks-login.md) — symptôme user-side
- [.claude/skills/provision/SKILL.md](../../../.claude/skills/provision/SKILL.md) — workflow setup Brevo
- Brevo API account : https://developers.brevo.com/reference/getaccount
