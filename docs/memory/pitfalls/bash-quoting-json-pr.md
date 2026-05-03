# Piège — Interpolation `${{ outputs.pr }}` casse le shell sur parenthèses

## Symptôme

```
/__w/_temp/<...>.sh: line 5: syntax error near unexpected token `('
```

ou

```
/__w/_temp/<...>.sh: line 7: unexpected EOF while looking for matching `"'
```

## Contexte

Workflow release-please.yml avec interpolation directe :

```yaml
- name: Auto-merge
  run: |
    PR=${{ steps.release.outputs.pr }}
    gh pr merge $PR --squash
```

`outputs.pr` contient un JSON multi-lignes avec parenthèses dans le
body de la PR (changelog auto-généré : `### Features (#5)` etc.).

## Cause root

Quand GitHub Actions interpole `${{ ... }}` **dans un `run:`**, il fait
une **substitution textuelle BRUTALE** avant que bash ne parse le script.
Donc :

```bash
PR={"number": 5, "html_url": "https://...", "body": "### Features (#5)\n- foo"}
```

→ bash voit `(`, `)`, `:`, `,`, `"`, etc. tous non-échappés → syntax
error garantie.

## Solution

**Passer l'interpolation via `env:`** au lieu de l'interpoler dans le
script :

```yaml
- name: Auto-merge
  env:
    PR_JSON: ${{ steps.release.outputs.pr }}
    GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
  run: |
    PR_NUMBER=$(echo "$PR_JSON" | jq -r '.number')
    gh api -X PUT \
      repos/${{ github.repository }}/pulls/$PR_NUMBER/merge \
      -F merge_method=squash
```

`env:` met la valeur dans une variable d'environnement, et `$PR_JSON`
est lu **par bash après son parse**, sans casser la syntaxe.

## Règle générale

Pour TOUTE interpolation `${{ }}` dans un `run:`, si la valeur peut
contenir :
- des espaces
- des sauts de ligne
- des `()`, `[]`, `{}`, `'`, `"`, `\``, `$`, `;`, `&`, `|`

→ **utiliser `env:`** au lieu d'interpoler direct.

## Lié

- [pitfalls/auto-merge-clean-status.md](auto-merge-clean-status.md)
- [runbooks/release.md](../../runbooks/release.md)
