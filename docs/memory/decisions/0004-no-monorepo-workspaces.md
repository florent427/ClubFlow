# ADR-0004 — Pas de monorepo npm workspaces (chaque app a son `package.json`)

## Statut

✅ **Accepté** — 2026-03-15
🔄 Réversible mais coût migration estimé ~1 jour

## Contexte

Le repo a `apps/api/`, `apps/admin/`, `apps/member-portal/`, `apps/vitrine/`,
`apps/mobile/`, `apps/mobile-admin/`, `packages/mobile-shared/`.

3 options :
1. **npm workspaces** (`package.json` racine + `workspaces: [...]`)
2. **pnpm workspaces** (idem mais via pnpm)
3. **Pas de workspaces** : chaque app gère ses dépendances indépendamment

## Décision

**Option 3** : pas de monorepo workspaces.

Pas de `package.json` racine. Chaque `apps/*` et `packages/*` a son
propre `package.json`, son `node_modules`, son `package-lock.json`.

Pour partager du code entre apps :
- `packages/mobile-shared` est référencé via un chemin **relatif**
  (`"@clubflow/mobile-shared": "file:../../packages/mobile-shared"`)
- Pas de hoisting cross-apps

## Conséquences

### Positives
- **Isolation totale** : un upgrade de deps dans `apps/admin` n'impacte
  pas `apps/api`. Pas de "phantom dependencies"
- **Build simple** : `cd apps/X && npm ci && npm run build`. Pas besoin
  de connaître les workspace flags
- **CI/CD simple** : le script `clubflow-deploy.sh` build chaque app
  indépendamment
- **Pas de magie npm/pnpm** : ce qui est dans un `package.json` est
  effectivement utilisé
- **Métaphore mentale claire** : chaque app est un projet à part qui
  vit dans le même repo

### Négatives
- **Disque** : ~6 × `node_modules` (~500 MB chacun) = ~3 GB. Pas un
  souci sur disque local 80 GB.
- **Updates fastidieux** : pour bumper React de 18.2 à 18.3, il faut
  faire 3 `npm install` (admin, portal, vitrine) au lieu d'un seul.
  Mitigé par scripts si besoin (`for d in apps/{admin,member-portal,vitrine}; do (cd $d && npm i react@18.3); done`)
- **Pas de cache npm partagé** entre apps
- **`packages/mobile-shared` doit être rebuilt** manuellement à chaque
  changement (pas de hot-reload cross-package)

## Pourquoi pas npm workspaces

- **Hoisting** crée des "phantom deps" : un package peut importer une
  dépendance qui n'est pas dans son `package.json` mais qui se trouve
  hoistée dans `node_modules` racine. Casse en prod random.
- **Conflits de versions** : si 2 apps veulent React 18 et React 19,
  npm workspaces force un compromis (ou installe en "nested" avec
  surprises)
- **Apollo Client v4 + React 19 + Vite** sont sensibles au hoisting
  (déjà eu des cas de double instance Apollo)
- **Setup CI** : il faut `npm ci` à la racine **et** des chemins relatifs
  partout. Compliqué quand on déploie qu'une seule app.

## Pourquoi pas pnpm workspaces

- pnpm a moins de phantom deps (utilise des symlinks strict)
- mais : on aurait à apprendre pnpm (commandes différentes), forcer
  l'équipe (et Claude) à le retenir
- ratio bénéfice/coût discutable pour 4 apps

## Quand reconsidérer

- Si on passe à **10+ apps** dans `apps/` → la maintenance devient
  pénible, considérer pnpm ou Nx
- Si on a **beaucoup de code partagé** (genre 3+ packages dans
  `packages/`) → un monorepo "vrai" devient justifié
- Si on doit faire des **builds incrémentaux** complexes (tests dépendants
  entre apps, etc.) → Nx ou Turborepo
- À horizon 2-3 ans, probablement pas avant

## Lié

- [knowledge/repo-structure.md](../../knowledge/repo-structure.md)
- [knowledge/stack.md](../../knowledge/stack.md)
