---
name: release
description: Prépare une release ClubFlow (versioning sémantique automatique via release-please). Soit setup initial du système de release auto, soit cycle de release courant (review PR de release, merge, tag, GitHub Release). À utiliser quand l'utilisateur dit "/release", "release", "publie une version", "tag une release", "génère le changelog", ou veut configurer release-please pour la première fois.
---

# /release — Pipeline de versioning ClubFlow

## Quand utiliser

L'utilisateur veut soit :
- **Configurer release-please** pour la première fois (one-shot)
- **Faire une release** : tagger + générer notes de version + push tag → trigger deploy

## Architecture cible

```
commits Conventional sur main
        ↓
release-please bot ouvre PR "release vX.Y.Z" (CHANGELOG.md auto)
        ↓
TU merges la PR de release
        ↓
release-please tag git vX.Y.Z + GitHub Release publiée
        ↓
workflow deploy.yml SSH le serveur → /usr/local/bin/clubflow-deploy.sh
        ↓
Prod live à jour
```

→ Tu n'écris **jamais** de release notes à la main. Tes commits sont les notes.

## Setup initial (à faire une fois)

### 1. Créer le manifest + config

```bash
# .release-please-manifest.json
{ ".": "0.1.0" }
```

```json
// release-please-config.json
{
  "release-type": "simple",
  "include-component-in-tag": false,
  "include-v-in-tag": true,
  "bump-minor-pre-major": true,
  "bump-patch-for-minor-pre-major": false,
  "draft": false,
  "prerelease": false,
  "changelog-sections": [
    {"type": "feat",     "section": "✨ Features"},
    {"type": "fix",      "section": "🐛 Bug Fixes"},
    {"type": "perf",     "section": "⚡ Performance"},
    {"type": "refactor", "section": "♻️ Refactor"},
    {"type": "revert",   "section": "⏪ Reverts"},
    {"type": "docs",     "section": "📝 Documentation", "hidden": true},
    {"type": "chore",    "section": "🔧 Chores",        "hidden": true},
    {"type": "test",     "section": "🧪 Tests",         "hidden": true},
    {"type": "ci",       "section": "🤖 CI",            "hidden": true},
    {"type": "style",    "section": "💄 Style",         "hidden": true}
  ]
}
```

### 2. Workflow GitHub Actions

```yaml
# .github/workflows/release-please.yml
name: release-please
on:
  push:
    branches: [main]
permissions:
  contents: write
  pull-requests: write
jobs:
  release-please:
    runs-on: ubuntu-latest
    steps:
      - uses: googleapis/release-please-action@v4
        id: release
        with:
          config-file: release-please-config.json
          manifest-file: .release-please-manifest.json
      # Optionnel : déclenche le deploy uniquement quand un tag est créé
      - name: Trigger deploy on release
        if: ${{ steps.release.outputs.release_created }}
        run: gh workflow run deploy.yml -f tag=${{ steps.release.outputs.tag_name }}
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

### 3. Workflow deploy

```yaml
# .github/workflows/deploy.yml
name: Deploy to production
on:
  push:
    tags: ['v*']
  workflow_dispatch:
    inputs:
      tag:
        description: 'Tag à déployer (ex v0.3.0)'
        required: false
jobs:
  deploy:
    runs-on: ubuntu-latest
    environment:
      name: production
      url: https://clubflow.topdigital.re
    steps:
      - name: Deploy via SSH
        uses: appleboy/ssh-action@v1
        with:
          host: 89.167.79.253
          username: clubflow
          key: ${{ secrets.SSH_PRIVATE_KEY }}
          script: sudo /usr/local/bin/clubflow-deploy.sh
```

### 4. Secrets GitHub à configurer

Sur https://github.com/florent427/ClubFlow/settings/secrets/actions :
- **SSH_PRIVATE_KEY** : contenu de `~/.ssh/id_ed25519` (la clé privée laptop)

⚠️ Ne jamais commit cette clé. Elle vit uniquement dans GitHub Secrets.

### 5. Commit + push initial

```bash
git checkout -b chore/release-please-setup
git add release-please-config.json .release-please-manifest.json .github/workflows/
git commit -m "chore(infra): setup release-please pour versioning auto

Génère automatiquement les release notes à partir des commits
Conventional Commits + ouvre une PR de release sur main.
Le merge de cette PR crée le tag git + GitHub Release + déclenche deploy.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
git push -u origin chore/release-please-setup
gh pr create --title "chore(infra): setup release-please" --body "..."
gh pr merge --squash
```

## Cycle de release courant (utilisation normale)

### A. Vérifier qu'il y a une PR de release ouverte

```bash
gh pr list --label "autorelease: pending"
```

S'il y en a une → review puis merge.

### B. Reviewer la PR de release

La PR contient :
- Mise à jour de `.release-please-manifest.json` (ex `0.1.0` → `0.2.0`)
- Génération/MAJ de `CHANGELOG.md` avec les commits depuis la dernière release
  groupés par type (✨ Features, 🐛 Bug Fixes, etc.)
- Pas de code applicatif modifié

Tu vérifies :
- Le bump SemVer est cohérent (feat → minor, fix → patch, BREAKING → major)
- Le changelog liste bien tout ce que tu as fait depuis la dernière release
- Pas de commit "wip" ou "fix typo" qui pollue les notes

Si OK → merge. Sinon, edit les commits problématiques sur main (squash/reword)
et release-please régénérera la PR.

### C. Merge → tout devient automatique

```bash
gh pr merge <PR-number> --squash
```

À partir de là :
1. release-please crée le tag `vX.Y.Z`
2. release-please crée la GitHub Release avec les notes
3. workflow `deploy.yml` se déclenche sur le tag
4. SSH le serveur → `/usr/local/bin/clubflow-deploy.sh`
5. Smoke test
6. Prod live

### D. Vérifier que le deploy a réussi

```bash
gh run list --workflow=deploy.yml --limit 3
gh run view --log    # logs détaillés du dernier run
```

Et smoke test côté laptop :
```bash
for h in clubflow.topdigital.re portail.clubflow.topdigital.re sksr.re; do
  echo "$(curl -s -o /dev/null -w '%{http_code}' https://$h/)  $h"
done
```

## Release manuelle (sans release-please)

Cas : urgence, ou avant que release-please soit setup.

```bash
git checkout main && git pull
# Créer le tag annoté
git tag -a v0.3.0 -m "v0.3.0 — Page Stages vitrine"
git push origin v0.3.0

# Créer la GitHub Release avec notes manuelles
gh release create v0.3.0 \
  --title "v0.3.0 — Page Stages vitrine" \
  --notes "$(cat <<'EOF'
## ✨ Features
- Nouvelle page /stages avec calendrier sessions

## 🐛 Bug Fixes
- Aucun
EOF
)"

# Deploy manuel
"/c/Windows/System32/OpenSSH/ssh.exe" clubflow@89.167.79.253 \
  "sudo /usr/local/bin/clubflow-deploy.sh"
```

## Conventions strictes pour que release-please fonctionne

- **Commits Conventional Commits OBLIGATOIRES** sur main (sinon ils n'apparaissent
  pas dans les notes)
- **Type explicite** : `feat:`, `fix:`, `perf:`, `refactor:`, etc.
- **BREAKING CHANGE** : footer `BREAKING CHANGE: <description>` pour bump MAJOR
- **Squash merge** des PRs avec un message Conventional propre — pas le titre par
  défaut "Merge pull request #N from ..."

Cf. CLAUDE.md §5 pour la convention complète.

## Reporter à l'utilisateur

```
🚀 Release v0.3.0 publiée

Tag       : https://github.com/florent427/ClubFlow/releases/tag/v0.3.0
Changelog : 3 ✨ features, 2 🐛 fixes, 1 ⚡ perf
Deploy    : workflow run #42 — ✅ succès en 2m18s
URLs OK   : clubflow.topdigital.re, portail.*, sksr.re, api.*
```

## Pièges connus + safeguards (déjà appliqués dans ce repo)

### Commits non-Conventional invisibles dans le changelog
Si un commit n'a pas le format `type(scope): description`, release-please
ne le détecte pas et il n'apparaît PAS dans le changelog. Reword via
`git rebase -i` + force-push avant le merge sur main si tu vois ça.

### Version 0.x.y — bump MINOR pour breaking
Tant qu'on n'a pas atteint v1.0.0, par convention SemVer les breaking
changes sont autorisés sur les bumps MINOR (pas seulement MAJOR).
release-please respecte cette règle car `bump-minor-pre-major: true`.

### PR de release pas créée
Vérifier que le workflow a tourné :
```bash
gh run list --workflow=release-please.yml --limit 5
```
Si le workflow a échoué avec "GitHub Actions is not permitted to create
or approve pull requests" → permission manquante. Fix one-shot :
```bash
gh api -X PUT repos/florent427/ClubFlow/actions/permissions/workflow \
  -F default_workflow_permissions=write \
  -F can_approve_pull_request_reviews=true
```
**Déjà appliqué sur ce repo.**

### Auto-merge release PR échoue avec "Pull request is in clean status"
**Cause** : `gh pr merge --auto` n'autorise l'auto-merge QUE si la PR a
des status checks bloquants en attente. Si elle est mergeable immédiatement
(notre cas, pas de checks configurés sur PRs de release), `--auto` retourne
"clean status".
**Solution** : utiliser l'API REST direct dans le workflow :
```yaml
- run: |
    PR_NUMBER=$(echo "$PR_JSON" | jq -r '.number')
    gh api -X PUT "repos/${{ github.repository }}/pulls/$PR_NUMBER/merge" \
      -F merge_method=squash
  env:
    PR_JSON: ${{ steps.release.outputs.pr }}
    GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```
**Déjà fait dans `.github/workflows/release-please.yml` (commit `c0125a6`).**

### Bash interpolation casse sur la body de la PR de release
Si tu tentes `echo '${{ steps.release.outputs.pr }}'` directement, ça
explose en `syntax error near unexpected token '('` parce que la body
contient des parenthèses et apostrophes du markdown.
**Solution** : passer le JSON via `env: PR_JSON:` puis `echo "$PR_JSON"`.
**Déjà fait** (cf. ci-dessus).

### Squash merge change le SHA des commits
Quand release-please ouvre une PR de release et qu'elle est squash-mergée,
les commits originaux du worktree de release (`release-please--branches--main`)
ne sont plus accessibles via leur branche. Si tu veux pousser un nouveau
commit après, créer une nouvelle branche depuis `origin/main` à jour, ne
PAS continuer sur la branche déjà mergée.

### Re-trigger manuel impossible
`release-please.yml` n'a pas de trigger `workflow_dispatch`. Pour forcer
un nouveau run :
- Soit pusher un commit (même empty : `git commit --allow-empty -m "chore: trigger ci"`)
- Soit re-run le run failed via UI ou `gh run rerun <run-id>`
- Soit ajouter `workflow_dispatch:` au yaml (bloat mais utile pour debug)

### Manifest désynchronisé
Si `.release-please-manifest.json` ne reflète pas le dernier tag, release-please
peut proposer le mauvais bump. Vérifier que le contenu correspond au dernier
tag git réellement publié. Actuellement : `0.2.0` après publication de v0.2.0.
