# ADR-0002 — Cloudflare DNS only mode (proxy OFF)

## Statut

✅ **Accepté** — 2026-04-25
🔄 Réversible si on subit des attaques DDoS

## Contexte

Le domaine `topdigital.re` (ClubFlow product) est hébergé en DNS chez
Cloudflare (registrar : OVH, NS délégués vers `kevin.ns.cloudflare.com`).

Cloudflare propose 2 modes par record :
- 🟠 **Proxied** (orange) : trafic passe par Cloudflare (DDoS, cache, WAF)
- ⚪ **DNS only** (gris) : Cloudflare répond juste au DNS

Pour les records `clubflow.topdigital.re`, `api.clubflow.topdigital.re`,
`portail.clubflow.topdigital.re` : choisir un mode.

## Décision

**Tous les records ClubFlow en DNS only (gris).**

## Conséquences

### Positives
- Let's Encrypt HTTP-01 challenge **fonctionne** (sinon → fail, cf.
  `pitfalls/cloudflare-proxy-breaks-letsencrypt.md`)
- WebSockets `/chat` (Socket.IO) **fonctionnent** sans config spéciale
  (Cloudflare proxy WS demande Pro plan + config sticky session)
- Logs Caddy ont la **vraie IP** du visiteur (pas une IP Cloudflare)
- Stack simple : un seul endroit où débugger (Caddyfile), pas de couche
  Cloudflare Page Rules
- Coût : 0 € (Cloudflare gratuit pour DNS, payant pour proxy advanced)

### Négatives
- **Pas de protection DDoS** Cloudflare (mais Hetzner offre une protection
  L3/L4 basique gratuite, suffisant pour notre traffic <1k req/s)
- **Pas de cache CDN** Cloudflare (pas critique : assets Vite déjà cachés
  par Caddy + browser, vitrine SSR pas si lourde)
- **Pas de WAF** managed (mais on contrôle nos endpoints, pas vital MVP)
- IP serveur **exposée** publiquement (pas un vrai souci, c'est une IP
  Hetzner standard)

## Pourquoi pas Proxied

- Casse Let's Encrypt HTTP-01 → faut migrer vers DNS-01 (token Cloudflare
  API + plugin Caddy custom) → complexité++
- Casse WebSockets `/chat` sur plan free → faut Pro plan ($20/mois)
  ou WS proxy via path différent
- Latence supplémentaire (~10-30 ms) pour pas grand-chose
- Risque "Cloudflare décide de te bloquer" sans préavis (cf. cas Crunchyroll,
  4chan, etc.)

## Quand reconsidérer

- Si attaque DDoS ciblée → activer proxy + migrer vers DNS-01 challenge
- Si trafic > 100k req/min → CDN bénéficierait au temps de réponse
- Si on veut WAF managed pour OWASP top 10 → Cloudflare ou alternative
  (BunkerWeb open-source)

## Migration vers Proxied (si décidé un jour)

1. Ajouter token API Cloudflare dans `apps/api/.env` ou `/etc/caddy/.env`
2. Installer plugin Caddy `caddy-dns/cloudflare`
3. Modifier Caddyfile : `acme_dns cloudflare {env.CF_API_TOKEN}`
4. Re-générer les certs : `sudo systemctl restart caddy`
5. Activer proxy sur les records Cloudflare (un par un, vérifier après
   chaque)
6. Vérifier WS `/chat` fonctionne (sinon Pro plan + config)

## Lié

- [knowledge/infra-network.md](../../knowledge/infra-network.md)
- [pitfalls/cloudflare-proxy-breaks-letsencrypt.md](../pitfalls/cloudflare-proxy-breaks-letsencrypt.md)
