# Piège — Signup self-service : compte créé mais bloqué au login (email pas vérifié)

## Symptôme

Un utilisateur s'inscrit via `/signup` sur la landing publique. La page
de succès affiche "🎉 Bienvenue sur ClubFlow ! Votre club X a été créé"
**avec mention "L'email de vérification n'a pas pu être envoyé"**.

Quand l'utilisateur essaie de se connecter sur `/login`, l'API retourne :
```
Identifiants invalides ou compte inaccessible.
```

Pourtant l'email + mot de passe sont bien ceux fournis. Et le `User` row
existe en DB. Mais avec `emailVerifiedAt = NULL`.

## Contexte

`createClubAndAdmin` (`apps/api/src/auth/auth.service.ts`) :
1. Crée le `User` row (sans `emailVerifiedAt`)
2. Génère un token de vérification
3. **Tente** d'envoyer le mail de vérification (best-effort try/catch)
4. Si SMTP KO → log warning + retourne `emailSent: false` mais signup OK

`login` exige `emailVerifiedAt IS NOT NULL` (sécurité — empêche que
quelqu'un signup avec ton email avant toi). D'où le blocage.

Le mail est nécessaire mais pas critique pour le signup → si SMTP
n'est pas configuré, **chaque user signup reste coincé** sans aucun moyen
de récupérer (pas de re-send mail, pas d'auto-verify).

## Cause root

`apps/api/.env` côté prod manque la config SMTP relay (Brevo) :
```bash
# Manquant ou vide :
BREVO_SMTP_USER=
BREVO_SMTP_PASS=
MAIL_FROM=
CLUBFLOW_SENDER_EMAIL=
```

→ `MailService.sendEmailVerificationLink` throw → le catch dans
`createClubAndAdmin` log warning et continue → `emailSent: false`.

## Solution

### Court terme — activer manuellement le user (workaround ops)

```bash
ssh-into-prod "sudo -u postgres psql clubflow -c \"
  UPDATE \\\"User\\\" SET \\\"emailVerifiedAt\\\" = NOW()
  WHERE email = 'user@example.com'
  RETURNING id, email, \\\"emailVerifiedAt\\\" IS NOT NULL AS verified;
\""
```

L'user peut ensuite se connecter normalement.

### Moyen terme — configurer le SMTP relay Brevo

```bash
# Côté server, dans /home/clubflow/clubflow/apps/api/.env :
BREVO_SMTP_USER=<user-brevo>           # cf. dashboard.brevo.com SMTP & API
BREVO_SMTP_PASS=<smtp-key>             # à générer dans Brevo
MAIL_FROM="ClubFlow <noreply@mail.clubflow.topdigital.re>"
CLUBFLOW_SENDER_EMAIL=noreply@mail.clubflow.topdigital.re

# Reload :
sudo systemctl restart clubflow-api
```

⚠️ Pré-requis : le sender domain `mail.clubflow.topdigital.re` doit être
authentifié côté Brevo (DKIM/SPF/DMARC). Cf. skill `/provision` workflow
Brevo end-to-end. Ou utiliser un sender mutualisé Brevo (default sender
gratuit).

### Long terme — endpoint `/auth/resend-verification`

Côté API, ajouter une mutation publique `resendVerificationEmail(email)`
+ rate-limit + bouton "Renvoyer l'email" sur la page login.

## Détection rapide

```bash
# Lister les users non-vérifiés :
sudo -u postgres psql clubflow -c "
  SELECT email, \"createdAt\", \"emailVerifiedAt\" IS NOT NULL AS verified
  FROM \"User\"
  WHERE \"emailVerifiedAt\" IS NULL
  ORDER BY \"createdAt\" DESC
  LIMIT 20;
"

# Vérifier si SMTP configuré :
sudo grep -E 'BREVO_SMTP|MAIL_FROM|CLUBFLOW_SENDER' \
  /home/clubflow/clubflow/apps/api/.env
```

## Cas observés

- 2026-05-04 (Phase 1 multi-tenant signup live) : 1er user réel
  (techni3d@yahoo.fr) signup OK mais bloqué au login. SMTP pas encore
  configuré. Workaround SQL appliqué pour débloquer immédiatement.

## Pourquoi NE PAS faire

- ❌ Désactiver le check `emailVerifiedAt` côté login → faille sécu
  (anyone can signup with someone else's email)
- ❌ Auto-verify dans `createClubAndAdmin` → casse le contrat sécurité
  du flow signup
- ❌ Laisser un signup public en prod sans SMTP configuré → chaque user
  qui signup est bloqué sans moyen de récupérer

## Lié

- [apps/api/src/auth/auth.service.ts](../../../apps/api/src/auth/auth.service.ts) — createClubAndAdmin
- [apps/api/src/mail/](../../../apps/api/src/mail/) — MailService + ClubSendingDomain
- [.claude/skills/provision/SKILL.md](../../../.claude/skills/provision/SKILL.md) — workflow Brevo end-to-end validé pour clubflow.topdigital.re
- [docs/runbooks/phase1-bootstrap-multi-tenant.md](../../runbooks/phase1-bootstrap-multi-tenant.md)
