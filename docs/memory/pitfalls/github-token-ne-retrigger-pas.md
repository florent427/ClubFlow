# Le tag de release n'est jamais coupé : GITHUB_TOKEN ne réveille aucun workflow

## Symptôme

La PR de release est créée, auto-fusionnée, le manifeste passe bien à la
version suivante — et **le tag n'existe pas**. `gh release list` reste sur
la version précédente alors que `.release-please-manifest.json` sur `main`
affiche déjà la nouvelle.

Aucun run en échec à inspecter : le run qui devait couper le tag **n'a
jamais démarré**. C'est ce qui rend le piège coûteux — on cherche une
erreur là où il n'y a qu'une absence.

```bash
git show "origin/main:.release-please-manifest.json"   # {".": "0.24.0"}
gh release list --limit 1                              # v0.23.1  ← décalage
gh run list --workflow=release-please.yml --limit 4    # aucun run sur le merge
```

## Cause

GitHub **refuse de déclencher un workflow depuis un push authentifié par
`GITHUB_TOKEN`** — c'est un garde-fou anti-boucle infinie, pas un bug.

Or release-please fonctionne en deux temps :

1. un run ouvre la PR de release (« chore(main): release X.Y.Z ») ;
2. un run **postérieur au merge** lit le manifeste et publie le tag.

Quand l'étape 1 auto-fusionne la PR avec `GITHUB_TOKEN`, le push du merge
ne réveille personne. L'étape 2 n'arrive jamais. Le cycle se mord la queue
précisément parce qu'il est automatisé de bout en bout.

## Solution

Relancer le workflow **à la main** : la PR étant déjà fusionnée, le run
n'a plus qu'à publier.

```bash
gh workflow run release-please.yml --ref main
```

C'est la raison d'être du `workflow_dispatch` sur ce workflow — sans lui,
le seul recours serait un commit vide sur `main` pour provoquer un push.
Ne pas le retirer en croyant simplifier (cf.
[release-please-no-trigger.md](release-please-no-trigger.md)).

### Combien de lancements ? Une seule passe suffit en général

⚠️ **Ne pas annoncer deux lancements par réflexe.** Le nombre dépend de
l'état au moment où on lance :

- **Aucune PR de release ouverte** (cas courant après une promotion) → un
  seul `workflow run` suffit : il ouvre la PR, l'auto-merge la fusionne, et
  le tag est coupé dans la foulée. La chaîne n'est pas coupée puisque c'est
  le dispatch manuel qui la porte.
- **PR de release déjà fusionnée sans tag** (le symptôme décrit plus haut)
  → un lancement, qui ne fait que publier.

Vérifier l'état plutôt que supposer :

```bash
gh release list --limit 1
git show "origin/main:.release-please-manifest.json"
gh pr list --state open --search "chore(main): release"
```

Puis contrôler le résultat — si le manifeste et la dernière release
concordent, c'est fini, inutile de relancer.

Constaté le 2026-07-21 (v0.31.0) : une seule passe, alors que j'avais
annoncé deux à Florent.

**Correctif de fond** si le manuel devient pénible : auto-fusionner avec
un PAT ou un GitHub App token au lieu de `GITHUB_TOKEN`. Un push signé par
l'un de ces deux-là déclenche bien les workflows.

## Le tag `v0.24.0` ne redéclenche pas non plus le déploiement

Même cause, deuxième symptôme : le tag est créé par le token de l'action,
donc `deploy.yml` ne part pas dessus.

Sans conséquence en pratique ici : le déploiement a déjà eu lieu sur le
**merge de la PR de contenu**, qui porte tout le code. Le commit de
release ne contient que `CHANGELOG.md` et le manifeste. Vérifier plutôt
que se fier au workflow :

```bash
"/c/Windows/System32/OpenSSH/ssh.exe" clubflow@89.167.79.253 \
  "git -C ~/clubflow log --oneline -1"
```

⚠️ Le dépôt est dans `~/clubflow` (minuscules), pas `~/ClubFlow`.

## Rencontré

2026-07-19, promotion des 11 commits boutique/média. Le run précédent
avait par ailleurs échoué sur `Duplicate release tag: v0.23.1` — fausse
piste : il s'était corrigé seul en reposant l'étiquette `autorelease:
tagged`, et n'a rien à voir avec le tag manquant.

## Lié

- [release-please-no-trigger.md](release-please-no-trigger.md)
- [ADR-0005 — auto-merge des PR de release](../decisions/0005-release-please-auto-merge.md)
- [runbooks/release.md](../../runbooks/release.md)
