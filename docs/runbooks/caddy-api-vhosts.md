# Runbook — Caddy Admin API pour vhosts dynamiques

> Référencé par [ADR-0007](../memory/decisions/0007-caddy-admin-api-vs-caddyfile.md).
> Procédure pour activer l'API admin Caddy + debug en cas de problème.

## Quand l'utiliser

- Setup initial Phase 3 (activer l'API admin)
- Debug d'un vhost mal configuré via API
- Réconciliation manuelle après crash Caddy
- Backup / restore de la config dynamique

## Activer l'API admin (à faire 1 fois)

⚠️ Modif config prod — confirmer d'abord, lancer pendant un creux d'usage.

```bash
ssh-into-prod 'sudo sed -i "/^{$/a\    admin localhost:2019" /etc/caddy/Caddyfile'
ssh-into-prod 'sudo caddy validate --config /etc/caddy/Caddyfile'
ssh-into-prod 'sudo systemctl reload caddy && sleep 3 && curl -s http://localhost:2019/config/ | head -c 200'
```

Si la commande `curl` renvoie du JSON (pas un connection refused), l'API
est active.

⚠️ Le port 2019 doit rester **localhost-only**. Vérifier UFW :

```bash
ssh-into-prod 'sudo ufw status | grep -E "2019|Anywhere"'
```

→ Aucune règle ne doit autoriser 2019 depuis l'extérieur. Le bind sur
`localhost:2019` (pas `0.0.0.0:2019`) garantit ça.

## Lister les vhosts actuellement servis

```bash
ssh-into-prod 'curl -s http://localhost:2019/config/apps/http/servers/srv0/routes | jq'
```

## Ajouter un vhost à la main (debug)

⚠️ Préférer la mutation GraphQL `requestVitrineDomain` + `verifyVitrineDomain`
qui passe par `CaddyApiService`. Cette procédure est pour debug pur.

```bash
ssh-into-prod 'curl -X POST http://localhost:2019/config/apps/http/servers/srv0/routes \
  -H "Content-Type: application/json" \
  -d "{\"match\":[{\"host\":[\"test.example.fr\"]}],\"handle\":[{\"handler\":\"reverse_proxy\",\"upstreams\":[{\"dial\":\"localhost:5175\"}]}],\"terminal\":true}"'
```

## Supprimer un vhost à la main

```bash
# 1. Trouver l'index de la route
ssh-into-prod 'curl -s http://localhost:2019/config/apps/http/servers/srv0/routes | jq "to_entries | .[] | select(.value.match[0].host[0] == \"test.example.fr\") | .key"'

# 2. Supprimer (remplacer N par l'index trouvé)
ssh-into-prod 'curl -X DELETE http://localhost:2019/config/apps/http/servers/srv0/routes/N'
```

## Backup de la config dynamique

Caddy persiste auto dans `/var/lib/caddy/.config/caddy/autosave.json`.
À ajouter dans `clubflow-backup.sh` (TODO Phase 3+) :

```bash
ssh-into-prod 'sudo cp /var/lib/caddy/.config/caddy/autosave.json \
  /var/backups/clubflow/caddy-autosave-$(date +%Y%m%d).json'
```

## Réconciliation après crash

Si Caddy démarre sans `autosave.json` (perdu, fresh install), tous les
vhosts custom des clubs sont absents. Pour les ré-injecter :

```bash
# Coté API ClubFlow : appeler le job de réconciliation
# (à coder Phase 3+ si pas en place — le cron actuel runOnce() couvre déjà
# les PENDING_DNS, mais pas les ACTIVE qu'il faudrait re-add)
```

À implémenter : méthode `reconcile()` dans `VitrineDomainCron` qui :
1. Liste tous les `Club` avec `customDomainStatus = ACTIVE`
2. Pour chacun, vérifie via `caddy.listVhosts()` si le vhost est présent
3. Sinon, appelle `caddy.addVitrineVhost(domain)` pour le réinjecter

## Pièges connus

- **Port 2019 exposé publiquement** : NE JAMAIS bind sur `0.0.0.0`. Si on
  voit `tcp 0.0.0.0:2019` dans `ss -tlnp`, ouvrir un incident sécurité.
- **Reload après modif Caddyfile manuelle** : si on edit `/etc/caddy/Caddyfile`
  ET qu'il y a déjà des routes ajoutées via API, le reload **écrase** les
  routes API. Mitigation : ne pas mélanger les 2 mécanismes ; le Caddyfile
  ne contient que les vhosts "core" (admin, api, portail, vitrine SKSR),
  les vhosts clubs vont via API.
- **`caddy validate` rejette `log {}` inline** : cf. pitfall
  [caddyfile-log-block-inline-vs-multiline.md](../memory/pitfalls/caddyfile-log-block-inline-vs-multiline.md).

## Lié

- [ADR-0007](../memory/decisions/0007-caddy-admin-api-vs-caddyfile.md)
- [knowledge/infra-network.md](../knowledge/infra-network.md)
- Doc Caddy : https://caddyserver.com/docs/api
