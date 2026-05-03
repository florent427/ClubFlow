# Runbook — Release sémantique automatique

> Référencé par le skill `/release`. Workflow géré par release-please.

## Setup actuel (déjà fait)

- ✅ `release-please-config.json` (sections changelog avec emojis)
- ✅ `.release-please-manifest.json` (version courante)
- ✅ `.github/workflows/release-please.yml` (trigger auto sur push main)
- ✅ Auto-merge de la PR de release via API REST (cf. ADR-0005)
- ✅ Permission GHA "create PR" activée
- ✅ `CHANGELOG.md` régénéré auto

## Workflow nominal (auto, sans toi)

```
1. Tu push un commit Conventional sur main
   ex: feat(vitrine): nouvelle page Stages

2. release-please.yml tourne :
   - Compte les commits depuis le dernier tag
   - Calcule le bump SemVer (feat → minor, fix → patch, BREAKING → major)
   - Ouvre/met à jour la PR "chore(main): release vX.Y.Z"
   - AUTO-MERGE squash via API REST

3. Le merge crée :
   - tag git vX.Y.Z
   - GitHub Release avec CHANGELOG section auto

4. deploy.yml retrigger sur le nouveau tag
   - SSH Hetzner → clubflow-deploy.sh → smoke test
```

## Release manuelle (cas d'urgence)

```bash
git checkout main && git pull
git tag -a v0.3.0 -m "v0.3.0 — description"
git push origin v0.3.0

# Créer la GitHub Release avec notes manuelles
gh release create v0.3.0 \
  --title "v0.3.0 — description" \
  --notes "$(cat <<'EOF'
## ✨ Features
- ...
## 🐛 Bug Fixes
- ...
EOF
)"

# Deploy manuel
"/c/Windows/System32/OpenSSH/ssh.exe" clubflow@89.167.79.253 \
  "sudo /usr/local/bin/clubflow-deploy.sh"
```

## Vérifier l'état du pipeline

```bash
# Workflows en cours
gh run list --limit 5

# Dernière release
gh release view --json tagName,name,createdAt

# Tags
gh api repos/florent427/ClubFlow/tags -q '.[0].name'

# PR de release ouverte ?
gh pr list --label "autorelease: pending"
```

## Pièges connus

Cf. `memory/pitfalls/` :
- `gha-pr-permission.md` — permission GHA bloquée
- `auto-merge-clean-status.md` — `gh pr merge --auto` échoue
- `bash-quoting-json-pr.md` — interpolation `${{ outputs.pr }}` casse le shell
- `release-please-no-trigger.md` — pas de `workflow_dispatch`

## Conventions Conventional Commits

Cf. `knowledge/conventions.md` pour la liste des types et leur impact bump.

## Manifest — synchronisation

⚠️ `.release-please-manifest.json` doit refléter le dernier tag publié.
Si désynchronisé (ex: après un revert), corriger manuellement et commit
`chore(ci): sync release-please manifest`.
