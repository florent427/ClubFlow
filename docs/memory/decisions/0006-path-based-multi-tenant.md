# ADR-0006 — Multi-tenant admin via path (`app.clubflow.topdigital.re/<slug>/...`)

## Statut

✅ **Accepté** — 2026-05-04
🔄 **Réversible** vers subdomain si besoin (impact: setup wildcard cert + DNS)

## Contexte

Phase 1 de la restructuration "ClubFlow SaaS / espaces club" : on sépare
`clubflow.topdigital.re` (landing marketing) de `app.clubflow.topdigital.re`
(admin multi-tenant). Reste le choix de la **stratégie d'URL** pour
identifier le club courant côté admin :

- **Path** : `app.clubflow.topdigital.re/sksr/dashboard`
- **Subdomain** : `sksr.app.clubflow.topdigital.re/dashboard`

## Options évaluées

### Option A : Subdomain (`<slug>.app.clubflow.topdigital.re`)
- ✅ Isolation cookies/storage par club (sécurité MFA + XSS)
- ✅ URL "branding" forte
- ✅ Pas de risque de collision avec routes (`/dashboard` vs club nommé "dashboard")
- ❌ Wildcard DNS (`*.app.clubflow.topdigital.re` chez Cloudflare)
- ❌ Wildcard cert TLS → impossible avec HTTP-01 challenge → Let's Encrypt
  exige DNS-01 → faut configurer plugin Caddy `caddy-dns/cloudflare`
  + token API Cloudflare en `/etc/caddy/.env`
- ❌ Setup ~1h vs 5 min pour path

### Option B : Path (`app.clubflow.topdigital.re/<slug>/...`)
- ✅ 1 seul A record DNS standard
- ✅ 1 seul cert TLS standard via HTTP-01 (compatible setup actuel)
- ✅ Caddy config triviale (un vhost, pas de wildcard)
- ✅ Setup 5 min
- ❌ Cookies partagés entre clubs (risque XSS cross-club)
- ❌ Risque collision routes (mitigé par préfixe `/c/<slug>` ou refus
  des slugs réservés : `dashboard`, `settings`, `api`, etc.)

## Décision

**Option B — Path-based.**

URL pattern : `https://app.clubflow.topdigital.re/<slug>/...`

Au login, l'API renvoie la liste des clubs accessibles à l'utilisateur.
Si l'utilisateur n'a qu'un club → redirect direct vers `/<slug>/dashboard`.
Si plusieurs → page de sélection puis redirect.

Le `clubId` (UUID) reste utilisé en interne (header `X-Club-Id` dans Apollo)
mais n'apparaît plus dans l'URL.

**Slugs réservés** (ne peuvent pas être utilisés comme slug de club) :
`api`, `app`, `admin`, `dashboard`, `settings`, `signup`, `login`, `logout`,
`signin`, `register`, `account`, `billing`, `health`, `status`, `static`,
`assets`, `_next`, `favicon.ico`, `robots.txt`, `sitemap.xml`.

## Conséquences

### Positives
- Setup infra trivial (réutilise le pattern Caddy existant)
- Compatible HTTP-01 challenge déjà en place (cf. ADR-0002 Cloudflare DNS only)
- Pas de dépendance sur token API Cloudflare pour les certs
- 1 seul cert à monitorer / renouveler

### Négatives
- Cookies session partagés entre clubs sur le même origine. **Mitigation** :
  - Cookie `__Host-` prefix + `SameSite=Strict` + `Secure`
  - Scope par chemin (`Path=/<slug>`) si vraiment critique
  - Token JWT contient `clubId` autorisés → vérif côté API à chaque requête
- L'utilisateur peut tenter de modifier `<slug>` dans l'URL pour accéder à
  un autre club. **Mitigation** : `ClubMembershipGuard` côté API rejette si
  l'user n'a pas membership sur le club ciblé (la vérif est déjà en place
  via `ClubContextGuard` + `X-Club-Id` header).

### Mitigations supplémentaires
- Liste de slugs réservés vérifiée à la création de club (`createClubAndAdmin`)
- Redirect 404 propre si `<slug>` n'existe pas en DB
- Audit log des accès cross-club refusés

## Pourquoi pas Subdomain

Sub-domain est **plus propre architecturalement** mais demande :
1. Plugin Caddy `caddy-dns/cloudflare` à installer (rebuild Caddy custom OU
   binaire xcaddy)
2. Token API Cloudflare avec permission "Edit zone DNS" stocké en
   `/etc/caddy/.env`
3. Wildcard A + AAAA record `*.app.clubflow.topdigital.re` chez Cloudflare
4. Cert wildcard `*.app.clubflow.topdigital.re` à provisionner (DNS-01,
   ~30s vs ~10s pour HTTP-01)

→ Sur-engineering pour un MVP solo dev. Path = good enough.

## Quand reconsidérer

- Si on a un client enterprise qui exige isolation cookies stricte (SOC2,
  ISO 27001)
- Si on subit un incident XSS cross-club (peu probable avec auth correctement
  faite)
- Si on dépasse 50+ clubs et qu'on veut vraiment du branding URL par club
- Si on veut **personnaliser le sous-domaine admin** par club (ex: `sksr.clubflow.app`)

## Lié

- [knowledge/infra-network.md](../../knowledge/infra-network.md)
- [ADR-0002 — Cloudflare DNS only](0002-cloudflare-dns-only.md)
- [ADR-0007 — Caddy admin API vs Caddyfile](0007-caddy-admin-api-vs-caddyfile.md)
- [pitfalls/cloudflare-proxy-breaks-letsencrypt.md](../pitfalls/cloudflare-proxy-breaks-letsencrypt.md)
