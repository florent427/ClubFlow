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
   - Pose le statut `ci-ok` sur sa tête (cf. « Checks obligatoires »)
   - AUTO-MERGE squash via API REST

3. ⚠️ Le merge ne crée RIEN tout seul. Le push d'auto-merge est signé par
   GITHUB_TOKEN, qui ne réveille aucun workflow (garde-fou anti-boucle).
   Le tag n'arrive QUE si on relance la main :

       gh workflow run release-please.yml --ref main

   Ce lancement publie le tag vX.Y.Z et la GitHub Release.
   Ce n'est pas un rattrapage exceptionnel : ça arrive à CHAQUE
   promotion (cf. pitfalls/github-token-ne-retrigger-pas.md).

4. deploy.yml ne repart pas non plus sur le tag — même cause.
   Sans conséquence : le déploiement a déjà eu lieu au merge de la PR de
   contenu. Le commit de release ne porte que CHANGELOG.md + manifeste.
```

**Contrôle après le dispatch** — le manifeste et la dernière release
doivent concorder :

```bash
gh release list --limit 1
git show "origin/main:.release-please-manifest.json"
```

## Checks obligatoires sur main (`ci-ok`)

> **Vérifier l'état avant de s'y fier** : le ruleset n'existe que sur GitHub
> (créé au pas 3 de la bascule ci-dessous, mis en place le 2026-10-22).
>
> ```bash
> gh api repos/florent427/ClubFlow/rulesets --jq '.[] | "\(.id) \(.name) \(.enforcement)"'
> ```
>
> Sans ruleset `main-ci-ok` actif, main n'exige aucun check et
> `gh pr merge --auto` est refusé (« unstable status »,
> cf. `pitfalls/auto-merge-clean-status.md`).

### Principe

main exige **un seul** check : `ci-ok`. Il a deux sources possibles.

| PR | Qui pose `ci-ok` | Comment |
|---|---|---|
| Toute PR ouverte par un humain (staging→main, hotfix, doc) | `ci.yml`, job `ci-ok` | check run, après typecheck/tests/validate-memory |
| PR de release de release-please | `release-please.yml` | statut de commit posé par l'API juste avant le merge |

- `ci.yml` tourne sur **toutes** les PR, sans filtre `paths`. Le job
  `changes` (dorny/paths-filter, épinglé par SHA) dit si le diff touche
  `apps/**` ou la doc. `typecheck.yml`, `tests.yml` et `validate-memory.yml`
  sont appelés comme workflows réutilisables (`workflow_call`) seulement si
  c'est le cas. Leur déclencheur `pull_request` est supprimé, sinon ils
  tourneraient deux fois. Leurs déclencheurs `push` restent.
- `ci-ok` tourne toujours (`if: always()`). Il échoue si une vérification est
  en `failure` ou `cancelled`. Une vérification sautée faute de fichiers
  concernés compte comme réussie. Une PR qui ne touche que la doc reçoit donc
  `ci-ok` vert en quelques secondes.
- La PR de release est ouverte par `GITHUB_TOKEN` : aucun workflow n'y tourne
  (cf. `pitfalls/github-token-ne-retrigger-pas.md`). `release-please.yml` pose
  lui-même le statut `ci-ok` (permission `statuses: write`) sur la tête de la
  PR, puis fusionne avec `sha=<tête>`. Le commit de release ne touche que
  `CHANGELOG.md` et le manifeste.
- Le ruleset accepte `ci-ok` de **n'importe quelle source** (pas
  d'`integration_id`). Exiger GitHub Actions (15368) ne marcherait pas pour la
  PR de release si GitHub attribue le statut à une autre source, et
  n'apporte rien sur un dépôt personnel où seuls Florent et Actions écrivent.
- Florent (rôle admin, `RepositoryRole` 5) est en contournement `always`.
  Attention : un merge par l'API (`gh api -X PUT .../merge`) ou par
  `gh pr merge --admin` fait par Florent passe donc **même si `ci-ok` est
  rouge ou en cours**. C'est voulu (urgence). Pour une promotion normale,
  utiliser `gh pr merge <n> --merge --auto`.
- Pas de `strict_required_status_checks_policy` : une PR n'a pas à être à
  jour avec main pour fusionner. La PR de release et la PR staging→main se
  croisent, l'option les bloquerait l'une l'autre.

Fichiers : `.github/workflows/ci.yml`, `.github/workflows/release-please.yml`,
`.github/rulesets/main-ci-ok.json`.

### Bascule pas à pas

L'ordre compte : **workflows d'abord, ruleset ensuite**. Un ruleset posé
avant que `ci-ok` existe bloquerait toutes les PR, release comprise.

1. **Fusionner les workflows sur main**, par une promotion normale (staging
   puis PR staging→main en `--merge`, cf. promotion). Sur cette PR,
   `ci-ok` doit déjà apparaître (le `pull_request` de `ci.yml` lit le
   workflow de la branche de tête). Vérifier :

   ```bash
   gh pr checks <n> | grep ci-ok
   ```

2. **Vérifier que la PR de release a reçu le statut.** Le run
   `release-please` du push sur main pose `ci-ok` puis fusionne :

   ```bash
   gh run list --workflow release-please.yml --limit 2
   gh api "repos/florent427/ClubFlow/commits/<sha tête PR release>/statuses" --jq '.[] | .context+" "+.state'
   ```

   Puis le dispatch habituel pour couper le tag.

3. **Créer le ruleset** (seulement si 1 et 2 sont verts) :

   ```bash
   gh api -X POST repos/florent427/ClubFlow/rulesets --input .github/rulesets/main-ci-ok.json --jq '.id'
   ```

   Noter l'id renvoyé. Contrôle :

   ```bash
   gh api repos/florent427/ClubFlow/rules/branches/main
   ```

4. **Test sur une PR factice qui ne touche que la doc** (voir ci-dessous).
5. **Test réel à la promotion suivante** : `gh pr merge <n> --merge --auto`
   doit être accepté, puis la PR doit se fusionner seule quand `ci-ok` passe
   au vert ; la PR de release doit se fusionner seule ensuite.

### Test sur une PR factice

```bash
git fetch origin
git switch -c ci/test-ci-ok origin/main
# une ligne dans un fichier docs/runbooks/*.md, sans toucher apps/**
git commit -am "docs(ci): PR factice pour tester ci-ok"
git push -u origin ci/test-ci-ok
gh pr create --base main --head ci/test-ci-ok --title "test: ci-ok (ne pas fusionner)" --body "PR factice"
gh pr checks <n> --watch
```

Attendu :

- `changes` et `validate-memory` passent ; `typecheck` et `tests` sont
  sautés ; `ci-ok` est vert.
- `gh api repos/florent427/ClubFlow/commits/<sha tête>/check-runs --jq '.check_runs[] | .name+" "+.conclusion'`
  montre `ci-ok success`, et `typecheck` et `tests` en `skipped`.

Chemin rouge, qui teste aussi l'auto-merge sans risque de fusion : pousser
sur la même branche une erreur de type dans `apps/api`, puis tout de suite
`gh pr merge <n> --auto --merge`. Attendu : la commande est acceptée (sans
ruleset, elle était refusée), `typecheck (api)` échoue, `ci-ok` échoue, et la
PR reste ouverte. Ne pas faire le test d'auto-merge sur la version verte :
`ci-ok` y passe en moins d'une minute et la PR factice serait fusionnée.

Fermer ensuite la PR sans la fusionner et supprimer la branche :

```bash
gh pr close <n> --delete-branch
```

### Passer outre (Florent)

- **Une PR précise** : `gh pr merge <n> --merge --admin` (ou le bouton
  « Merge without waiting for requirements » dans l'interface).
- **Tout suspendre** (ex. GitHub Actions en panne) :

  ```bash
  gh api -X PUT repos/florent427/ClubFlow/rulesets/<id> -f enforcement=disabled
  ```

  Remettre `enforcement=active` ensuite.

### Si la PR de release reste ouverte

Symptôme : run `release-please` rouge au pas « Auto-merge release PR », avec
un 405 « Required status check "ci-ok" is expected » ou « Head branch was
modified ». Diagnostic, puis rattrapage par Florent :

```bash
gh pr list --label "autorelease: pending"
gh api "repos/florent427/ClubFlow/commits/<sha tête>/statuses" --jq '.[] | .context+" "+.state'
gh pr merge <n> --squash --admin
gh workflow run release-please.yml --ref main
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
