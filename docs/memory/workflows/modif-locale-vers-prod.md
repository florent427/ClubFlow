# Workflow — Modification locale → production

> Le **flux nominal** d'une feature/fix de l'idée à la prod.

## Étapes

```
[Local dev] → [Commit Conventional] → [Push main] → [release-please]
                                                 ↘  
                                                  → [deploy.yml] → [Prod]
                                                 ↗
                                       [PR auto-merged] → [Tag vX.Y.Z]
                                                 ↘
                                                  → [GitHub Release]
```

## Phase 1 — Local dev

```bash
# Repartir de main propre
git checkout main && git pull

# Branche de travail (optionnel pour solo, conseillé pour PR review)
git checkout -b feat/scope/description

# Démarrer la stack dev (si pas déjà tournante)
# → utiliser le skill /restart
```

Code la feature/fix. Fais des commits **petits et atomiques** :

```bash
git add <files-spécifiques>  # PAS git add -A
git commit -m "feat(scope): description en français

Détails optionnels.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

## Phase 2 — Vérifications avant push

```bash
# Type-check
cd apps/api && npx tsc --noEmit
cd apps/admin && npx tsc --noEmit

# Tests si présents
cd apps/api && npm test
```

⚠️ Si `apps/admin` a des erreurs TS (cf.
[pitfalls/build-admin-strict-ts.md](../pitfalls/build-admin-strict-ts.md)),
les ignorer (workaround connu).

## Phase 3 — Push

```bash
git push origin <branche>
```

Si branche != main :

```bash
gh pr create --base main --head <branche> \
  --title "feat(scope): description" \
  --body "Closes #N (si applicable)"
gh pr merge <PR#> --squash --delete-branch
```

## Phase 4 — Pipeline auto (sans toi)

À ce stade, **tu ne touches plus à rien** :

1. **deploy.yml** trigger immédiat sur push main
   - SSH Hetzner → `clubflow-deploy.sh` (7 phases)
   - Smoke test 4 vhosts
   - ✅ vert si OK, ❌ rouge sinon → check `gh run watch`

2. **release-please.yml** trigger en parallèle
   - Compte les commits depuis le dernier tag
   - Si commits Conventional présents → ouvre/met à jour la PR de release
   - **Auto-merge squash** via API REST
   - Le merge crée le tag `vX.Y.Z` + GitHub Release avec CHANGELOG

3. **deploy.yml** retrigger sur le nouveau tag
   - Re-déploie (idempotent, pas grave)
   - Smoke test final

## Phase 5 — Vérification

```bash
# Workflows en cours
gh run list --limit 3

# Dernière release publiée
gh release view --json tagName,name,publishedAt

# Smoke manuel
for h in clubflow.topdigital.re portail.clubflow.topdigital.re sksr.re; do
  echo "$(curl -s -o /dev/null -w '%{http_code}' https://$h/) $h"
done
```

## En cas d'erreur

| Symptôme | Action |
|---|---|
| deploy.yml rouge | `gh run view <run-id> --log` puis cf. `runbooks/deploy.md` §En cas d'échec |
| release-please pas de PR | `gh workflow run release-please.yml` (cf. `pitfalls/release-please-no-trigger.md`) |
| Smoke 500 sur vitrine | `runbooks/restore-env.md` ou `runbooks/seed-vitrine-pages.md` |
| Régression en prod | `runbooks/rollback.md` |

## Convention de commit (rappel)

```
<type>(<scope>): <description>

[corps]

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```

Types et impact SemVer :
- `feat` → minor (0.X.0)
- `fix` → patch (0.0.X)
- `feat!:` ou `BREAKING CHANGE:` → major (X.0.0)
- `chore`, `docs`, `style`, `refactor`, `test` → pas de release (pas de
  bump SemVer)

Cf. [knowledge/conventions.md](../../knowledge/conventions.md) pour la
liste complète.

## Lié

- [knowledge/conventions.md](../../knowledge/conventions.md)
- [runbooks/release.md](../../runbooks/release.md)
- [runbooks/deploy.md](../../runbooks/deploy.md)
