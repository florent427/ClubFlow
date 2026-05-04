# Runbook — Phase 1 multi-tenant ClubFlow (bootstrap)

> Une seule passe pour transformer ClubFlow d'un mono-tenant déguisé
> (`clubflow.topdigital.re` = admin SKSR) vers une vraie archi
> multi-tenant : landing publique + admin multi-club + signup self-service +
> vitrine wildcard subdomain.
>
> Tout le code est déjà déployé via `git push main` (Phase 1-3 du plan
> [precious-drifting-whistle.md](../../.claude/plans/precious-drifting-whistle.md)).
> Ce runbook concerne uniquement la **provision infrastructure** côté serveur.

## Pré-requis

- ✅ Tokens API setup (`/etc/clubflow/secrets.env` avec `CF_API_TOKEN`)
- ✅ DNS wildcard `*.clubflow.topdigital.re` (A + AAAA) déjà propagé (2026-05-04)
- ✅ Code Phase 1-3 mergé sur main + déployé (les apps/landing, /signup, mutations
  `createClubAndAdmin`, `requestVitrineDomain`, `verifyVitrineDomain`,
  `CaddyApiService`, `VitrineDomainCron` existent dans le repo et build clean)

## Procédure — un seul fichier à exécuter

### 1. Copier les artefacts vers le serveur

Depuis le laptop, en bash :

```bash
"/c/Windows/System32/OpenSSH/scp.exe" \
  bin/bootstrap-multitenant.sh \
  bin/clubflow-landing.service \
  bin/migrate-sksr-and-superadmin.sql \
  clubflow@89.167.79.253:/tmp/
```

### 2. Lancer le bootstrap (côté serveur via SSH)

```bash
"/c/Windows/System32/OpenSSH/ssh.exe" -t clubflow@89.167.79.253 \
  "sudo mv /tmp/bootstrap-multitenant.sh /usr/local/bin/ && \
   sudo chmod +x /usr/local/bin/bootstrap-multitenant.sh && \
   sudo bash /usr/local/bin/bootstrap-multitenant.sh"
```

Le script enchaîne (idempotent) :

1. **DNS Cloudflare** :
   - A + AAAA `app.clubflow.topdigital.re` → `89.167.79.253` / `2a01:4f9:c010:99d3::1`
   - A + AAAA wildcard `*.clubflow.topdigital.re` (idempotent, déjà OK)
2. **Caddyfile** :
   - Active `admin localhost:2019` dans le bloc global → permet à l'API NestJS
     d'add/remove des vhosts à chaud via `CaddyApiService`
   - Ajoute vhost `app.clubflow.topdigital.re` → reverse_proxy admin SPA
   - Ajoute vhost wildcard `*.clubflow.topdigital.re` avec TLS `on_demand`
     → reverse_proxy vers vitrine Next.js (résout le club via Host header)
   - `caddy validate` puis `systemctl reload caddy`
3. **systemd `clubflow-landing.service`** :
   - Installe l'unit, enable, build apps/landing, start sur port 5176
4. **SQL** :
   - Renomme le club historique en SKSR (`slug=sksr`, `customDomain=sksr.re`,
     `customDomainStatus=ACTIVE`)
   - Crée ou met à jour `florent.morel427@gmail.com` en `SUPER_ADMIN`
   - Garantit `ClubMembership(SKSR, CLUB_ADMIN)` pour Florent
5. **Smoke test** :
   - `curl` sur `clubflow`, `app.clubflow`, `api.clubflow`, `sksr.re` → tout doit
     répondre 200

## Note sur le switch landing ↔ admin

⚠️ **Avant le bootstrap**, `https://clubflow.topdigital.re` = admin SKSR
(historique). **Après le bootstrap**, `https://clubflow.topdigital.re` = landing
marketing. L'admin se déplace sur `https://app.clubflow.topdigital.re`.

Avant de lancer, **mettre à jour côté serveur** :

```bash
# 1. apps/admin/.env.production : VITE_GRAPHQL_HTTP reste sur api.clubflow.topdigital.re
# 2. apps/api/.env : ajouter app.clubflow.topdigital.re à ADMIN_WEB_ORIGIN
ssh-into-prod "
  sudo sed -i 's|ADMIN_WEB_ORIGIN=.*|ADMIN_WEB_ORIGIN=https://clubflow.topdigital.re,https://app.clubflow.topdigital.re|' /home/clubflow/clubflow/apps/api/.env
  sudo systemctl restart clubflow-api
"

# 3. Le Caddyfile bootstrap auto-ajoute le vhost app.clubflow et garde
#    clubflow.topdigital.re → ⚠️ s'il pointait vers /apps/admin/dist avant,
#    le bootstrap ajoute juste app.clubflow ; clubflow.topdigital.re est
#    inchangé. Quand prêt, modifier manuellement le bloc clubflow.topdigital.re
#    pour reverse_proxy localhost:5176 (landing) au lieu de file_server admin.
```

## Vérification end-to-end

```bash
# Landing accessible
curl -s -o /dev/null -w "%{http_code}\n" https://clubflow.topdigital.re/
# → 200, page landing avec hero "La plateforme tout-en-un"

# Admin sur le nouveau domaine
curl -s -o /dev/null -w "%{http_code}\n" https://app.clubflow.topdigital.re/
# → 200, page admin

# API CORS multi-origin OK
curl -s -X POST https://api.clubflow.topdigital.re/graphql \
  -H "Origin: https://app.clubflow.topdigital.re" \
  -H "Content-Type: application/json" \
  -d '{"query":"{__typename}"}' \
  -w "\n%{http_code}\n"
# → 200

# Test signup self-service
curl -s -X POST https://api.clubflow.topdigital.re/graphql \
  -H "Origin: https://clubflow.topdigital.re" \
  -H "Content-Type: application/json" \
  -d '{"query":"mutation Test($i:CreateClubAndAdminInput!){createClubAndAdmin(input:$i){ok clubId clubSlug vitrineFallbackUrl emailSent}}","variables":{"i":{"clubName":"Test Club","clubSlug":"test-club","email":"test+'$(date +%s)'@example.com","password":"TestTest1234","firstName":"Test","lastName":"User","captchaToken":"10000000-aaaa-bbbb-cccc-000000000001"}}}' | jq .
# → { "data": { "createClubAndAdmin": { "ok": true, ... } } }
# → ⚠️ captchaToken bidon ne marche que si HCAPTCHA_SECRET pas configuré côté API
#   (mode dev). En prod, attendu : "CAPTCHA_FAILED".

# Vérif vitrine subdomain auto-provisionné par Caddy admin API
sleep 30  # propagation cert TLS Let's Encrypt
curl -s -o /dev/null -w "%{http_code}\n" https://test-club.clubflow.topdigital.re/
# → 200 (page vitrine du club test)

# Vérif SKSR encore live
curl -s -o /dev/null -w "%{http_code}\n" https://sksr.re/
# → 200
```

## Rollback (si bootstrap casse quelque chose)

Le script crée un backup `/etc/caddy/Caddyfile.bak.<timestamp>` avant
toute modification. Pour rollback :

```bash
ssh-into-prod "sudo bash -c '
  cd /etc/caddy
  ls -t Caddyfile.bak.* | head -1 | xargs -I{} cp {} Caddyfile
  systemctl reload caddy
  systemctl stop clubflow-landing
'"
```

Pour rollback côté DNS : pas nécessaire (les records ajoutés ne cassent rien).

## Quand ça marche pas

| Symptôme | Cause | Action |
|---|---|---|
| `caddy validate` fail | bloc admin mal placé | ouvrir Caddyfile, mettre `admin localhost:2019` dans le tout 1er `{}` global |
| `clubflow-landing` start fail | port 5176 occupé | `sudo lsof -i :5176` et kill |
| `sudo -u clubflow npm ci` fail | perms `/home/clubflow/clubflow/apps/landing` | `sudo chown -R clubflow:clubflow /home/clubflow/clubflow/apps/landing` |
| SQL "more than 1 club" warning | déjà multi-tenant en cours | exécuter manuellement les UPDATE en filtrant par id |
| `app.clubflow` → 404 | DNS pas propagé | `dig +short app.clubflow.topdigital.re @1.1.1.1` doit retourner 89.167.79.253 |
| `<slug>.clubflow.topdigital.re` → 502 | vitrine pas démarrée | `systemctl status clubflow-vitrine` |
| `<slug>.clubflow.topdigital.re` → cert error | on_demand TLS refuse | vérifier endpoint `http://localhost:3000/v1/vitrine/check-domain` (à coder ou désactiver `ask`) |

## Lié

- [precious-drifting-whistle.md](../../.claude/plans/precious-drifting-whistle.md) — plan complet
- [.claude/skills/provision/SKILL.md](../../.claude/skills/provision/SKILL.md) — provisioning API
- [pitfalls/safety-blocks-shared-infra-mcp.md](../memory/pitfalls/safety-blocks-shared-infra-mcp.md)
- [pitfalls/cloudflare-zone-id-vs-account-id.md](../memory/pitfalls/cloudflare-zone-id-vs-account-id.md)
- [bin/bootstrap-multitenant.sh](../../bin/bootstrap-multitenant.sh) — le script bootstrap
- [bin/clubflow-landing.service](../../bin/clubflow-landing.service) — systemd unit
- [bin/migrate-sksr-and-superadmin.sql](../../bin/migrate-sksr-and-superadmin.sql) — SQL idempotent
- [bin/caddy-multitenant.snippet](../../bin/caddy-multitenant.snippet) — référence Caddy config
