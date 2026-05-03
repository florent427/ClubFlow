# Piège — Caddy 403 sur file_server depuis `/home/clubflow/`

## Symptôme

```
$ curl -s -o /dev/null -w "%{http_code}\n" https://clubflow.topdigital.re/
403
```

Logs Caddy :

```
{"level":"error","msg":"opening file","error":"open .../dist/index.html: permission denied"}
```

## Contexte

Vhost Caddy admin :

```caddy
clubflow.topdigital.re {
    root * /home/clubflow/clubflow/apps/admin/dist
    file_server
}
```

→ Caddy tourne en user `caddy`. `clubflow` est le user qui possède
les fichiers.

## Cause root

Sur Ubuntu 24.04, `/home/<user>` est créé en `drwxr-x---` par défaut.
Donc :

```
$ ls -ld /home/clubflow
drwxr-x--- 5 clubflow clubflow 4096 May  3 12:00 /home/clubflow
```

User `caddy` (qui n'est ni `clubflow` ni dans le group `clubflow`)
**ne peut pas traverser** `/home/clubflow/`. Le `file_server` essaie
d'ouvrir le fichier mais déjà le `stat()` du parent échoue → 403.

## Solution

Donner le bit `x` (traverse) à "others" sur tout le path jusqu'au
`dist/`, puis `r` (read) sur les fichiers/dirs servis :

```bash
sudo chmod o+x /home/clubflow
sudo chmod o+x /home/clubflow/clubflow
sudo chmod o+x /home/clubflow/clubflow/apps
sudo chmod o+x /home/clubflow/clubflow/apps/admin
sudo chmod o+x /home/clubflow/clubflow/apps/member-portal

sudo find /home/clubflow/clubflow/apps/admin/dist -type d -exec chmod o+rx {} \;
sudo find /home/clubflow/clubflow/apps/admin/dist -type f -exec chmod o+r {} \;

sudo find /home/clubflow/clubflow/apps/member-portal/dist -type d -exec chmod o+rx {} \;
sudo find /home/clubflow/clubflow/apps/member-portal/dist -type f -exec chmod o+r {} \;
```

## ⚠️ Refaire après chaque rebuild

`vite build` génère de nouveaux fichiers qui héritent du umask par
défaut → `chmod o+r` à appliquer **après chaque build**. Le script
`clubflow-deploy.sh` Phase 6 le fait automatiquement.

## Alternative plus propre (à considérer)

Mettre les `dist` ailleurs que dans `/home/clubflow` :
- `/var/www/clubflow/admin/`
- `/var/www/clubflow/member-portal/`

Caddy lit naturellement `/var/www/` sans bidouille de perms. Mais ça
casse la cohérence "tout dans `/home/clubflow/clubflow/`".

Plus propre encore : reverse_proxy vers un serveur Vite preview ou
`serve` au lieu de `file_server`. Out of scope MVP.

## Lié

- [knowledge/infra-prod.md](../../knowledge/infra-prod.md) §Permissions
- [runbooks/deploy.md](../../runbooks/deploy.md) Phase 6
