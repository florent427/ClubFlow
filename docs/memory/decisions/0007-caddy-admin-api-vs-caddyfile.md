# ADR-0007 — Caddy Admin API (port 2019) pour vhosts dynamiques

## Statut

✅ **Accepté** — 2026-05-04 (Phase 3 du plan multi-tenant)
🔒 **Verrouillé** une fois implémenté (rollback = passer en CaddyFile)

## Contexte

Phase 3 du plan multi-tenant : permettre à chaque club de **configurer son
domaine vitrine custom en self-service depuis l'admin web**, sans intervention
manuelle (SSH + édition Caddyfile + reload + DNS check).

Aujourd'hui c'est un workflow manuel (cf. `runbooks/add-new-club.md` §4) :
édition `/etc/caddy/Caddyfile` via SSH par Florent + `systemctl reload caddy`.
Bloquant à l'échelle.

Deux options techniques pour automatiser :

### Option A : Génération + reload Caddyfile
- API ClubFlow génère un fichier `<slug>.conf` dans `/etc/caddy/sites/`
  (importé via `import sites/*.conf` dans le Caddyfile principal)
- API SSH le serveur (ou écrit via volume monté) puis appelle
  `systemctl reload caddy`
- Validation préalable via `caddy validate`

### Option B : Caddy Admin API (port 2019)
- Caddy expose une API REST locale (`http://localhost:2019/config/...`)
- API ClubFlow appelle cette API pour add/remove/update vhosts à chaud
- Caddy persiste auto sur disque (`autosave` activé par défaut)

## Décision

**Option B — Caddy Admin API** sur `localhost:2019`, accessible uniquement
en loopback.

### Configuration Caddy globale

```caddy
{
    admin localhost:2019
    email florent.morel427@gmail.com
}
```

### Sécurité

- Port 2019 jamais exposé publiquement (firewall ufw bloque tout sauf 22, 80, 443)
- Seul l'API NestJS (qui tourne sur le **même serveur**) peut y accéder via loopback
- Pas d'auth API (l'isolation réseau suffit) — c'est le modèle officiel Caddy
- Si l'API ClubFlow est compromise → l'attaquant peut quand même déjà tout faire,
  donc pas de privilège escalation supplémentaire

### Service NestJS `CaddyApiService`

Wrapper TypeScript dans `apps/api/src/infra/caddy.service.ts` :

```ts
addVhost(domain: string, target: string): Promise<void>
removeVhost(domain: string): Promise<void>
listVhosts(): Promise<Vhost[]>
validateConfig(): Promise<{ valid: boolean; errors?: string[] }>
```

Endpoints Caddy utilisés :
- `POST /config/apps/http/servers/srv0/routes` (ajout)
- `DELETE /config/apps/http/servers/srv0/routes/<id>`
- `GET /config/` (lecture)

## Conséquences

### Positives
- Self-service total : un club configure son domaine → vhost ajouté en
  ~2 secondes, cert TLS auto en ~10s
- Pas de SSH depuis l'API → moins de surface d'attaque
- Pas de race condition sur le Caddyfile (l'API gère ça nativement)
- Caddy persiste l'état → survit aux restart Caddy
- Rollback facile (DELETE l'add)

### Négatives
- **`/etc/caddy/Caddyfile` ne reflète plus l'état réel** une fois l'API utilisée
  → le state of truth devient `/var/lib/caddy/.config/caddy/autosave.json`
- Debug en cas de problème : moins lisible qu'un fichier Caddyfile texte
- Si l'API ClubFlow plante en pleine modif → vhost peut rester en état
  inconsistant. **Mitigation** : `validateConfig()` avant chaque modif +
  rollback explicite si erreur
- Si on perd `autosave.json` → faut re-créer tous les vhosts depuis la DB
  (job de réconciliation)

### Mitigations
- **Job de réconciliation** au boot : l'API NestJS lit `Club.customDomain`
  pour tous les clubs `customDomainStatus=ACTIVE` et ajoute les vhosts via
  Caddy API si absents
- **Backup** : copier `/var/lib/caddy/.config/caddy/autosave.json` dans
  `clubflow-backup.sh` (cf. `knowledge/backup-strategy.md`)
- **Validation** systématique avant `addVhost`
- **Vhost de base** (admin, api, vitrine) reste dans `/etc/caddy/Caddyfile`
  et n'est **pas géré via l'API** — au moins le squelette est lisible si
  Caddy crash

## Alternatives rejetées

### Pourquoi pas Option A (Caddyfile + reload)

- Reload SSH demande une clé SSH dans l'API → fuite potentielle
- File mounting demande des permissions risquées (API user doit pouvoir
  écrire dans `/etc/caddy/`)
- `systemctl reload` peut échouer silencieusement (faut parser stderr)
- Pas idempotent (si on append 2× le même vhost → erreur Caddy)
- Reload est plus lent que API (~2-5s vs ~100ms)

### Pourquoi pas Traefik / Nginx
- Caddy est déjà en place et marche bien
- Switch demande de re-configurer 4 vhosts existants + revoir TLS
- Caddy a la meilleure UX TLS auto (Let's Encrypt sans plugin)
- Pas de bénéfice net

## Plan d'implémentation

1. **Activer admin API** : ajouter `{ admin localhost:2019 }` dans le Caddyfile
   global, restart Caddy, vérifier `curl http://localhost:2019/config/`
2. **Module NestJS** : `apps/api/src/infra/caddy.module.ts` + `caddy.service.ts`
3. **Tests** : unit tests pour `CaddyApiService` (mock fetch), integration test
   sur env staging (ajouter / supprimer un vhost test)
4. **Job de réconciliation** : `apps/api/src/scheduling/caddy-reconcile.cron.ts`
   tourne au boot + 1×/jour
5. **Backup `autosave.json`** : ajouter au script `clubflow-backup.sh`
6. **Documenter** : `docs/runbooks/caddy-api-vhosts.md` (debug, rollback)

## Quand reconsidérer

- Si Caddy abandonne l'API admin (improbable)
- Si on passe à un load balancer multi-noeuds (HAProxy, Cloudflare LB) → la
  config par API serait à revoir
- Si on veut auditer l'historique des modifs vhost → la Caddy API ne log pas
  bien, faut l'audit côté NestJS

## Lié

- [ADR-0006 — Path-based multi-tenant](0006-path-based-multi-tenant.md)
- [knowledge/infra-network.md](../../knowledge/infra-network.md)
- [knowledge/backup-strategy.md](../../knowledge/backup-strategy.md)
- [runbooks/add-new-club.md](../../runbooks/add-new-club.md) (procédure manuelle conservée pour debug)
- Doc Caddy : https://caddyserver.com/docs/api
