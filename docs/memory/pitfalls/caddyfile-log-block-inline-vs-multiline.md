# Piège — `caddy validate` rejette `log { output file ... { ... } }` inline

## Symptôme

```
$ sudo caddy validate --config /etc/caddy/Caddyfile
Error: adapting config using caddyfile: Unexpected next token after '{' on same line, at /etc/caddy/Caddyfile:9
```

Avec une ligne du genre :
```caddy
log { output file /var/log/caddy/X.log { roll_size 10mb roll_keep 5 } }
```

## Contexte

Caddy 2.11. On veut ajouter un vhost avec une directive `log` qui a
elle-même un sous-bloc `{ roll_size ... roll_keep ... }`. L'instinct
"inline pour faire compact" donne :

```caddy
clubflow.topdigital.re {
    encode zstd gzip
    reverse_proxy localhost:5176
    log { output file /var/log/caddy/X.log { roll_size 10mb roll_keep 5 } }
}
```

→ `caddy validate` fail à la ligne du `log {`.

## Cause root

Le parser Caddyfile n'autorise pas les **sous-blocs imbriqués sur une
seule ligne** quand un bloc déclare lui-même des sous-directives.
Un bloc avec sous-bloc doit être étalé sur plusieurs lignes.

Note : `reverse_proxy localhost:5176` (sans sous-bloc) marche en inline.
Le problème est spécifique aux blocs qui ont des sous-blocs.

## Solution

**Multi-ligne strict** :

```caddy
clubflow.topdigital.re {
    encode zstd gzip
    reverse_proxy localhost:5176
    log {
        output file /var/log/caddy/X.log {
            roll_size 10mb
            roll_keep 5
        }
    }
}
```

## Détection

Si `caddy validate` retourne `Unexpected next token after '{' on same
line` → chercher des blocs imbriqués inline dans le Caddyfile.

## Pourquoi ne pas faire

- ❌ Inline pour gagner des lignes — la lisibilité est marginale et
  ça casse le parser
- ❌ Reload sans valider d'abord — Caddy plante au reload (mais l'ancien
  config reste actif, donc pas catastrophique). Toujours `caddy validate`
  AVANT `systemctl reload caddy`

## Lié

- [knowledge/infra-network.md](../../knowledge/infra-network.md) (pattern Caddyfile cible)
- [runbooks/deploy.md](../../runbooks/deploy.md) §Phase 6 reload Caddy
- Doc Caddyfile : https://caddyserver.com/docs/caddyfile/concepts#blocks
