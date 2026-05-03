# Piège — GitHub Actions ne peut pas créer ou approuver de PRs

## Symptôme

```
release-please action failed:
GitHub Actions is not permitted to create or approve pull requests.
```

ou

```
gh pr create --base main --head release-please--branches--main
HTTP 403: GitHub Actions is not permitted to create or approve pull requests
```

## Contexte

`release-please` doit ouvrir une PR `chore(main): release vX.Y.Z` à chaque
push de commits Conventional sur `main`. Cette PR est créée **par le bot
github-actions[bot]**, pas par un user humain.

## Cause

Par défaut, GitHub désactive la capacité pour `github-actions[bot]`
de créer des PRs (sécurité). C'est un setting par-repo.

## Solution

```bash
gh api -X PUT repos/florent427/ClubFlow/actions/permissions/workflow \
  -F default_workflow_permissions=write \
  -F can_approve_pull_request_reviews=true
```

Ou via UI :
- Settings → Actions → General → Workflow permissions
- ✅ "Read and write permissions"
- ✅ "Allow GitHub Actions to create and approve pull requests"

## Vérification

```bash
gh api repos/florent427/ClubFlow/actions/permissions/workflow
# Doit retourner :
# {
#   "default_workflow_permissions": "write",
#   "can_approve_pull_request_reviews": true
# }
```

Puis re-trigger release-please :

```bash
git commit --allow-empty -m "chore(ci): trigger release-please"
git push origin main
gh run watch
```

## Lié

- [runbooks/release.md](../../runbooks/release.md)
- ADR-0005 — Auto-merge des PR release-please
