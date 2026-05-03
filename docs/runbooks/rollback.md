# Runbook — Rollback déploiement

> Référencé par `runbooks/deploy.md`. À utiliser quand un déploiement
> introduit un bug sérieux et qu'on doit revenir à la version précédente.

## Stratégie : revert via tag git, pas reset

Le déploiement utilise `git fetch + git reset --hard origin/main`.
Pour rollback : on **revert** le commit fautif sur main (qui retrigger
deploy.yml) plutôt que de reset.

## Procédure standard (commit fautif identifié)

### 1. Identifier le commit à revert

```bash
git log --oneline -10
```

Soit `ABC1234` le commit fautif.

### 2. Créer un revert + push

```bash
git checkout main
git pull
git revert ABC1234 --no-edit
git push origin main
```

→ deploy.yml retrigger automatiquement, déploie l'état "comme avant
ABC1234". Smoke test inclus.

### 3. Vérifier le déploiement

```bash
gh run watch
```

→ vert = OK, rouge = `journalctl -u clubflow-api -n 50` côté serveur.

## Procédure d'urgence (rollback immédiat sans attendre le pipeline)

Si la prod est cassée et qu'on veut **immédiatement** revenir à la version
précédente sans attendre la build/deploy GitHub Actions (~3-5 min) :

```bash
ssh-into-prod "
  set -e
  cd /home/clubflow/clubflow
  PREV_TAG=\$(git describe --tags --abbrev=0 HEAD~1)
  echo \"Rollback to \$PREV_TAG\"
  git fetch --tags origin
  git reset --hard \$PREV_TAG
  cd apps/api && npm ci && npx prisma db push --skip-generate && npm run build
  cd ../admin && npm ci && npx vite build
  cd ../member-portal && npm ci && npx vite build
  cd ../vitrine && npm ci && rm -rf .next/cache .next && npm run build
  sudo systemctl restart clubflow-api clubflow-vitrine
"
```

⚠️ **N'oublie pas** ensuite de revert sur main aussi (étapes 1-2) sinon
le prochain commit re-déploiera la version cassée.

## Cas spécial : migration Prisma fautive

Si le commit ajoute une migration et que `prisma db push` casse en prod
mais que la version précédente avait des colonnes supprimées :

1. **STOP** : ne pas rollback aveuglément, on perdra des données.
2. Restore DB depuis le dernier backup pré-déploiement :
   `runbooks/restore-db.md`
3. Puis revert le commit fautif.

⚠️ `prisma db push` est **idempotent** mais n'est **pas réversible**.
Fix la migration dans un nouveau commit + push.

## Cas spécial : `.env` modifié et oublié

Si le rollback laisse une `.env` qui ne matche plus le code (ex: variable
ajoutée puis supprimée), reconstruire la `.env` depuis
`runbooks/restore-env.md`.

## Vérification post-rollback

```bash
# Tag actuel sur le serveur
ssh-into-prod "cd /home/clubflow/clubflow && git describe --tags"

# Smoke test 4 vhosts
for h in clubflow.topdigital.re portail.clubflow.topdigital.re sksr.re; do
  echo "$(curl -s -o /dev/null -w '%{http_code}' https://$h/) $h"
done
curl -s -o /dev/null -w "%{http_code}\n" \
  -X POST https://api.clubflow.topdigital.re/graphql \
  -H 'Content-Type: application/json' \
  -H 'Origin: https://clubflow.topdigital.re' \
  -d '{"query":"{__typename}"}'
```

## Suivi

Après tout rollback :
1. Créer un issue GitHub `[POST-MORTEM] vX.Y.Z rollback`
2. Documenter dans `memory/pitfalls/` si la cause root-cause est nouvelle
3. Ajouter un test si possible pour empêcher la régression
