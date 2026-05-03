# Conventions ClubFlow

## Convention de commits — Conventional Commits FR

```
<type>(<scope>): <description en français impératif>

[corps optionnel — explique le POURQUOI, pas le QUOI]

[footer optionnel — refs/closes #issue, BREAKING CHANGE: ...]

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```

### Types et bump SemVer

| Type | Bump SemVer | Quand |
|---|---|---|
| `feat` | MINOR | Nouvelle feature visible utilisateur |
| `fix` | PATCH | Bug corrigé |
| `refactor` | aucun | Restructuration sans changer le comportement |
| `perf` | PATCH | Amélioration performance |
| `docs` | aucun | CLAUDE.md, README, runbooks |
| `chore` | aucun | Deps, config, outillage, CI |
| `style` | aucun | Formatage |
| `test` | aucun | Ajout/modif de tests |
| `BREAKING CHANGE:` (footer) | MAJOR (MINOR pre-1.0) | Casse une API publique |

### Scopes acceptés

`admin`, `api`, `mobile`, `mobile-admin`, `vitrine`, `portail`, `accounting`,
`adhesions`, `comms`, `messaging`, `members`, `ocr`, `infra`, `db`, `ci`,
`memory`.

### Exemples bons

```
feat(vitrine): nouvelle page Stages avec calendrier sessions
fix(accounting): isBank par RÔLE débit/crédit (drawer Modifier inopérant)
refactor(comms): refonte multi-canal + audience riche
chore(infra): script clubflow-deploy.sh + smoke test post-deploy
docs(memory): pitfall SSH passphrase non-TTY
```

### Règle d'or

**1 commit = 1 intention.** Pas de "wip" / "fix typo" sur main. Reword via
`git rebase -i` avant push si besoin.

## Branches

- `main` — prod, toujours déployable
- `feat/<scope>-<court-titre>` — nouvelle feature
- `fix/<scope>-<court-titre>` — bug fix
- `hotfix/<scope>-<urgence>` — bug bloquant prod, à merger ASAP
- `chore/<court-titre>` — outillage, config
- `docs/<court-titre>` — documentation seule
- `claude/*` — worktrees Claude auto-créés (n'apparaissent pas sur GitHub
  par défaut — ne pas commit dans .gitignore)

## Pull Requests

- Toujours via PR (même solo) → historique propre
- Squash merge par défaut → 1 PR = 1 commit sur main
- Body de PR : Summary + Test plan minimum

## Style code

- TypeScript strict — `npx tsc --noEmit` doit passer avant chaque commit
  côté `apps/api` ET `apps/admin` (au minimum)
- Pas de comments superflus (well-named identifiers > comments)
- Pas de defensive coding au boundaries internes — trust internal calls
- Apollo : `refetchQueries` by name systématique sur les mutations
