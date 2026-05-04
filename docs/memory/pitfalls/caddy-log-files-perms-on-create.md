# Piège — Caddy refuse le reload si log file pas writable par user `caddy`

## Symptôme

```
caddy.service: ExecReload exited code=1
Status: "loading new config: setting up custom log 'log5':
opening log writer using &logging.FileWriter{Filename:
\"/var/log/caddy/wildcard-clubflow.log\", ...}: open
/var/log/caddy/wildcard-clubflow.log: permission denied"
```

Et le reload reste en état coincé :
```
Active: reloading (reload-notify) since N hours ago
ExecReload=... (code=exited, status=1/FAILURE)
```

## Contexte

Quand on ajoute un nouveau vhost dans le Caddyfile avec un `log { output
file ... }`, Caddy doit pouvoir **créer** ou **ouvrir** le fichier.

Le user `caddy` (du systemd unit) a les droits sur `/var/log/caddy/` mais
**pas sur les fichiers spécifiques pré-existants** s'ils ont été créés
par root.

Distinct de [caddyfile-log-block-inline-vs-multiline.md](caddyfile-log-block-inline-vs-multiline.md)
qui parle de la SYNTAXE du bloc log. Ici c'est purement filesystem perms.

## Cause root

Quand un script bootstrap qui tourne en root crée le fichier en avance
(`touch /var/log/caddy/wildcard-clubflow.log`), il appartient à
`root:root`. Caddy (user `caddy`) ne peut pas l'ouvrir en write.

## Solution

### Avant d'ajouter un vhost avec log custom, créer le fichier avec les bonnes perms

```bash
sudo touch /var/log/caddy/<vhost>.log
sudo chown caddy:caddy /var/log/caddy/<vhost>.log
sudo chmod 644 /var/log/caddy/<vhost>.log
sudo systemctl reload caddy
```

### S'assurer que `/var/log/caddy/` est writable par caddy

```bash
sudo chown caddy:caddy /var/log/caddy/
sudo chmod 755 /var/log/caddy/
```

### Si Caddy est coincé en `reloading` → `restart`

```bash
sudo systemctl restart caddy  # hard restart pour sortir
```

## Détection rapide

```bash
sudo journalctl -u caddy --since '5 min ago' | grep -i 'permission denied'
ls -la /var/log/caddy/  # tous les .log doivent être caddy:caddy
```

## Cas observés

- 2026-05-04 (bootstrap multi-tenant Phase 1) : ajout du vhost wildcard
  `*.clubflow.topdigital.re` avec `log { output file
  /var/log/caddy/wildcard-clubflow.log }`. Caddy n'a pas pu créer le
  fichier. Reload coincé 24h+ avant détection.

## Pourquoi NE PAS faire

- ❌ Ignorer un `systemctl reload caddy` qui ne rend pas la main → rester
  des heures avec une config pourrie
- ❌ Lancer le `touch` du log file en root sans chown derrière

## Lié

- [bin/bootstrap-multitenant.sh](../../../bin/bootstrap-multitenant.sh)
- [pitfalls/caddy-on-demand-tls-v2-options-removed.md](caddy-on-demand-tls-v2-options-removed.md)
- [pitfalls/caddyfile-log-block-inline-vs-multiline.md](caddyfile-log-block-inline-vs-multiline.md) (syntaxe différente du même domaine)
