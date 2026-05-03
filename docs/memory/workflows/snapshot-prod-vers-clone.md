# Workflow — Cloner la prod en local pour debug

> Recopier la DB + medias de prod vers ton laptop pour reproduire un bug
> ou tester une migration sur une copie réelle.

## Quand l'utiliser

- Bug en prod impossible à reproduire en dev
- Test d'une migration risquée
- Audit de données (compta, RGPD)
- Préparer un staging propre avant un gros refactor

## ⚠️ RGPD / sécurité

La DB prod contient :
- Données personnelles de membres (noms, emails, téléphones, dates de
  naissance)
- Documents OCR (factures, attestations)
- Logs d'activité

→ Ne **JAMAIS** :
- Stocker la copie sur un cloud non chiffré (Drive, Dropbox)
- L'envoyer par email
- L'utiliser pour du dev "longue durée" (la jeter après usage)

→ **Toujours** :
- Travailler sur une DB locale isolée (`clubflow_prod_clone`)
- Anonymiser les emails si tu vas screenshooter pour des tests
- Supprimer la copie après usage : `dropdb clubflow_prod_clone`

## Phase 1 — Récupérer le dump le plus récent

```bash
# Lister les backups dispos
ssh-into-prod "ls -lah /var/backups/clubflow/" | tail -5

# Le plus récent (cron 3h Paris)
ssh-into-prod "ls -t /var/backups/clubflow/clubflow_*.sql.gz | head -1"
```

Ou prendre le tout dernier :

```bash
LATEST=$(ssh-into-prod "ls -t /var/backups/clubflow/clubflow_*.sql.gz | head -1")
echo "Latest dump: $LATEST"
```

## Phase 2 — Télécharger en local

```bash
mkdir -p ~/clubflow-clone-tmp
"/c/Windows/System32/OpenSSH/scp.exe" \
  clubflow@89.167.79.253:$LATEST \
  ~/clubflow-clone-tmp/

cd ~/clubflow-clone-tmp
ls -lah  # vérifier la taille (~50-500 MB compressé selon volume)
```

## Phase 3 — Restaurer en local (Postgres dans Docker)

⚠️ **Détruit la DB locale `clubflow` si elle existe déjà**. Faire un
dump local d'abord si elle a du contenu utile.

```bash
# Backup éventuel de la DB locale courante
docker exec -t clubflow-db pg_dump -U clubflow clubflow | gzip > ~/clubflow-local-backup-$(date +%s).sql.gz

# Drop + recréation
docker exec -i clubflow-db psql -U clubflow postgres <<SQL
DROP DATABASE IF EXISTS clubflow_prod_clone;
CREATE DATABASE clubflow_prod_clone OWNER clubflow;
SQL

# Restore
gunzip ~/clubflow-clone-tmp/clubflow_*.sql.gz
docker exec -i clubflow-db pg_restore -U clubflow -d clubflow_prod_clone < ~/clubflow-clone-tmp/clubflow_*.sql
```

## Phase 4 — Pointer l'API locale vers le clone

Dans `apps/api/.env` :

```
DATABASE_URL=postgresql://clubflow:clubflow@localhost:5432/clubflow_prod_clone
```

Restart l'API :

```bash
# Via skill /restart, ou manuel :
cd apps/api && npm run start:dev
```

Vérifier connexion :

```bash
curl -s http://localhost:3000/graphql -X POST \
  -H "Content-Type: application/json" \
  -d '{"query":"{__typename}"}'
```

## Phase 5 — (Optionnel) Récupérer les médias

Les uploads OCR / photos / logos sont dans `/home/clubflow/clubflow/apps/api/uploads/`
sur le serveur. Pas backupés actuellement (TODO cf.
`knowledge/backup-strategy.md` §Ce qui n'est pas backupé).

Pour les copier :

```bash
"/c/Windows/System32/OpenSSH/scp.exe" -r \
  clubflow@89.167.79.253:/home/clubflow/clubflow/apps/api/uploads \
  apps/api/uploads
```

⚠️ Peut peser GB → vérifier `du -sh` côté serveur d'abord :

```bash
ssh-into-prod "du -sh /home/clubflow/clubflow/apps/api/uploads"
```

## Phase 6 — Anonymiser (si nécessaire pour partage)

Pour partager des screenshots ou exporter sans données réelles :

```sql
-- Connecté à clubflow_prod_clone
UPDATE "Member" SET email = 'membre' || id || '@example.com';
UPDATE "Member" SET firstName = 'Prénom' || id, lastName = 'Nom' || id;
UPDATE "Member" SET phone = '+33600000000' WHERE phone IS NOT NULL;
UPDATE "User" SET email = 'user' || id || '@example.com';
```

⚠️ À adapter selon tes besoins. Le snippet ci-dessus est destructif.

## Phase 7 — Cleanup après usage

```bash
# Drop la DB clone
docker exec -i clubflow-db psql -U clubflow postgres -c 'DROP DATABASE clubflow_prod_clone;'

# Supprimer les fichiers temporaires
rm -rf ~/clubflow-clone-tmp
rm -rf apps/api/uploads/  # si copiés depuis prod

# Re-pointer l'API vers la DB de dev normale
# (apps/api/.env → DATABASE_URL=postgresql://.../clubflow)
```

## Lié

- [knowledge/backup-strategy.md](../../knowledge/backup-strategy.md)
- [runbooks/restore-db.md](../../runbooks/restore-db.md)
