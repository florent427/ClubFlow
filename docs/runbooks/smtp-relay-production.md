# Runbook — relais SMTP production (Postfix / Docker)

## Démarrage

- **Prod / relais :** `docker compose --profile relay up -d db postfix`
- **Développement (DB seule) :** `docker compose up -d db` — pas de Postfix tant que le profil `relay` n’est pas utilisé.

## Variables API (API sur l’hôte + Postfix en compose)

Pour une API qui tourne **sur la machine hôte** et soumet au conteneur Postfix publié en local :

| Variable | Valeur typique |
|----------|----------------|
| `SMTP_HOST` | `127.0.0.1` |
| `SMTP_PORT` | `2525` |
| `SMTP_SECURE` | `false` |

Le trafic reste **interne** (loopback → port mappé vers le port 25 du conteneur). Voir `apps/api/.env.example`.

## DNS et identité du serveur (PTR / EHLO)

- **PTR (rDNS)** et **nom annoncé en EHLO** (`myhostname` côté Postfix) doivent être **cohérents** avec l’IP publique de sortie.
- **SPF** : publier un enregistrement TXT `v=spf1` adapté (souvent `ip4:` de l’IP sortante).
- **DMARC** : commencer avec une politique permissive, ex. `p=none`, pour collecter les rapports sans rejeter tout de suite.
- **DKIM** : hors périmètre du premier déploiement ; à planifier ensuite (OpenDKIM ou équivalent).

## Enveloppe vs en-tête From (mail de test)

Lors d’un **envoi de test en production** :

1. Inspecter les en-têtes du message reçu.
2. Noter le **Return-Path** (adresse d’**enveloppe**) et le domaine du **From** visible.
3. Vérifier l’**alignement** attendu avec la spec ([section 4 — DNS et délivrabilité](../superpowers/specs/2026-03-31-envoi-mail-prod-postfix-design.md)) et consigner le constat (cohérence domaine club / relais).

## Anti-abus

- **Postfix :** configurer au minimum des limites côté serveur (ex. paramètres du type `smtpd_client_message_rate_limit`, `smtpd_client_connection_rate_limit` — voir [documentation Postfix](http://www.postfix.org/postconf.5.html)).
- **Application :** quotas par club / globaux restent une **dette** à traiter (cf. spec §2).

## Bouton « Vérifier » et contrôle SPF DNS

Sans résolution DNS réelle côté API, le bouton **Vérifier** ne peut pas valider le SPF tant que **`SMTP_DNS_SPF_CHECK`** n’est pas à `true`. Détail du comportement et du périmètre : [spec envoi mail prod Postfix](../superpowers/specs/2026-03-31-envoi-mail-prod-postfix-design.md) (§5–6).

## Dérogation DoD — phase 1

La spec vise idéalement **API + DB + Postfix** sur le **réseau Docker interne** sans passer par l’hôte. **Phase 1 (ce plan) :** l’API sur l’**hôte** se connecte à **`127.0.0.1:2525`** (bind local vers Postfix). Cela respecte l’objectif « pas d’exposition publique 25/587 pour la soumission applicative », mais **n’est pas** le déploiement strict « uniquement réseau compose ». Voir l’en-tête du plan d’implémentation : [2026-03-31-envoi-mail-prod-postfix-implementation.md](../superpowers/plans/2026-03-31-envoi-mail-prod-postfix-implementation.md).

## Image Postfix (suivi ops)

- Image utilisée dans le compose : **`boky/postfix:4.3.0`**
- Date de référence pour le suivi / rollback : **2026-03-31**

## Enregistrements suggérés (admin)

Si **`SMTP_PUBLIC_EGRESS_IP`** est défini, l’API propose un TXT SPF du type **`v=spf1 ip4:<IP> ~all`** (tilde = phase de test ; passer à **`-all`** quand l’IP sortante est figée). Optionnel : **`SMTP_DMARC_RUA_EMAIL`** ajoute une suggestion **`_dmarc`** en `p=none`.

## Limite MVP — contrôle SPF (Task 3)

La vérification SPF côté API (quand activée) ne couvre en **MVP** que la présence du littéral **`ip4:<IP>`** correspondant à **`SMTP_PUBLIC_EGRESS_IP`**. **Pas** de résolution récursive des mécanismes `include:`, ni support complet `a` / `mx` dans cette version — extension prévue avec la Task 3 du plan.

## Checklist DoD (rappel spec §6)

- **Preuve d’envoi :** au moins un mail réel avec **SPF pass** (ou équivalent documenté en phase pré-DNS) ; conserver extrait d’en-têtes / capture pour exploitation.
- **Sécurité :** secrets hors dépôt ; **logs** sans mot de passe SMTP ni corps de message.
- **Comportement « Vérifier » :** sans `SMTP_DNS_SPF_CHECK`, un domaine peut rester **VERIFIED** sans preuve DNS (dette documentée) ; avec contrôle DNS activé, aligner sur la spec et le plan Task 3.
