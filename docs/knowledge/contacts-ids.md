# Contacts + IDs externes ClubFlow

## Owner

- Florent Morel — `florent.morel427@gmail.com`

## Hetzner

- **Project ID** : `14444062`
- **Server ID** : `128890739` (clubflow-prod, CX33, Helsinki)
- **Storage Box ID** : `570065` (clubflow-backups, BX11)
- Console : https://console.hetzner.com/projects/14444062

## Cloudflare

- **Account ID** : `414b39a309ac266f34111f8b1973df80`
- **Zone ID `topdigital.re`** : `159db89b3f066ba9ea329bc08f3d3f1c`
  (DNS only mode — proxy OFF, cf. [pitfall](../memory/pitfalls/cloudflare-zone-id-vs-account-id.md))
- Console : https://dash.cloudflare.com/414b39a309ac266f34111f8b1973df80/topdigital.re

⚠️ Pour les API calls `zones/*`, utiliser le **Zone ID** (pas l'Account ID).
L'URL dashboard contient l'Account ID — c'est trompeur.

## Brevo (sender domains)

- **Domain ID `clubflow.topdigital.re`** : `69f8410ed5eb982a25003083` (authenticated)
- Records DKIM/SPF/DMARC : déjà ajoutés via CF API + vérifiés
- Sender mutualisé pour signup : `noreply@mail.clubflow.topdigital.re`
  (à activer dans `apps/api/.env` comme `CLUBFLOW_SENDER_EMAIL`)

## OVH

- **Compte** : Florent Morel
- **Domaines actifs** :
  - `topdigital.re` (registrar uniquement, DNS chez Cloudflare)
  - `sksr.re` (registrar + DNS)
  - `un-temps-pour-soi.re`
  - `coeur2couple.fr` (suspendu)
- Console : https://manager.eu.ovhcloud.com

## Brevo (mail prod, à configurer)

- Account : Florent Morel (`florent.morel427@gmail.com`)
- Plan : gratuit (300 mails/jour)
- À setup : créer compte, vérifier domaine sksr.re (DKIM/SPF), copier clé SMTP
  dans `apps/api/.env`

## GitHub

- Repo : https://github.com/florent427/ClubFlow
- Owner : `florent427`
- Branche prod : `main`

## URLs publiques live

- **Admin** : https://clubflow.topdigital.re
- **API** : https://api.clubflow.topdigital.re
- **Portail** : https://portail.clubflow.topdigital.re
- **Vitrine SKSR** : https://sksr.re (+ www → 301)

## Emails techniques

- Let's Encrypt : `florent.morel427@gmail.com` (déclaré dans Caddyfile)
- DMARC RUA (optionnel) : `dmarc@<domaine>` quand mail prod actif
