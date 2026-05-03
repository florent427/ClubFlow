# Réseau, DNS, vhosts ClubFlow

## Architecture domaines

```
ClubFlow product (sur topdigital.re via DNS Cloudflare)
├─ clubflow.topdigital.re            → admin web (Vite static)
├─ api.clubflow.topdigital.re        → NestJS API + WS /chat
└─ portail.clubflow.topdigital.re    → portail membre (Vite static)

Club SKSR (sur sksr.re via DNS OVH)
├─ sksr.re                           → vitrine publique du club SKSR
└─ www.sksr.re                       → 301 redirect → sksr.re

→ Tous pointent vers 89.167.79.253 (IPv4) + 2a01:4f9:c010:99d3::1 (IPv6)
→ TLS auto Let's Encrypt via Caddy
```

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

**Cloudflare → topdigital.re** (6 records ClubFlow + records existants OVH mail) :

| Type | Name | Content | Proxy |
|---|---|---|---|
| A | clubflow | 89.167.79.253 | ⚠️ **DNS only** (gris) |
| AAAA | clubflow | 2a01:4f9:c010:99d3::1 | DNS only |
| A | api.clubflow | 89.167.79.253 | DNS only |
| AAAA | api.clubflow | 2a01:4f9:c010:99d3::1 | DNS only |
| A | portail.clubflow | 89.167.79.253 | DNS only |
| AAAA | portail.clubflow | 2a01:4f9:c010:99d3::1 | DNS only |

**OVH → sksr.re** (4 records ClubFlow + records mail OVH existants) :

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
for h in clubflow.topdigital.re api.clubflow.topdigital.re portail.clubflow.topdigital.re sksr.re www.sksr.re; do
  echo "--- $h ---"
  dig +short A $h @1.1.1.1
  dig +short AAAA $h @1.1.1.1
done
```

Toutes les lignes doivent renvoyer **uniquement** :
- `89.167.79.253` (A)
- `2a01:4f9:c010:99d3::1` (AAAA)

Si une autre IP apparaît → A parasite OVH à supprimer (voir pitfall).

## Caddyfile actuel

`/etc/caddy/Caddyfile` — voir `runbooks/deploy.md` pour la config courante.

```caddy
{ email florent.morel427@gmail.com }

clubflow.topdigital.re {
    encode zstd gzip
    root * /home/clubflow/clubflow/apps/admin/dist
    try_files {path} /index.html
    file_server
    log { output file /var/log/caddy/clubflow-admin.log { roll_size 10mb roll_keep 5 } }
}

portail.clubflow.topdigital.re {
    encode zstd gzip
    root * /home/clubflow/clubflow/apps/member-portal/dist
    try_files {path} /index.html
    file_server
    log { output file /var/log/caddy/clubflow-portail.log { roll_size 10mb roll_keep 5 } }
}

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

sksr.re {
    encode zstd gzip
    reverse_proxy localhost:5175
    log { output file /var/log/caddy/sksr.log { roll_size 10mb roll_keep 5 } }
}

www.sksr.re {
    redir https://sksr.re{uri} permanent
}
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

## Ajouter un nouveau club (futur)

Cf. `runbooks/add-new-club.md` (procédure complète DNS + Caddy + DB).
