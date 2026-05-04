# Piège — Caddy v2.10+ supprime `interval` et `burst` de `on_demand_tls`

## Symptôme

Caddy refuse le reload :
```
Error: adapting config using caddyfile: parsing caddyfile tokens for
'on_demand_tls': the on_demand_tls 'interval' option is no longer supported,
remove it from your config, at /etc/caddy/Caddyfile:5
```

Et systemd :
```
caddy.service: Reload operation timed out. Killing reload process.
```

## Contexte

Avant Caddy v2.10, le bloc `on_demand_tls` global supportait :
```caddy
on_demand_tls {
    ask http://localhost:3000/check-domain
    interval 2m
    burst 5
}
```

À partir de v2.10, **seule l'option `ask` reste supportée**. `interval`
et `burst` (rate limiting des émissions de cert) ont été retirés.

## Cause root

Le rate limiting est désormais géré nativement par les retries Let's
Encrypt + le cache cert de Caddy. Les options manuelles étaient
sources de bugs.

## Solution

### Garder uniquement `ask`

```caddy
{
    on_demand_tls {
        ask http://localhost:3000/v1/vitrine/check-domain
    }
}
```

Si déjà déployé avec `interval/burst` :

```bash
sudo sed -i '/^\s*interval [0-9]/d; /^\s*burst [0-9]/d' /etc/caddy/Caddyfile
sudo caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
sudo systemctl reload caddy
```

### Si `reload` est coincé → `restart`

Caddy peut rester en état `reloading` indéfiniment si le ExecReload a
planté. `systemctl status caddy` affiche `Active: reloading (reload-notify) since N hours ago`.

```bash
sudo systemctl restart caddy   # hard restart, sort de l'état coincé
```

## Détection rapide

```bash
sudo systemctl status caddy --no-pager | grep Active
# Si "reloading" depuis >1 min → état figé, restart
```

## Cas observés

- 2026-05-04 (bootstrap multi-tenant Phase 1) : `bin/bootstrap-multitenant.sh`
  v1 ajoutait le bloc avec interval/burst → reload Caddy en timeout.
  Fix v2 : retirer ces options.

## Pourquoi NE PAS faire

- ❌ Mettre à jour vers v2.10+ sans relire le CHANGELOG des breaking changes
- ❌ Laisser un `systemctl reload` figé → tous les certs en cours de
  renew bloquent

## Lié

- [bin/bootstrap-multitenant.sh](../../../bin/bootstrap-multitenant.sh)
- [docs/runbooks/phase1-bootstrap-multi-tenant.md](../../runbooks/phase1-bootstrap-multi-tenant.md)
- Caddy docs on_demand_tls : https://caddyserver.com/docs/caddyfile/options#on-demand-tls
