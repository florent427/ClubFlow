# Piège — release-please ne se déclenche pas (pas de `workflow_dispatch`)

## Symptôme

Tu push un commit `feat:` sur main → tu attends la PR de release →
**rien** dans `gh pr list`. Et tu ne peux pas non plus lancer manuellement
le workflow.

## Contexte

Premier setup release-please.yml :

```yaml
on:
  push:
    branches: [main]
```

→ S'auto-déclenche sur push, OK. Mais **impossible** à déclencher
manuellement (`gh workflow run release-please.yml` → "Workflow does not
have 'workflow_dispatch' trigger").

Or pendant le debug du pipeline (config foireuse, perms manquantes), on
veut pouvoir re-lancer le workflow **sans pusher un commit bidon**.

## Solution

Ajouter `workflow_dispatch` au trigger :

```yaml
on:
  push:
    branches: [main]
  workflow_dispatch:
```

Puis :

```bash
gh workflow run release-please.yml
gh run watch
```

→ release-please tourne à la demande. Si rien à release, log "no release",
sinon ouvre/met à jour la PR.

## Pourquoi ça marche

`workflow_dispatch` permet à GitHub de proposer le workflow dans l'UI
Actions (bouton "Run workflow") et via `gh workflow run`.

C'est une bonne pratique de **toujours** ajouter `workflow_dispatch` sur
les workflows critiques, en plus du trigger automatique. Coût : 0,
bénéfice : on peut toujours débloquer.

## Idem pour `deploy.yml`

```yaml
on:
  push:
    branches: [main]
    tags: ['v*']
  workflow_dispatch:
    inputs:
      tag:
        description: "Tag/branch à déployer (ex: main, v0.2.0)"
        required: false
        default: 'main'
```

→ Permet `gh workflow run deploy.yml -f tag=v0.1.0` pour redéployer
une version précise.

## Lié

- [runbooks/release.md](../../runbooks/release.md)
- [runbooks/deploy.md](../../runbooks/deploy.md)
