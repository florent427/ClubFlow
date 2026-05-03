# Piège — `.env.production` perdus après `git reset --hard`

## Symptôme

```
$ curl https://sksr.re/
Internal Server Error
$ ssh-into-prod "sudo journalctl -u clubflow-vitrine -n 20"
Error: VITRINE_API_URL manquant
```

## Contexte

Pour créer un snapshot git sur le serveur (afin de versionner ce qui
tourne en prod), Claude a fait :

```bash
ssh-into-prod "cd /home/clubflow/clubflow && \
  git init && \
  git remote add origin https://github.com/florent427/ClubFlow.git && \
  git fetch && \
  git checkout --orphan prod-snapshot && \
  git add -A"
```

Puis pour aligner sur main :

```bash
git fetch origin main && git reset --hard origin/main
```

## Cause root

`git reset --hard` ramène l'arbre de travail à l'état d'origin/main.
Or `origin/main` **NE CONTIENT PAS** les fichiers `.env.production`
(ils sont gitignored). Donc ils sont **purement et simplement supprimés**
du disque.

## Conséquence en prod

- API démarre quand même (lit `apps/api/.env`, qui n'a pas le suffixe
  `.production`)
- Vitrine Next.js plante au boot : `VITRINE_API_URL` undefined
  → API call SSR échoue → 500
- Admin / Portail : déjà buildés avec ces vars dans le bundle JS, donc
  encore fonctionnels jusqu'au prochain rebuild → puis cassent

## Solution immédiate

Reconstruire les `.env.production` : voir
[runbooks/restore-env.md](../../runbooks/restore-env.md).

## Prévention long terme

### Option 1 : ne JAMAIS faire `git reset --hard` sur le serveur

Le déploiement `clubflow-deploy.sh` v2 utilise `git fetch + git reset --hard`
mais c'est dans un contexte où :
- les `.env*` sont gitignored
- le **Phase 0 pre-check** vérifie leur présence avant tout `reset`
- exit code != 0 si manquants → script s'arrête sans casser

### Option 2 : sauvegarder les `.env*` ailleurs

Idée : backup chiffré des `.env*` sur Storage Box, restaurable en
1 commande. À implémenter (TODO).

### Option 3 : utiliser un secret manager (Vault, Doppler)

Out of scope MVP, mais à considérer si on multiplie les apps.

## Ce qu'on a appris

1. `git add -A` sur le serveur **embarque les `.env*`** dans le snapshot
   local (puisqu'aucun `.gitignore` n'existait au moment du `git init`).
   Ne JAMAIS faire ça.
2. **Toujours** faire `cp apps/*/.env* /tmp/` AVANT toute manipulation
   git destructive sur le serveur.
3. Documenter explicitement les `.env*` requis dans le runbook deploy
   pour qu'on puisse les régénérer en 5 minutes en cas de perte.

## Lié

- [runbooks/restore-env.md](../../runbooks/restore-env.md)
- [runbooks/deploy.md](../../runbooks/deploy.md) Phase 0
- [knowledge/auth-secrets.md](../../knowledge/auth-secrets.md)
