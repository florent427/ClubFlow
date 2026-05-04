# Piège — Brevo rejette les mails si le sender domain n'est PAS authentifié (DB VERIFIED ne suffit pas)

## Symptôme

L'API NestJS reçoit la requête, génère le mail, l'envoie via SMTP
Brevo. SMTP retourne 250 OK (accepté), MAIS Brevo en interne rejette
silencieusement et le destinataire ne reçoit jamais le mail.

Vérifié via Brevo events API :
```
GET https://api.brevo.com/v3/smtp/statistics/events?limit=3
```

```json
{
  "event": "error",
  "from": "noreply@mail.clubflow.topdigital.re",
  "reason": "Sending has been rejected because the sender you used
             noreply@mail.clubflow.topdigital.re is not valid.
             Validate your sender or authenticate your domain"
}
```

⚠️ **Et la DB locale `ClubSendingDomain` peut afficher `verificationStatus = VERIFIED`**
sans que le domaine soit réellement authentifié côté Brevo.

## Contexte

Brevo exige que **chaque sender domain soit authentifié via DKIM/SPF/DMARC**
côté DNS, ET vérifié dans le dashboard Brevo (`Settings → Senders →
Domains`), AVANT d'autoriser l'envoi avec un `From: ...@<domaine>`.

Le `ClubSendingDomain.verificationStatus` côté DB ClubFlow ne représente
que **l'intention** (rangée créée par `ClubSendingDomainService`), pas
l'état réel côté provider.

⚠️ **Sous-domaine ≠ domaine racine** : si `clubflow.topdigital.re` est
authentifié dans Brevo, ça **n'authentifie PAS automatiquement**
`mail.clubflow.topdigital.re`. Chaque sous-domaine d'envoi doit avoir
ses propres records DKIM/SPF/DMARC + son propre row Brevo verified.

## Cause root

2 causes additives :
1. La logique côté ClubFlow set `verificationStatus=VERIFIED` quand
   l'admin clique "Vérifier" même si Brevo n'a pas encore confirmé
2. Brevo applique un check strict côté envoi : si From: domain pas
   dans la liste authenticated → reject

## Solution

### 1. Lister les domains réellement authentifiés Brevo

```bash
sudo bash -c 'source /etc/clubflow/secrets.env && \
  curl -s https://api.brevo.com/v3/senders/domains \
  -H "api-key: $BREVO_API_KEY" \
  | jq ".domains[] | {domain_name, authenticated, verified}"'
```

Output type :
```json
{ "domain_name": "clubflow.topdigital.re", "authenticated": true, "verified": true }
{ "domain_name": "sksr.re", "authenticated": false, "verified": false }
```

Seuls les domaines avec `authenticated=true ET verified=true` peuvent
être utilisés comme sender.

### 2. Aligner la DB avec la vraie liste authentifiée

Update les rows `ClubSendingDomain` pour pointer sur un fqdn vraiment
authentifié. Ex: si seul `clubflow.topdigital.re` est OK :

```sql
UPDATE "ClubSendingDomain"
SET fqdn = 'clubflow.topdigital.re',
    "providerDomainId" = '<id Brevo>',
    "verificationStatus" = 'VERIFIED'
WHERE "clubId" = '<club id>';
```

Et update `apps/api/.env` :
```bash
MAIL_FROM=ClubFlow <noreply@clubflow.topdigital.re>
CLUBFLOW_SENDER_EMAIL=noreply@clubflow.topdigital.re
```

### 3. Pour authentifier un nouveau sous-domaine

Cf. [skill /provision SKILL.md](../../../.claude/skills/provision/SKILL.md)
section "Brevo workflow validé" :
- POST `/v3/senders/domains` avec le fqdn → renvoie records DKIM/SPF/DMARC
- Ajouter ces records côté DNS Cloudflare via API (cf. /provision)
- Attendre propagation (~30s)
- PUT `/v3/senders/domains/<fqdn>/authenticate` → confirme côté Brevo

⚠️ **Note Gmail réputation** : même avec sender authentifié, Gmail
peut flaguer "suspicious" pendant 1-2 semaines (réputation froide).
Mitigations :
- DMARC alignment (envelope MAIL FROM doit aussi aligner — Brevo
  utilise par défaut `bounces.brevoapp.com` → alignment fail).
  Activer "Custom return-path" Brevo si plan le permet.
- Marquer "Non spam" / ajouter à contacts → améliore vite la réputation
- Warm-up : pas envoyer 1000 mails d'un coup pendant 2 semaines

## Détection rapide

```bash
# 3 derniers events Brevo (sent / delivered / error / spam)
sudo bash -c 'source /etc/clubflow/secrets.env && \
  curl -s "https://api.brevo.com/v3/smtp/statistics/events?limit=3" \
  -H "api-key: $BREVO_API_KEY"' | jq

# Cross-check : DB dit quoi pour ce club ?
sudo -u postgres psql clubflow -c "SELECT fqdn, \"verificationStatus\"
  FROM \"ClubSendingDomain\" WHERE \"clubId\" = '<id>';"
```

Si DB = VERIFIED mais Brevo events = "error sender not valid" → c'est
ce pitfall.

## Cas observés

- 2026-05-04 (Phase 1 setup mail prod, 1h debug) :
  - DB `ClubSendingDomain` SKSR avait fqdn `mail.demo.clubflow.local`
    (legacy seed test, jamais authentifié Brevo) → reject
  - Update DB → `mail.clubflow.topdigital.re` → reject (sous-domaine
    pas authentifié)
  - Update DB → `clubflow.topdigital.re` (racine, authentifié) → OK,
    mail livré. Gmail l'a marqué "suspicious" (réputation domaine froide).

## Pourquoi NE PAS faire

- ❌ Faire confiance au `verificationStatus` côté DB sans cross-check
  Brevo events
- ❌ Authentifier le domaine racine et supposer que les sous-domaines
  héritent de l'auth → faux, chaque sub-domain doit avoir son propre
  setup DKIM/SPF/DMARC
- ❌ Attribuer un mail "perdu" à un problème SMTP credentials → si SMTP
  retourne 250 OK, c'est livré au relay Brevo ; le filtre Brevo arrive
  après. Toujours checker `/v3/smtp/statistics/events`.

## Lié

- [pitfalls/brevo-smtp-user-is-not-account-email.md](brevo-smtp-user-is-not-account-email.md) — autre cause de mail KO (auth SMTP)
- [pitfalls/signup-unverified-email-blocks-login.md](signup-unverified-email-blocks-login.md) — symptôme côté user
- [.claude/skills/provision/SKILL.md](../../../.claude/skills/provision/SKILL.md) — workflow auth Brevo + DNS Cloudflare
- [knowledge/contacts-ids.md](../../knowledge/contacts-ids.md) — Brevo domain ID `clubflow.topdigital.re` = `69f8410ed5eb982a25003083`
