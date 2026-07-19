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

## ⚠️ Le correctif n'avait jamais été appliqué — et il manquait vraiment

Ce pitfall prescrivait `workflow_dispatch` depuis sa rédaction, mais
`release-please.yml` ne l'a reçu que le **2026-07-19**. Entre-temps, la
commande de rattrapage qu'il documente échouait :

```
HTTP 422: Workflow does not have 'workflow_dispatch' trigger
```

**Un pitfall dont le correctif n'est pas appliqué ne protège de rien.** Il
donne au contraire l'illusion inverse : on se souvient d'avoir traité le
sujet. Vérifier périodiquement que les correctifs prescrits sont en place :

```bash
grep -l workflow_dispatch .github/workflows/*.yml
```

## La conséquence qui n'était pas documentée : le tag arrive un merge en retard

Le vrai coût de l'absence de `workflow_dispatch` n'est pas le confort de
debug, c'est **un décalage systématique du tag**.

La PR de release est auto-mergée avec le `GITHUB_TOKEN` (cf.
[ADR-0005](../decisions/0005-release-please-auto-merge.md)). Or GitHub ne
redéclenche **aucun** workflow sur un push signé de ce token — c'est une
protection anti-boucle. release-please ne repasse donc jamais sur son propre
merge : le tag n'est coupé qu'au **merge suivant**.

Constaté trois fois dans la même journée le 2026-07-19 : `v0.21.0`, `v0.22.0`
et `v0.23.0` ont toutes été publiées au merge d'après celui qui les avait
préparées.

Ce n'est pas grave — rien n'est perdu, le code déployé est le bon, et le tag
finit toujours par arriver. Mais ça surprend :

- après un merge, `gh release list` n'affiche PAS la version qu'on vient de
  préparer ; c'est normal, pas un échec du pipeline ;
- si l'on veut le tag tout de suite, il faut le rattrapage manuel —
  d'où l'importance du `workflow_dispatch` :

```bash
gh workflow run release-please.yml --ref main
```

## Lié

- [runbooks/release.md](../../runbooks/release.md)
- [runbooks/deploy.md](../../runbooks/deploy.md)
