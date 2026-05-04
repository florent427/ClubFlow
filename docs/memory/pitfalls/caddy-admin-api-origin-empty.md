# Piège — Caddy admin API rejette Node fetch (Origin: '' vide)

## Symptôme

`CaddyApiService` (NestJS, undici fetch) appelle `http://localhost:2019/...`
et reçoit systématiquement HTTP 403 :

```
Caddy GET /config/apps/http/servers : HTTP 403
```

Côté logs Caddy admin :
```
{"error":"client is not allowed to access from origin ''"}
```

Mais `curl http://localhost:2019/...` depuis le shell répond 200 OK.

## Contexte

Caddy admin API a une protection anti-DNS-rebinding qui filtre par
**Origin** (et Host) header. Quand on configure dans le Caddyfile :

```
{
    admin localhost:2019 {
        origins localhost 127.0.0.1
    }
}
```

Caddy active une **whitelist stricte d'origins**. Toute requête dont
l'`Origin` header n'est pas dans la liste → 403.

Or **Node fetch (undici) envoie `Origin: ''` (chaîne vide)** par défaut
pour les requêtes serveur-side. Caddy considère `''` comme "non vide mais
non whitelisté" → rejet.

Curl, lui, n'envoie PAS d'Origin header par défaut → Caddy fall back sur
Host check (qui matche `localhost:2019`) → autorisé.

## Cause root

undici (le fetch Node 18+) a un comportement par défaut de pré-remplir
Origin avec `''` au lieu de l'omettre. Cf.
https://github.com/nodejs/undici/issues/2076

Caddy admin distingue :
- `origins` non configuré → tout le monde passe (mais Host doit matcher)
- `origins` configuré → Origin DOIT matcher (sinon 403)

## Solution

### Force l'Origin header explicit dans toutes les fetch vers Caddy admin

```typescript
// caddy.service.ts
private get adminHeaders(): Record<string, string> {
  return { Origin: this.adminBase }; // ex: 'http://localhost:2019'
}

await fetch(`${this.adminBase}/config/...`, {
  method: 'GET',
  headers: this.adminHeaders, // injecte Origin
  ...
});

// Et pour POST :
headers: { ...this.adminHeaders, 'Content-Type': 'application/json' },
```

### Configurer les origins Caddy en concordance

Dans le Caddyfile, lister les origins matchant ce qui sera envoyé par la
fetch (avec ET sans protocole, pour défensif) :

```caddy
{
    admin localhost:2019 {
        origins localhost 127.0.0.1 localhost:2019 127.0.0.1:2019 \
                http://localhost http://127.0.0.1 \
                http://localhost:2019 http://127.0.0.1:2019
    }
}
```

## Détection rapide

Si tu vois 403 sur Caddy admin API depuis du code Node mais 200 depuis
curl, c'est CE problème.

Test :
```bash
node -e "(async () => {
  const r = await fetch('http://localhost:2019/config/apps/http/servers');
  console.log('status:', r.status, await r.text());
})()"
# Attendu si bug : 403 + 'origin '''
```

## Cas observés

- 2026-05-04 (bootstrap multi-tenant Phase 1) : signup self-service
  retournait `ok:true` mais Caddy addVitrineVhost loggait HTTP 403. Le
  vhost n'était jamais ajouté → vitrine fallback subdomain renvoyait 502.
  Fix dans `caddy.service.ts` v2.

## Pourquoi NE PAS faire

- ❌ Retirer le bloc `origins` du Caddyfile pour bypasser → expose
  l'admin API à n'importe quelle source (DNS rebinding attack)
- ❌ Bind l'admin API sur `:2019` (toutes interfaces) → expose à internet
- ❌ Désactiver la protection via `disable_csrf` (n'existe pas pour admin)

## Lié

- [apps/api/src/infra/caddy.service.ts](../../../apps/api/src/infra/caddy.service.ts)
- [.claude/skills/provision/SKILL.md](../../../.claude/skills/provision/SKILL.md)
- Caddy docs admin API : https://caddyserver.com/docs/api
- undici Origin issue : https://github.com/nodejs/undici/issues/2076
