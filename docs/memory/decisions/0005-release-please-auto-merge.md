# ADR-0005 — Auto-merge des PR release-please via API REST

## Statut

✅ **Accepté** — 2026-05-02
🔄 Réversible mais réintroduirait du toil (clic manuel à chaque release)

## Contexte

Workflow release-please :

1. On push un commit Conventional sur `main` (ex: `feat(vitrine): ...`)
2. release-please ouvre une PR `chore(main): release v0.X.0` avec
   CHANGELOG auto-généré
3. **Quelqu'un doit merger la PR** pour déclencher la création du tag
   git + GitHub Release
4. Le tag retrigger `deploy.yml` → déploiement prod

L'étape 3 est manuelle par défaut. Pour un seul dev (Florent) qui pousse
~5 commits/jour, c'est 5 clics par jour de toil.

## Options évaluées

### Option A : merge manuel (default)
- ✅ Contrôle total : on peut amender la PR avant merge (changelog,
  ajout de notes, regroupement)
- ❌ Toil quotidien
- ❌ Risque d'oubli → versions s'accumulent

### Option B : `gh pr merge --auto`
- ✅ Pas de clic manuel
- ❌ **Casse** sur repo sans branch protection (cf.
  [pitfalls/auto-merge-clean-status.md](../pitfalls/auto-merge-clean-status.md))
- ❌ Faut configurer branch protection avec status checks required
  (overkill pour solo dev)

### Option C : `gh api -X PUT .../merge` direct dans le workflow
- ✅ Pas de clic manuel
- ✅ Marche sans branch protection
- ✅ Merge **immédiat** (pas d'attente de status checks)
- ❌ Si on veut amender la PR, faut être rapide (le merge tombe ~30s
  après que release-please a ouvert la PR)

## Décision

**Option C** : auto-merge direct via API REST dans `release-please.yml`.

Snippet final :

```yaml
- name: Auto-merge release PR
  if: ${{ steps.release.outputs.pr }}
  env:
    GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
    PR_JSON: ${{ steps.release.outputs.pr }}
  run: |
    PR_NUMBER=$(echo "$PR_JSON" | jq -r '.number')
    echo "Merging PR #$PR_NUMBER"
    gh api -X PUT \
      repos/${{ github.repository }}/pulls/$PR_NUMBER/merge \
      -F merge_method=squash
```

## Conséquences

### Positives
- **Zero touch** : push commit Conventional → tag publié → deploy fait,
  ~5 min total
- Pas besoin de branch protection complexe
- Compatible avec un repo solo dev

### Négatives
- **Pas de "review" possible** sur les PR de release. Si tu veux changer
  le CHANGELOG, faut amender les commits source ou éditer le tag a
  posteriori.
- **Risque de release accidentelle** : un commit `feat:` poussé par
  erreur déclenche automatiquement une nouvelle version mineure publiée
  + déployée
- Atténué par : on peut toujours `git revert` le commit fautif (cf.
  `runbooks/rollback.md`)

## Alternative : protection branch-level

Si on veut "auto-merge sauf si je dis non" :
1. Activer branch protection sur `release-please--branches--main`
2. Ajouter "PR review required: 0" mais "wait 30s before auto-merge"
3. Coder un script qui peut "veto" la PR pendant ces 30s

Trop complexe pour le bénéfice. **Pas retenu.**

## Conditions de revue

À reconsidérer si :
- On passe à plusieurs devs qui pushent → review utile
- On a des features sensibles qui mériteraient un staging avant prod
- On a un env de staging séparé → on peut auto-deploy là-bas + manuel
  pour prod

## Lié

- [pitfalls/auto-merge-clean-status.md](../pitfalls/auto-merge-clean-status.md)
- [pitfalls/bash-quoting-json-pr.md](../pitfalls/bash-quoting-json-pr.md)
- [pitfalls/gha-pr-permission.md](../pitfalls/gha-pr-permission.md)
- [runbooks/release.md](../../runbooks/release.md)
