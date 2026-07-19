# Piège — `staging` disparaît à chaque promotion vers `main`

## Symptôme

Juste après avoir mergé la PR `staging` → `main`, la branche n'existe plus :

```bash
git ls-remote --heads origin staging main
# 34d3f0acdb0b01c5a6afe78b25cc1e0fdd00e71f  refs/heads/main
# (aucune ligne pour staging)
```

Et au push suivant :

```
error: src refspec staging does not match any
# ou, si on repart d'une branche locale :
 ! [rejected]  HEAD -> staging (non-fast-forward)
```

## Contexte

Arrivé **trois fois** le 2026-07-18/19, aux PR [#104](https://github.com/florent427/ClubFlow/pull/104),
[#106](https://github.com/florent427/ClubFlow/pull/106) et
[#108](https://github.com/florent427/ClubFlow/pull/108) — c'est-à-dire à
chaque promotion. Ce n'est pas un incident : c'est le fonctionnement nominal
du dépôt, et il se reproduira à la prochaine.

## Cause root

Le dépôt a `delete_branch_on_merge` activé :

```bash
gh api repos/florent427/ClubFlow --jq '.delete_branch_on_merge'
# true
```

Ce réglage supprime la branche source de toute PR mergée. Il est conçu pour
des branches de feature éphémères — et GitHub ne distingue pas. Or `staging`
est une branche **d'environnement permanente** : elle a son propre VPS
(`46.62.197.93`), sa base `clubflow_staging`, son pipeline
`deploy-staging.yml`. Chaque promotion la traite comme un jetable.

## Ce qui rend le piège coûteux

La suppression en elle-même est bénigne. **Le danger est la recréation.**

À la PR #104, `staging` a été recréée depuis une référence locale périmée :
la branche est réapparue en **ayant perdu 6 commits**, dont la release 0.21.0.
Rien ne l'a signalé — une branche qui existe et sur laquelle le déploiement
passe au vert ne ressemble pas à une branche amputée. Il a fallu un
`git log origin/main..origin/staging` pour s'en apercevoir, et un commit de
réparation (`a0748c4`) pour la réaligner.

Le déploiement staging **repart alors en arrière** sans le dire : le VPS
reçoit un code plus ancien que la prod.

## Solution

Recréer `staging` **depuis `origin/main` fraîchement récupéré**, jamais
depuis une branche locale :

```bash
git fetch origin main            # indispensable : le commit de fusion est
                                 # créé côté GitHub, il n'est pas en local
git push origin origin/main:refs/heads/staging
```

Après une promotion, `staging` et `main` doivent être **au même commit** :

```bash
git ls-remote --heads origin main staging
# les deux SHA doivent être identiques
```

## Le corriger à la racine (recommandé)

```bash
gh api -X PATCH repos/florent427/ClubFlow -f delete_branch_on_merge=false
```

Le réglage ne sert à rien ici : les branches de feature du dépôt sont rares
et supprimées à la main, alors que la seule branche qu'il touche en pratique
est justement celle qu'il ne faut pas supprimer.

## Pourquoi NE PAS faire

- ❌ **`git push origin HEAD:staging` depuis sa branche de travail.** C'est
  ce qui a coûté les 6 commits : la branche locale ignore le commit de fusion
  créé sur GitHub, et tout ce que `main` a reçu entre-temps.
- ❌ **`git push --force` pour débloquer un rejet non-fast-forward.** Le rejet
  est le seul garde-fou qui reste ; le forcer, c'est écraser volontairement ce
  qu'on n'a pas lu. Faire `git fetch` puis `git merge origin/staging`.
- ❌ **Attendre de recréer plus tard.** Entre-temps un push sur `staging`
  échoue, et le réflexe sous pression est précisément le `--force` ci-dessus.

## Détection

Après chaque merge `staging` → `main`, et avant tout autre travail :

```bash
git fetch origin --quiet
git log --oneline origin/staging..origin/main   # doit être VIDE
git log --oneline origin/main..origin/staging   # doit être VIDE
```

Deux sorties vides = les branches sont alignées. Une sortie non vide juste
après une promotion signifie que `staging` a été recréée de travers.

## Lié

- [workflows/modif-locale-vers-prod.md](../workflows/modif-locale-vers-prod.md)
- [runbooks/release.md](../../runbooks/release.md)
- [ADR-0005](../decisions/0005-release-please-auto-merge.md) — l'auto-merge de
  la PR de release, autre effet de bord du même pipeline
