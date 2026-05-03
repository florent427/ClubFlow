# Stratégie de backup ClubFlow

## Postgres — backups quotidiens

**Script** : `/usr/local/bin/clubflow-backup.sh` (sur le serveur)
**Cron** : `/etc/cron.d/clubflow-backup` — exécuté chaque nuit à **3h Paris**.

### Workflow

1. `pg_dump -Fc clubflow | gzip -9` → `/var/backups/clubflow/clubflow_<DATE>.sql.gz`
2. `rclone copy` (en tant que clubflow) → `hetzner-sb:postgres/`
3. Rotation locale : garde 7 jours
4. Rotation distante : garde 30 jours
5. Logs via `logger -t clubflow-backup` (visibles dans `journalctl -t clubflow-backup`)

### Cron file

```cron
0 3 * * * root /usr/local/bin/clubflow-backup.sh >> /var/log/clubflow-backup.log 2>&1
```

### Stockage distant

- **Hetzner Storage Box BX11** (1 TB)
- Subaccount `u587664-sub1` chrooté `/backups/`
- Auth : password (cf. `auth-secrets.md`)
- Config rclone : `/home/clubflow/.config/rclone/rclone.conf`

### Lancer un backup à la main

```bash
"/c/Windows/System32/OpenSSH/ssh.exe" clubflow@89.167.79.253 \
  "sudo /usr/local/bin/clubflow-backup.sh"
```

### Vérifier les backups distants

```bash
"/c/Windows/System32/OpenSSH/ssh.exe" clubflow@89.167.79.253 \
  "rclone ls hetzner-sb:postgres/ | tail -10"
```

## Restauration

Cf. `runbooks/restore-db.md` pour la procédure complète.

## Ce qui N'EST PAS backupé (à régulariser)

- ❌ `apps/api/uploads/` (médias OCR, photos articles, logos)
  → à ajouter dans le script (rclone copy /home/clubflow/clubflow/apps/api/uploads
  vers hetzner-sb:uploads/)
- ❌ Configs serveur (`/etc/caddy/`, `/etc/postgresql/`, `/etc/systemd/system/clubflow-*`)
  → à backuper occasionnellement à la main ou via Ansible

## Point de récupération (RPO)

- **24h** (un backup par jour)
- Pour passer à 1h : ajouter un cron `0 * * * *` ou utiliser WAL archiving
  Postgres (out of scope MVP)

## Temps de récupération (RTO)

- ~5 min : reset DB + restore dump compressé (~500 MB compressé estimé à terme)
- Tester périodiquement via `runbooks/restore-db.md`
