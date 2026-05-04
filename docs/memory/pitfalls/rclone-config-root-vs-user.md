# Piège — `rclone` config absente côté root → backups script v2 fail

## Symptôme

```
$ sudo /usr/local/bin/clubflow-backup.sh
=== 1. PostgreSQL dump ===
  → /var/backups/clubflow/clubflow_20260504_080128.sql.gz (60K)
  → rclone copy postgres/
2026/05/04 08:01:28 Failed to create file system for "hetzner-sb:postgres/":
  didn't find section in config file
```

ou

```
$ sudo rclone listremotes
NOTICE: Config file "/root/.config/rclone/rclone.conf" not found - using defaults
```

## Contexte

Le script `clubflow-backup.sh` utilise `rclone copy <FILE> hetzner-sb:postgres/`
pour pousser les backups vers le Storage Box Hetzner. Le remote
`hetzner-sb` est défini quelque part dans une config rclone.

Le script tourne via cron en tant que `root`. La config rclone par
défaut est lue depuis `~/.config/rclone/rclone.conf` du user qui exécute.

Si la config n'existe que pour le user `clubflow` (`/home/clubflow/.config/rclone/rclone.conf`),
**root ne la voit pas** → "didn't find section".

## Cause root

Sur le serveur ClubFlow, la config rclone du Storage Box a été initialement
créée par le user `clubflow` (cf. `/home/clubflow/.config/rclone/rclone.conf`,
mentionné dans `knowledge/backup-strategy.md`).

Quand on déploie le script v2 et qu'on le lance via `sudo` (donc root),
rclone cherche sa config dans `/root/.config/rclone/` qui est vide.

## Solution

3 options :

### Option A — Pointer rclone vers la config du user `clubflow`

Dans le script :

```bash
RCLONE_CONFIG=/home/clubflow/.config/rclone/rclone.conf rclone copy ...
```

Ou via env var globale (cron) :

```cron
0 3 * * * root RCLONE_CONFIG=/home/clubflow/.config/rclone/rclone.conf /usr/local/bin/clubflow-backup.sh
```

### Option B — Copier la config dans `/root/.config/rclone/`

```bash
sudo mkdir -p /root/.config/rclone/
sudo cp /home/clubflow/.config/rclone/rclone.conf /root/.config/rclone/
sudo chmod 600 /root/.config/rclone/rclone.conf
```

⚠️ Duplique le secret Storage Box → 2 endroits à roter à la rotation.

### Option C — Lancer le cron en tant que `clubflow` (préféré)

`/etc/cron.d/clubflow-backup` :

```cron
# Avant : 0 3 * * * root /usr/local/bin/clubflow-backup.sh
# Après :
0 3 * * * clubflow /usr/local/bin/clubflow-backup.sh
```

⚠️ Le user `clubflow` doit pouvoir :
- `sudo -u postgres pg_dump clubflow` (déjà OK via /etc/sudoers.d/)
- `sudo cp /var/lib/caddy/.config/caddy/autosave.json` (à ajouter dans sudoers)
- Écrire dans `/var/backups/clubflow/` (chmod 775 sur le dir + ownership clubflow)
- Écrire dans `/var/log/clubflow-backup.log` (chmod 666 ou ownership)

C'est plus propre mais demande des ajustements sudoers. **Recommandé** pour
v2+ une fois tout configuré proprement.

## Détection

Avant de déployer une nouvelle version du script :

```bash
# Test côté root
sudo rclone listremotes
# → si vide ou "Config file not found" : config absente côté root

# Test côté clubflow
sudo -u clubflow rclone listremotes
# → doit afficher "hetzner-sb:" si config présente
```

## Pour l'historique

Le script v1 (avant ce piège) marchait probablement parce que :
- soit le cron tournait en `clubflow` (pas `root`) — à vérifier dans
  `/etc/cron.d/clubflow-backup`
- soit la config était dupliquée dans `/root/.config/rclone/` mais a été
  perdue lors d'un reset ou rebuild du serveur

À la prochaine tentative de deploy v2, **vérifier d'abord la config rclone
côté root via `sudo rclone listremotes`** et choisir l'option A/B/C selon
le résultat.

## Lié

- [knowledge/backup-strategy.md](../../knowledge/backup-strategy.md)
- [bin/clubflow-backup.sh](../../../bin/clubflow-backup.sh) (script v2 à déployer)
- [pitfalls/env-production-perdus-reset-hard.md](env-production-perdus-reset-hard.md)
  (autre cas où des fichiers de config locaux disparaissent)
