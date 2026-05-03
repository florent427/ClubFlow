# Piège — Cloudflare proxy ON casse le challenge Let's Encrypt

## Symptôme

Quand Caddy essaie d'obtenir le cert pour `clubflow.topdigital.re` :

```
$ sudo journalctl -u caddy -n 50 | grep -i acme
{"level":"error","msg":"challenge failed","challenge":{"type":"http-01"},"error":"acme: error: ... urn:ietf:params:acme:error:unauthorized: <some_ip>: Invalid response ... \"<HTML Cloudflare error page>\""}
```

→ Cloudflare a intercepté le challenge HTTP-01 de Let's Encrypt et a
renvoyé une page Cloudflare au lieu de laisser passer.

## Contexte

Sur Cloudflare, chaque record DNS a une option **"Proxy status"** :
- 🟠 **Proxied** (orange) : Cloudflare intercepte tout le trafic HTTP/HTTPS
  avant le serveur. Met en cache, gère DDoS, etc.
- ⚪ **DNS only** (gris) : Cloudflare répond juste au DNS, le trafic va
  directement au serveur.

Par défaut, créer un A record **active le proxy automatiquement** (orange).

## Cause root

Quand le proxy est ON :
1. Let's Encrypt résout `clubflow.topdigital.re` → IP Cloudflare (pas la
   nôtre)
2. Let's Encrypt fait un GET HTTP `/.well-known/acme-challenge/<token>`
   sur l'IP Cloudflare
3. Cloudflare ne sait pas répondre (le challenge file est sur NOTRE
   serveur, derrière son proxy)
4. Cloudflare répond une page HTML d'erreur ou du JS inattendu
5. Let's Encrypt voit une mauvaise réponse → challenge fail → pas de cert

## Solution

**Mettre tous les records ClubFlow en "DNS only"** :

1. Cloudflare console → topdigital.re → DNS → Records
2. Pour chaque record `clubflow`, `api.clubflow`, `portail.clubflow` :
   - Cliquer sur le nuage orange → devient gris ("DNS only")
3. Save

Puis re-déclencher Caddy :

```bash
ssh-into-prod "sudo systemctl restart caddy"
sleep 30
ssh-into-prod "sudo journalctl -u caddy -n 30 | grep -i 'certificate obtained\|acme'"
```

## Vérifier qu'un record est en DNS only

Visualement : nuage GRIS ⚪ (pas orange 🟠).

Via API :

```bash
curl -s -H "Authorization: Bearer $CF_API_TOKEN" \
  "https://api.cloudflare.com/client/v4/zones/$ZONE_ID/dns_records?type=A&name=clubflow.topdigital.re" \
  | jq '.result[] | {name, content, proxied}'
```

`proxied: false` = DNS only. `proxied: true` = problème.

## Pourquoi pas garder le proxy

Bénéfices du proxy Cloudflare (DDoS, cache, WAF) sont sympas, mais :
- Cassent Let's Encrypt en HTTP-01 (workaround : passer en DNS-01,
  complexe)
- Cassent les WebSockets si pas configuré (notre `/chat`)
- Cachent l'IP réelle aux logs Caddy
- Ajoutent une couche de débug (Cloudflare Page Rules vs Caddyfile)

→ Pour un MVP, **DNS only c'est mieux**. À reconsidérer si on subit
des attaques DDoS.

## Si on veut quand même le proxy un jour

Migrer vers DNS-01 challenge (Caddy le supporte avec un plugin
Cloudflare API) :

```caddy
{
    acme_dns cloudflare CF_API_TOKEN
}
```

→ Caddy crée un TXT `_acme-challenge` via API au lieu d'un fichier HTTP.
Marche derrière proxy, mais nécessite un token API Cloudflare en
`/etc/caddy/.env` + module Caddy custom.

## Lié

- [knowledge/infra-network.md](../../knowledge/infra-network.md)
- [runbooks/add-new-club.md](../../runbooks/add-new-club.md)
- ADR-0002 — Cloudflare DNS only mode
