# Piège — `gh pr create` "No commits between" après squash merge

## Symptôme

```
$ git checkout -b feat/some-feature
$ git push origin feat/some-feature
$ gh pr create --base main --head feat/some-feature
GraphQL: No commits between main and feat/some-feature (createPullRequest)
```

Pourtant `git log feat/some-feature` montre clairement les commits.

## Contexte

Workflow :
1. Tu créés une branche `feat/X` avec 5 commits
2. Tu fais une PR vers main, elle est **squash-mergée** (un seul commit
   apparaît sur main)
3. Tu retournes sur main, tu pull
4. Tu créés une nouvelle branche `feat/Y` qui repart depuis main
5. Tu portes les 5 commits originaux par cherry-pick (par erreur, ou
   parce que la branche d'origine a divergé)
6. `gh pr create` fail "No commits between"

## Cause root

Après squash merge, les **SHA1 originaux** des 5 commits **n'existent
plus** sur main. La nouvelle branche, même si elle a "le même contenu",
a des SHA1 différents.

Mais GitHub regarde si `merge-base(main, feat/Y)` est cohérent. Et
si la branche a été créée depuis l'état post-squash, le merge-base est
le commit squash, donc effectivement "0 commits between".

Le souci vient des cherry-picks : ils créent des commits avec un nouveau
SHA mais le même contenu. GitHub voit "rien à merger" si le contenu
est déjà sur main.

## Solution

**Repartir d'une branche fraîche depuis main** :

```bash
git checkout main && git pull
git checkout -b feat/Y
# Refaire le travail à partir d'un état clean
# (ne PAS cherry-pick d'une branche déjà mergée)
```

Si on a vraiment besoin de récupérer du travail sur une vieille branche :

```bash
git checkout main && git pull
git checkout -b feat/Y
git merge --squash old-branch   # Apporte les changements en 1 commit
git commit -m "feat: récup travail old-branch"
git push -u origin feat/Y
gh pr create
```

## Pourquoi le squash merge est OK quand même

Le squash merge est notre default (cf. [conventions.md](../../knowledge/conventions.md))
parce qu'il garde main lisible (1 commit = 1 PR). Le piège ci-dessus
ne se produit que si on cherry-pick depuis une branche déjà mergée,
ce qui est anormal.

## Lié

- [knowledge/conventions.md](../../knowledge/conventions.md) §Branches
