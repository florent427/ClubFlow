# 📚 Memory INDEX — ClubFlow

> ⚠️ **Fichier auto-généré** par `bin/memory-index`. Ne pas éditer à la main.
> Pour ajouter une entrée : créer le fichier dans le sous-dossier approprié,
> puis lancer `bin/memory-index` (ou commit, le hook le fait).

## Comment chercher

| Tu veux... | Va voir... |
|---|---|
| Comprendre un choix tranché ("pourquoi PG 16 ?") | `decisions/` |
| Éviter de retomber dans un piège connu | `pitfalls/` |
| Suivre un parcours complet (du début à la fin) | `workflows/` |
| Procédure opérationnelle (deploy, rollback, etc.) | `../runbooks/` |
| Connaissance statique du projet (stack, conventions) | `../knowledge/` |

## 🪤 Pièges connus (pitfalls)

| Fichier | Sujet |
|---|---|
| [`auto-merge-clean-status.md`](pitfalls/auto-merge-clean-status.md) | Piège — `gh pr merge --auto` échoue "Pull request not in a clean status" |
| [`bash-quoting-json-pr.md`](pitfalls/bash-quoting-json-pr.md) | Piège — Interpolation `${{ outputs.pr }}` casse le shell sur parenthèses |
| [`build-admin-strict-ts.md`](pitfalls/build-admin-strict-ts.md) | Piège — Build `apps/admin` échoue en strict TS |
| [`caddy-perms-home-clubflow.md`](pitfalls/caddy-perms-home-clubflow.md) | Piège — Caddy 403 sur file_server depuis `/home/clubflow/` |
| [`caddyfile-log-block-inline-vs-multiline.md`](pitfalls/caddyfile-log-block-inline-vs-multiline.md) | Piège — `caddy validate` rejette `log { output file ... { ... } }` inline |
| [`cloudflare-proxy-breaks-letsencrypt.md`](pitfalls/cloudflare-proxy-breaks-letsencrypt.md) | Piège — Cloudflare proxy ON casse le challenge Let's Encrypt |
| [`cors-no-origin-prod.md`](pitfalls/cors-no-origin-prod.md) | Piège — CORS API en `NODE_ENV=production` bloque les appels SSR |
| [`env-production-perdus-reset-hard.md`](pitfalls/env-production-perdus-reset-hard.md) | Piège — `.env.production` perdus après `git reset --hard` |
| [`gh-pr-create-no-commits.md`](pitfalls/gh-pr-create-no-commits.md) | Piège — `gh pr create` "No commits between" après squash merge |
| [`gha-pr-permission.md`](pitfalls/gha-pr-permission.md) | Piège — GitHub Actions ne peut pas créer ou approuver de PRs |
| [`gitignore-claude-trailing-slash-blocks-negation.md`](pitfalls/gitignore-claude-trailing-slash-blocks-negation.md) | Piège — `.gitignore` `.claude/` (trailing slash) bloque la négation `!.claude/skills/` |
| [`nestjs-graphql-nullable-needs-explicit-type.md`](pitfalls/nestjs-graphql-nullable-needs-explicit-type.md) | Piège — `@Field({ nullable: true })` GraphQL crash sans type explicite |
| [`nextjs-isr-cache-stale.md`](pitfalls/nextjs-isr-cache-stale.md) | Piège — Next.js ISR cache stale après insert DB |
| [`ovh-a-parasite-185-158.md`](pitfalls/ovh-a-parasite-185-158.md) | Piège — Record A parasite OVH `185.158.133.1` (welcome page) |
| [`pdf-parse-v2-conflict.md`](pitfalls/pdf-parse-v2-conflict.md) | Piège — `pdf-parse v2` casse à cause de conflit `pdfjs-dist` avec `pdf-to-img` |
| [`prisma-generate-eperm-windows.md`](pitfalls/prisma-generate-eperm-windows.md) | Piège — `prisma generate` fail EPERM sur Windows (DLL lockée) |
| [`prisma-migration-order-broken.md`](pitfalls/prisma-migration-order-broken.md) | Piège — Migrations Prisma dans le mauvais ordre |
| [`release-please-no-trigger.md`](pitfalls/release-please-no-trigger.md) | Piège — release-please ne se déclenche pas (pas de `workflow_dispatch`) |
| [`ssh-passphrase-non-tty.md`](pitfalls/ssh-passphrase-non-tty.md) | Piège — SSH `Permission denied` quand la clé a une passphrase |

## 🏛️ Décisions architecturales (ADR)

| Fichier | Sujet |
|---|---|
| [`0001-postgresql-16.md`](decisions/0001-postgresql-16.md) | ADR-0001 — PostgreSQL 16 (pas 15, pas 17) |
| [`0002-cloudflare-dns-only.md`](decisions/0002-cloudflare-dns-only.md) | ADR-0002 — Cloudflare DNS only mode (proxy OFF) |
| [`0003-prisma-db-push.md`](decisions/0003-prisma-db-push.md) | ADR-0003 — Utiliser `prisma db push` au lieu de `migrate deploy` (temporaire) |
| [`0004-no-monorepo-workspaces.md`](decisions/0004-no-monorepo-workspaces.md) | ADR-0004 — Pas de monorepo npm workspaces (chaque app a son `package.json`) |
| [`0005-release-please-auto-merge.md`](decisions/0005-release-please-auto-merge.md) | ADR-0005 — Auto-merge des PR release-please via API REST |
| [`0006-path-based-multi-tenant.md`](decisions/0006-path-based-multi-tenant.md) | ADR-0006 — Multi-tenant admin via path (`app.clubflow.topdigital.re/<slug>/...`) |
| [`0007-caddy-admin-api-vs-caddyfile.md`](decisions/0007-caddy-admin-api-vs-caddyfile.md) | ADR-0007 — Caddy Admin API (port 2019) pour vhosts dynamiques |

## 🔄 Workflows métier

| Fichier | Sujet |
|---|---|
| [`creation-club-multi-tenant.md`](workflows/creation-club-multi-tenant.md) | Workflow — Onboarder un nouveau club multi-tenant |
| [`modif-locale-vers-prod.md`](workflows/modif-locale-vers-prod.md) | Workflow — Modification locale → production |
| [`seed-vitrine-pages.md`](workflows/seed-vitrine-pages.md) | Workflow — Seeder le contenu vitrine d'un club |
| [`snapshot-prod-vers-clone.md`](workflows/snapshot-prod-vers-clone.md) | Workflow — Cloner la prod en local pour debug |

---

_Index généré le 2026-05-04 05:12 UTC par `bin/memory-index`._

Pour rebuild : `bin/memory-index`
Pour vérifier en CI : `bin/memory-index --check`
