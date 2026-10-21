# Promouvoir `staging` vers `main` quand plusieurs sessions y poussent

## Quand ce parcours s'applique

Tu t'apprêtes à fusionner `staging` dans `main` et **tu n'es pas seul à
pousser sur `staging`** (autre session Claude, autre machine, travail en
parallèle). C'est le cas par défaut sur ce repo.

Le risque n'est pas le conflit git — il se voit. C'est de **promouvoir en
production du code qu'on n'a jamais vérifié**, sans même savoir qu'il est
là.

## Le piège concret

En ouvrant la PR de promotion, elle contenait **11 commits : 7 miens et 4
d'une session parallèle** (rendu vitrine passé en statique,
`generateStaticParams`, renommage de dossier, cache). Ces 4 commits
avaient été poussés sur `origin/staging` après mon dernier push et étaient
absents de mon arbre local.

Rien ne les signale. `gh pr create` fabrique la PR sans un mot, et la liste
des commits ne se lit que si on pense à la regarder.

## Le parcours

### 1. Comparer AVANT d'ouvrir la PR

```bash
git fetch origin
git log --oneline HEAD..origin/staging     # ce que je n'ai pas
git log --oneline origin/main..origin/staging | wc -l   # taille réelle du lot
```

Si la première commande rend quoi que ce soit : **il y a du travail qui
n'est pas le mien dans le lot.**

### 2. Récupérer et re-vérifier l'ensemble

Ne pas se contenter de ses propres tests : on promeut un tout.

```bash
git merge --ff-only origin/staging
# puis, dans CHAQUE app touchée par les commits récupérés :
npm run typecheck        # jamais `npx tsc --noEmit` seul (tsconfig solution)
npm run build
npm test
```

⚠️ Sur la vitrine, un `npm run typecheck` peut remonter des erreurs
**périmées** issues de `.next/types/` généré avant un renommage. Relancer
`npm run build` d'abord : les types se régénèrent et les erreurs
disparaissent. Ne pas partir en chasse d'un bug qui n'existe plus.

### 3. Vérifier staging en vrai

Un typecheck vert ne prouve pas qu'un site répond. Sur des changements de
rendu ou de routage, tester **un tenant ET le fallback** :

```bash
curl -s -o /dev/null -w "%{http_code}\n" https://<club>.staging.clubflow.topdigital.re
curl -s -o /dev/null -w "%{http_code}\n" https://staging.clubflow.topdigital.re
```

### 4. Le conflit `docs/memory/INDEX.md` : régénérer, ne pas arbitrer

Deux sessions qui ajoutent chacune des pitfalls entrent forcément en
conflit sur l'INDEX, qui est **auto-généré**. Le résoudre à la main est une
perte de temps et une source d'erreur :

```bash
git merge origin/main          # conflit sur INDEX.md
bin/memory-index               # régénère à partir des fichiers réels
git add docs/memory/INDEX.md
# vérifier qu'il ne reste aucun marqueur
grep -c '<<<<<<<\|>>>>>>>' docs/memory/INDEX.md   # doit rendre 0
```

### 5. Attendre TOUS les checks, puis fusionner

```bash
gh pr checks <n> --watch
gh pr merge <n> --merge
```

## Variante : ne promouvoir QUE son correctif

Quand `origin/main..origin/staging` contient le travail non publié d'une
autre session (fonctionnalité en cours, pas encore validée par Florent),
une PR `staging → main` l'embarquerait. On ne promeut alors que son
propre commit, par une branche de correctif tirée de `main`.

```bash
git fetch origin
W="$TEMP/hotfix-<sujet>"
git worktree add -b hotfix/<sujet> "$W" origin/main
git -C "$W" cherry-pick <sha-sur-staging>
git -C "$W" push -u origin hotfix/<sujet>
gh pr create --base main --head hotfix/<sujet> --title "<type>(<scope>): ..." --body "..."
gh pr checks <n> --watch
gh pr merge <n> --merge
gh run watch <id-deploy.yml> --exit-status
gh workflow run release-please.yml --ref main   # coupe le tag
gh release list --limit 1                       # le tag doit être là
```

Puis réaligner `staging` **sans perdre le travail tiers** : pas d'avance
rapide possible (staging a des commits que main n'a pas), donc fusion de
`main` dans une copie détachée de `origin/staging`, poussée par refspec :

```bash
git -C "$W" checkout --detach origin/staging
git -C "$W" merge --no-edit origin/main
git -C "$W" diff --stat origin/staging HEAD     # ne doit montrer que CHANGELOG + manifest
```

```powershell
# PowerShell : Git Bash réécrit `HEAD:refs/heads/staging` en chemin Windows
git -C "$env:TEMP\hotfix-<sujet>" push origin HEAD:refs/heads/staging
```

Enfin : `git worktree remove`, suppression de la branche locale et
distante, smoke des 4 vhosts et de `{ __typename }` sur l'API.

Le commit cherry-pické a un autre SHA que celui de `staging` : c'est
normal, le merge de réalignement les réconcilie sans conflit puisque le
contenu est identique.

Suivi 4 fois le 2026-10-21 (v0.79.2 → v0.79.5), la fonctionnalité
kilométrique d'une session parallèle restant sur `staging`.

## La règle

**On ne promeut jamais ce qu'on n'a pas vérifié soi-même**, même quand ça
vient d'une session de confiance et que ça passe le CI. Et quand du travail
tiers se retrouve dans un lot qu'on pousse en production, **le dire
explicitement à Florent** — il doit savoir ce qui est parti, pas seulement
que « c'est déployé ».

## Rencontré

2026-07-21, promotion des lots boutique/paiement (PR #132).

## Lié

- [modif-locale-vers-prod.md](modif-locale-vers-prod.md) — le parcours
  nominal, mono-session.
- [staging-supprimee-au-merge.md](../pitfalls/staging-supprimee-au-merge.md)
- [github-token-ne-retrigger-pas.md](../pitfalls/github-token-ne-retrigger-pas.md)
  — l'étape d'après : couper le tag.
