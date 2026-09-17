# Réseau, DNS, vhosts ClubFlow

## Architecture domaines (Phase 1 en prod)

```
ClubFlow product (sur topdigital.re via DNS Cloudflare)
├─ clubflow.topdigital.re            → landing marketing publique (Next.js)
├─ app.clubflow.topdigital.re        → admin multi-tenant (Vite static)
│                                       URL pattern : /<club-slug>/...  (cf. ADR-0006)
├─ api.clubflow.topdigital.re        → NestJS API + WS /chat
├─ portail.clubflow.topdigital.re    → portail membre (Vite static)
└─ *.clubflow.topdigital.re          → vitrine fallback (TLS on_demand par sous-domaine)
                                       <club-slug>.clubflow.topdigital.re

Clubs (chacun a son domaine vitrine custom optionnel)
├─ sksr.re                           → vitrine club SKSR (custom domain)
├─ www.sksr.re                       → 301 redirect → sksr.re
└─ <futur-club>.fr                   → vitrine futur club (config self-service Phase 3)

→ Tous pointent vers 89.167.79.253 (IPv4) + 2a01:4f9:c010:99d3::1 (IPv6)
→ TLS auto Let's Encrypt via Caddy (HTTP-01 challenge, y compris pour les
  sous-domaines du wildcard : TLS on_demand, autorisé par
  `/v1/vitrine/check-domain` — pas de certificat wildcard DNS-01)
```

## État actuel vs cible

| Domaine | Statut | Phase |
|---|---|---|
| `clubflow.topdigital.re` (landing) | ✅ live (landing) | Phase 1 |
| `app.clubflow.topdigital.re` | ✅ live | Phase 1 |
| `*.clubflow.topdigital.re` (wildcard) | ✅ live (TLS on_demand) | Phase 2 |
| Domaines custom self-service | ✅ code en place via Caddy API (`requestVitrineDomain` / `verifyVitrineDomain`, cf. ADR-0007) | Phase 3 |

⚠️ Deux mécanismes coexistent pour les sous-domaines vitrine : le vhost
wildcard `*.clubflow.topdigital.re` en TLS on_demand
(`bin/caddy-multitenant.snippet`, `bin/Caddyfile.staging`) et l'ajout d'un
vhost par club via l'API admin Caddy à la création du club
(`auth.service.ts`, cf. `runbooks/wildcard-vitrine-subdomain.md`). Vérifier
sur le serveur lequel sert réellement avant de modifier l'un ou l'autre.

## Où sont gérés les DNS ?

| Domaine | Registrar | DNS hébergé chez | Console |
|---|---|---|---|
| **`topdigital.re`** | OVH | **Cloudflare** (`kevin.ns.cloudflare.com`) | https://dash.cloudflare.com/414b39a309ac266f34111f8b1973df80/topdigital.re/dns/records |
| **`sksr.re`** | OVH | **OVH** (`dns10.ovh.net`) | https://manager.eu.ovhcloud.com/#/web/domain/sksr.re/zone |
| `un-temps-pour-soi.re` | OVH | OVH | (pas utilisé pour ClubFlow) |
| `coeur2couple.fr` | OVH | OVH (suspendu/expiré) | — |

⚠️ **NE PAS toucher les NS du domaine `topdigital.re`** : ils sont chez Cloudflare,
pas OVH. Toute modif DNS pour `*.topdigital.re` doit se faire **côté Cloudflare**.

## Records actifs

**Cloudflare → topdigital.re** (records ClubFlow actuels + à ajouter) :

| Type | Name | Content | Proxy | Statut |
|---|---|---|---|---|
| A | clubflow | 89.167.79.253 | DNS only | ✅ existant (landing) |
| AAAA | clubflow | 2a01:4f9:c010:99d3::1 | DNS only | ✅ existant |
| A | api.clubflow | 89.167.79.253 | DNS only | ✅ existant |
| AAAA | api.clubflow | 2a01:4f9:c010:99d3::1 | DNS only | ✅ existant |
| A | portail.clubflow | 89.167.79.253 | DNS only | ✅ existant |
| AAAA | portail.clubflow | 2a01:4f9:c010:99d3::1 | DNS only | ✅ existant |
| A | app.clubflow | 89.167.79.253 | DNS only | ✅ existant (Phase 1) |
| AAAA | app.clubflow | 2a01:4f9:c010:99d3::1 | DNS only | ✅ existant (Phase 1) |
| A | \*.clubflow | 89.167.79.253 | DNS only | ✅ existant (wildcard) |
| AAAA | \*.clubflow | 2a01:4f9:c010:99d3::1 | DNS only | ✅ existant (wildcard) |

**OVH → sksr.re** (inchangé) :

| Type | Name | Content |
|---|---|---|
| A | @ | 89.167.79.253 |
| AAAA | @ | 2a01:4f9:c010:99d3::1 |
| A | www | 89.167.79.253 |
| AAAA | www | 2a01:4f9:c010:99d3::1 |

## Pièges DNS

Cf. les pitfalls indexés :
- `memory/pitfalls/cloudflare-proxy-breaks-letsencrypt.md` — Proxy doit être OFF
- `memory/pitfalls/ovh-a-parasite-185-158.md` — record A welcome page OVH à supprimer
- ADR-0002 : pourquoi Cloudflare DNS only mode

## Vérifier la résolution DNS

```bash
for h in clubflow.topdigital.re app.clubflow.topdigital.re api.clubflow.topdigital.re portail.clubflow.topdigital.re sksr.re www.sksr.re; do
  echo "--- $h ---"
  dig +short A $h @1.1.1.1
  dig +short AAAA $h @1.1.1.1
done
```

Toutes les lignes doivent renvoyer **uniquement** :
- `89.167.79.253` (A)
- `2a01:4f9:c010:99d3::1` (AAAA)

Si une autre IP apparaît → A parasite OVH à supprimer (voir pitfall).

## Caddyfile cible (Phase 1)

`/etc/caddy/Caddyfile` — voir `runbooks/deploy.md` pour la procédure de modif.

⚠️ Bloc ci-dessous historique (conception Phase 1). Référence à jour :
`bin/caddy-multitenant.snippet` (prod) et `bin/Caddyfile.staging`, qui
activent `admin localhost:2019` et servent le wildcard en TLS `on_demand`
(HTTP-01) au lieu du bloc DNS-01 commenté plus bas.

```caddy
{
    email florent.morel427@gmail.com
    # Phase 3 : activer admin API pour vhosts dynamiques (cf. ADR-0007)
    # admin localhost:2019
}

# Landing marketing — était l'admin, devient marketing en Phase 1
clubflow.topdigital.re {
    encode zstd gzip
    reverse_proxy localhost:5176
    log { output file /var/log/caddy/clubflow-landing.log { roll_size 10mb roll_keep 5 } }
}

# Admin multi-tenant — nouveau en Phase 1
app.clubflow.topdigital.re {
    encode zstd gzip
    root * /home/clubflow/clubflow/apps/admin/dist
    try_files {path} /index.html
    file_server
    log { output file /var/log/caddy/clubflow-admin.log { roll_size 10mb roll_keep 5 } }
}

# Portail membre — inchangé
portail.clubflow.topdigital.re {
    encode zstd gzip
    root * /home/clubflow/clubflow/apps/member-portal/dist
    try_files {path} /index.html
    file_server
    log { output file /var/log/caddy/clubflow-portail.log { roll_size 10mb roll_keep 5 } }
}

# API NestJS — inchangé
api.clubflow.topdigital.re {
    encode zstd gzip
    @websocket {
        header Connection *Upgrade*
        header Upgrade websocket
    }
    reverse_proxy @websocket localhost:3000
    reverse_proxy localhost:3000
    log { output file /var/log/caddy/clubflow-api.log { roll_size 10mb roll_keep 5 } }
}

# Vitrine SKSR (domaine custom) — inchangé
sksr.re {
    encode zstd gzip
    reverse_proxy localhost:5175
    log { output file /var/log/caddy/sksr.log { roll_size 10mb roll_keep 5 } }
}

www.sksr.re {
    redir https://sksr.re{uri} permanent
}

# Phase 2 : wildcard subdomain vitrine fallback (demande cert wildcard via DNS-01)
# *.clubflow.topdigital.re {
#     tls {
#         dns cloudflare {env.CF_API_TOKEN}
#     }
#     reverse_proxy localhost:5175
#     log { output file /var/log/caddy/clubflow-vitrine-wildcard.log { roll_size 10mb roll_keep 5 } }
# }
```

⚠️ Si tu modifies le Caddyfile :
1. Valider : `sudo caddy validate --config /etc/caddy/Caddyfile`
2. Reload : `sudo systemctl reload caddy`
3. Si reload reste coincé → `sudo systemctl restart caddy` (hard restart)
4. Vérif logs : `sudo journalctl -u caddy -n 30 --no-pager`

⚠️ Pour ajouter une directive `log { output file ... }` vers un nouveau fichier,
créer d'abord le fichier avec les bonnes perms :
```bash
sudo touch /var/log/caddy/<nom>.log
sudo chown caddy:caddy /var/log/caddy/<nom>.log
```
Sinon le reload échoue avec "permission denied" et reste bloqué.

## Ajouter un nouveau club

- **Self-service** (voie normale) : le club configure son domaine depuis
  l'admin → API NestJS appelle Caddy admin API → vhost ajouté à chaud
  (cf. ADR-0007 et `runbooks/add-new-club.md`)
- **Manuel** (secours) : édition du Caddyfile, cf. `runbooks/add-new-club.md` §4

## Staging

VPS dédié `46.62.197.93` (Hetzner cx23 Helsinki), branche `staging`, DNS
chez Cloudflare (même zone `topdigital.re`) :

| Domaine | Rôle |
|---|---|
| `staging.clubflow.topdigital.re` | landing |
| `staging.app.clubflow.topdigital.re` | admin |
| `staging.api.clubflow.topdigital.re` | API |
| `staging.portail.clubflow.topdigital.re` | portail membre |
| `*.staging.clubflow.topdigital.re` | vitrine fallback |

Caddyfile de référence : `bin/Caddyfile.staging`. Bootstrap :
`runbooks/staging-vps-bootstrap.md`.
