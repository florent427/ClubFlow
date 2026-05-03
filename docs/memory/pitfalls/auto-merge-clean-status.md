# Piège — `gh pr merge --auto` échoue "Pull request not in a clean status"

## Symptôme

```
$ gh pr merge $PR_NUMBER --auto --squash
Pull request not in a clean status. Use --force or wait for the status checks to pass.
```

Mais aucun check n'est configuré sur le repo (pas de CI required), donc
le `--auto` n'a rien à attendre → bloque indéfiniment.

## Contexte

Workflow release-please.yml utilisait :

```yaml
- name: Auto-merge release PR
  run: gh pr merge ${{ steps.release.outputs.pr }} --auto --squash
```

→ La PR est créée mais jamais merged → on doit cliquer manuellement.

## Cause root

`gh pr merge --auto` exige qu'il y ait des **status checks required**
configurés et qu'ils soient en cours. Sur un repo sans branch protection,
le command ne sait pas quoi attendre et fail.

## Solution

Utiliser l'API REST direct, qui fait un merge **immédiat** sans attendre :

```yaml
- name: Auto-merge release PR
  env:
    GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
    PR_JSON: ${{ steps.release.outputs.pr }}
  run: |
    PR_NUMBER=$(echo "$PR_JSON" | jq -r '.number')
    gh api -X PUT \
      repos/${{ github.repository }}/pulls/$PR_NUMBER/merge \
      -F merge_method=squash
```

⚠️ Le `gh api -X PUT .../merge` merge **immédiatement** sans aucune
condition (à part les protections de branche si elles existent).

## Pourquoi `${{ steps.release.outputs.pr }}` ne marche pas direct

`outputs.pr` est un **objet JSON complet** (pas juste un number), donc
on ne peut pas l'interpoler directement. Il faut le parser via jq.

Cf. `pitfalls/bash-quoting-json-pr.md` pour le piège d'interpolation.

## Lié

- [runbooks/release.md](../../runbooks/release.md)
- [pitfalls/bash-quoting-json-pr.md](bash-quoting-json-pr.md)
- [pitfalls/gha-pr-permission.md](gha-pr-permission.md)
- ADR-0005 — Auto-merge des PR release-please
