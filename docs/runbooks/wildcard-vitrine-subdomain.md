# Runbook — Activer le wildcard subdomain vitrine

> Référencé par `createClubAndAdmin` (Phase 2.1) et la résolution multi-tenant
> de la vitrine (`apps/vitrine/src/lib/club-resolution.ts`).

## Quand l'utiliser

Une fois — quand on veut activer le **fallback vitrine sur sous-domaine**
pour les clubs créés via signup self-service. Sans ce setup, le
`vitrineFallbackUrl` retourné par `createClubAndAdmin` (ex.
`https://test-club.clubflow.topdigital.re`) renverra une erreur DNS.

## Architecture

```
DNS Cloudflare : *.clubflow.topdigital.re A 89.167.79.253
                                          AAAA 2a01:4f9:c010:99d3::1
                       ↓
                  ┌────────────┐
                  │   Caddy    │  (port 443)
                  │            │
                  │  vhosts par subdomain ajoutés via Caddy admin API
                  │  par AuthService.createClubAndAdmin → caddy.addVitrineVhost
                  │  → cert TLS auto Let's Encrypt HTTP-01
                  └────────────┘
                       ↓
                  reverse_proxy localhost:5175  (Next.js vitrine)
                       ↓
                  Middleware Next.js injecte x-vitrine-host
                       ↓
                  resolveCurrentClub() détecte subdomain → publicClub(slug)
```

**Pas de cert wildcard** : chaque club obtient son propre cert HTTP-01
standard quand son vhost est ajouté à Caddy. Plus simple que DNS-01 +
plugin Cloudflare.

## Étape 1 — DNS Cloudflare (manuel, USER)

Ajouter dans la zone `topdigital.re` :

| Type | Name | Content | Proxy |
|---|---|---|---|
| A | `*.clubflow` | `89.167.79.253` | **DNS only** (gris) |
| AAAA | `*.clubflow` | `2a01:4f9:c010:99d3::1` | **DNS only** |

⚠️ **Proxy = OFF** sinon Caddy ne peut pas obtenir le cert HTTP-01
(cf. `pitfalls/cloudflare-proxy-breaks-letsencrypt.md`).

URL : https://dash.cloudflare.com/414b39a309ac266f34111f8b1973df80/topdigital.re/dns/records

Vérification après ~1 min :

```bash
nslookup -type=A test123.clubflow.topdigital.re 1.1.1.1
# → doit renvoyer 89.167.79.253
```

## Étape 2 — Caddy admin API active

Déjà fait Phase 3 (cf. `runbooks/caddy-api-vhosts.md`). Vérifier :

```bash
ssh-into-prod 'curl -s -o /dev/null -w "API admin → %{http_code}\n" http://localhost:2019/config/'
# → 200
```

## Étape 3 — Test manuel d'ajout vhost

```bash
ssh-into-prod 'curl -X POST http://localhost:2019/config/apps/http/servers/srv0/routes \
  -H "Content-Type: application/json" \
  -d "{\"match\":[{\"host\":[\"test-wildcard.clubflow.topdigital.re\"]}],\"handle\":[{\"handler\":\"reverse_proxy\",\"upstreams\":[{\"dial\":\"localhost:5175\"}]}],\"terminal\":true}"'

# Attendre ~10s pour que Caddy obtienne le cert HTTP-01
sleep 15

# Vérifier
curl -s -o /dev/null -w "%{http_code}\n" https://test-wildcard.clubflow.topdigital.re/
# → 200 (avec cert TLS Let's Encrypt valide)

# Cleanup
ssh-into-prod 'curl -X GET http://localhost:2019/config/apps/http/servers/srv0/routes | jq "to_entries | map(select(.value.match[0].host[0] == \"test-wildcard.clubflow.topdigital.re\")) | .[0].key"'
# Note l'index N puis :
ssh-into-prod 'curl -X DELETE http://localhost:2019/config/apps/http/servers/srv0/routes/N'
```

Si tout fonctionne, le wildcard est opérationnel.

## Étape 4 — Code (déjà déployé Phase 2.1+)

`AuthService.createClubAndAdmin` appelle automatiquement
`this.caddy.addVitrineVhost('<slug>.clubflow.topdigital.re')` après
chaque signup. Le cron `VitrineDomainCron` rattrape les éventuels échecs
au boot ou périodiquement.

## Pièges potentiels

1. **Rate limit Let's Encrypt** : 50 certs/semaine par domaine racine.
   Si on signup 50+ clubs en moins d'une semaine → blocage. Mitigation :
   on peut basculer vers cert wildcard via DNS-01 si on dépasse.
2. **Cert pending au moment de la redirect signup** : la mutation retourne
   `vitrineFallbackUrl` immédiatement, mais Caddy met ~10s à obtenir le
   cert. Si l'admin clique tout de suite → erreur TLS. **Mitigation UI** :
   afficher "Votre vitrine sera disponible dans quelques secondes,
   rechargez la page" sur l'écran de succès signup.
3. **Wildcard A record manquant** : sans le DNS, Caddy obtient 0 cert et
   tous les vhosts subdomain renvoient connexion refused. La doc Caddy
   loggera des erreurs LE → check `journalctl -u caddy | grep acme`.

## Vérification end-to-end

```bash
# 1. Signup test via API
curl -X POST https://api.clubflow.topdigital.re/graphql \
  -H 'Content-Type: application/json' \
  -d '{"query":"mutation { createClubAndAdmin(input: { clubName: \"Test Wildcard\", clubSlug: \"test-wildcard\", adminEmail: \"test@example.com\", adminPassword: \"Test1234!\", adminFirstName: \"T\", adminLastName: \"W\" }) { ok clubSlug vitrineFallbackUrl } }"}'

# 2. Attendre ~15s pour que cert TLS soit obtenu
sleep 15

# 3. Tester la vitrine fallback
curl -s -o /dev/null -w "%{http_code}\n" https://test-wildcard.clubflow.topdigital.re/

# 4. Cleanup (si test manuel)
# Via SQL : DELETE FROM "Club" WHERE slug = 'test-wildcard';
# Via Caddy API : DELETE le vhost (cf. runbooks/caddy-api-vhosts.md)
```

## Lié

- [ADR-0007 — Caddy admin API](../memory/decisions/0007-caddy-admin-api-vs-caddyfile.md)
- [runbooks/caddy-api-vhosts.md](caddy-api-vhosts.md)
- [pitfalls/cloudflare-proxy-breaks-letsencrypt.md](../memory/pitfalls/cloudflare-proxy-breaks-letsencrypt.md)
- `apps/vitrine/src/lib/club-resolution.ts` (logique résolution subdomain)
