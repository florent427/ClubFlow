# Structure du repo ClubFlow

```
clubflow/
├── apps/
│   ├── api/              NestJS API (port dev 3000, prod systemd:3000)
│   ├── admin/            Web admin Vite (port dev 5173, prod static)
│   ├── member-portal/    Web portail membre Vite (port dev 5174, prod static)
│   ├── vitrine/          Site public Next.js SSR (port 5175 dev+prod, hardcodé)
│   ├── mobile/           Expo membre (SDK 55)
│   └── mobile-admin/     Expo admin (en cours, SDK 55)
├── packages/
│   └── mobile-shared/    Theme + UI + Apollo factory partagés mobile
├── docker-compose.yml    Postgres + Mailpit + Postfix relay (dev)
├── docs/
│   ├── knowledge/        ← TU ES ICI
│   ├── runbooks/         Procédures multi-étapes
│   └── memory/           Pitfalls, décisions, workflows appris
├── .github/workflows/    CI/CD (release-please, deploy, validate-memory)
├── .claude/skills/       Skills Claude (gitignored, locaux)
├── bin/                  Scripts utilitaires (memory-index, etc.)
├── CLAUDE.md             Orchestrateur (carte mémoire, ~250L)
├── CHANGELOG.md          Régénéré auto par release-please
├── release-please-config.json
└── .release-please-manifest.json
```

## Points importants

- **Pas de monorepo npm workspaces global** — chaque app gère ses dépendances
  (cf. ADR-0004). Pas de `package.json` à la racine.
- **`.claude/`** est gitignored — les skills `/deploy`, `/release`, etc. sont
  perso. Recréés au besoin via templates dans `docs/runbooks/`.
- **`docs/superpowers/`** contient des outils tiers, pas de notre fait.
- **`docs/vitrine-runbook.md`** — runbook historique vitrine, à fusionner
  avec docs/runbooks/.

## Conventions paths

- Tests E2E : `apps/api/test/jest-e2e.json`
- Migrations Prisma : `apps/api/prisma/migrations/<YYYYMMDDHHMMSS>_<slug>/`
- Schemas GraphQL : auto-générés depuis `apps/api/src/**/*.resolver.ts`
- Documents GraphQL côté admin : `apps/admin/src/lib/documents.ts` (centralisé)
