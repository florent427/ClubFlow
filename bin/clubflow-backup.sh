#!/bin/bash
#
# clubflow-backup.sh v2 — version étendue
#
# Backup quotidien :
#  1. PostgreSQL (dump + gzip)
#  2. Uploads médias (`apps/api/uploads/`) — incrémental rclone
#  3. Caddy autosave config (`/var/lib/caddy/.config/caddy/autosave.json`)
#
# À installer côté serveur via :
#   sudo cp bin/clubflow-backup.sh /usr/local/bin/clubflow-backup.sh
#   sudo chmod +x /usr/local/bin/clubflow-backup.sh
#
# Lancé via cron : /etc/cron.d/clubflow-backup → 0 3 * * * root /usr/local/bin/clubflow-backup.sh
#
# Pré-requis :
#  - rclone configuré avec remote `hetzner-sb` pointant sur le subaccount Storage Box
#  - PostgreSQL accessible via `sudo -u postgres pg_dump`
#  - Caddy tourne et a écrit /var/lib/caddy/.config/caddy/autosave.json

set -euo pipefail
exec > >(tee -a /var/log/clubflow-backup.log) 2>&1

DATE_TAG=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR=/var/backups/clubflow
RCLONE_REMOTE=hetzner-sb

# Si lancé via cron en root (legacy), force la config rclone du user `clubflow`
# (cf. pitfall rclone-config-root-vs-user.md). Si déjà clubflow, c'est no-op.
export RCLONE_CONFIG="${RCLONE_CONFIG:-/home/clubflow/.config/rclone/rclone.conf}"

mkdir -p "$BACKUP_DIR"

logger -t clubflow-backup "🚀 Backup started ($DATE_TAG)"
echo ""
echo "============================================================"
echo "🚀 Backup ClubFlow $DATE_TAG"
echo "============================================================"

# ============================================================
# 1. PostgreSQL
# ============================================================
echo ""
echo "=== 1. PostgreSQL dump ==="
PG_FILE="$BACKUP_DIR/clubflow_${DATE_TAG}.sql.gz"
sudo -u postgres pg_dump -Fc clubflow | gzip -9 > "$PG_FILE"
PG_SIZE=$(du -h "$PG_FILE" | cut -f1)
echo "  → $PG_FILE ($PG_SIZE)"

# Push vers Storage Box
echo "  → rclone copy postgres/"
rclone copy "$PG_FILE" "$RCLONE_REMOTE:postgres/" --quiet

# Rotation locale (garde 7 jours)
find "$BACKUP_DIR" -name 'clubflow_*.sql.gz' -mtime +7 -delete
# Rotation distante (garde 30 jours)
rclone delete "$RCLONE_REMOTE:postgres/" --min-age 30d --quiet || true

# ============================================================
# 2. Uploads médias (incrémental)
# ============================================================
echo ""
echo "=== 2. Uploads médias (rclone sync incremental) ==="
UPLOADS_DIR=/home/clubflow/clubflow/apps/api/uploads
if [ -d "$UPLOADS_DIR" ]; then
  UPLOADS_SIZE=$(du -sh "$UPLOADS_DIR" 2>/dev/null | cut -f1)
  echo "  → src: $UPLOADS_DIR ($UPLOADS_SIZE)"
  # rclone sync : copie les nouveaux/modifiés, supprime les fichiers absents
  # côté local. Conservation des suppressions = pas de purge auto distante.
  rclone copy "$UPLOADS_DIR" "$RCLONE_REMOTE:uploads/" \
    --quiet --transfers 4 --checkers 8
  echo "  → ✅ uploads sync OK"
else
  echo "  ⚠️ $UPLOADS_DIR n'existe pas (skip)"
fi

# ============================================================
# 3. Caddy autosave config
# ============================================================
echo ""
echo "=== 3. Caddy autosave config ==="
CADDY_AUTOSAVE=/var/lib/caddy/.config/caddy/autosave.json
if [ -f "$CADDY_AUTOSAVE" ]; then
  CADDY_BACKUP="$BACKUP_DIR/caddy-autosave-${DATE_TAG}.json"
  sudo cp "$CADDY_AUTOSAVE" "$CADDY_BACKUP"
  CADDY_SIZE=$(du -h "$CADDY_BACKUP" | cut -f1)
  echo "  → $CADDY_BACKUP ($CADDY_SIZE)"
  rclone copy "$CADDY_BACKUP" "$RCLONE_REMOTE:caddy/" --quiet
  # Rotation locale (garde 14 jours)
  find "$BACKUP_DIR" -name 'caddy-autosave-*.json' -mtime +14 -delete
  # Rotation distante (garde 30 jours)
  rclone delete "$RCLONE_REMOTE:caddy/" --min-age 30d --quiet || true
else
  echo "  ⚠️ $CADDY_AUTOSAVE n'existe pas (Caddy admin API peut-être pas active — cf. ADR-0007)"
fi

# ============================================================
# Récap
# ============================================================
echo ""
echo "=== Récap ==="
echo "  Local : $(ls -lah $BACKUP_DIR | grep -E '\.(sql\.gz|json)$' | wc -l) fichier(s)"
echo "  Remote postgres : $(rclone size --json $RCLONE_REMOTE:postgres/ 2>/dev/null | jq -r '.bytes // 0' | numfmt --to=iec) octets"
echo "  Remote uploads  : $(rclone size --json $RCLONE_REMOTE:uploads/ 2>/dev/null | jq -r '.bytes // 0' | numfmt --to=iec) octets"
echo "  Remote caddy    : $(rclone size --json $RCLONE_REMOTE:caddy/ 2>/dev/null | jq -r '.bytes // 0' | numfmt --to=iec) octets"
echo ""
echo "✅ Backup OK at $(date '+%F %T')"

logger -t clubflow-backup "✅ Backup OK ($DATE_TAG)"
