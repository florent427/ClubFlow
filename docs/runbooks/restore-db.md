# Runbook — Restaurer un dump PostgreSQL

> Référencé par `knowledge/backup-strategy.md`. ⚠️ **DESTRUCTIF** :
> détruit la DB courante et la remplace par le dump choisi.

## Quand l'utiliser

- Corruption DB (rare avec PG 16 mais possible)
- Mauvaise migration à rollback
- Test de restore (à faire 1x/trimestre minimum)
- Reprise après incident serveur

## Procédure complète

### 1. Lister les dumps disponibles

```bash
# Locaux (7 derniers)
ssh-into-prod "ls -lah /var/backups/clubflow/"

# Distants (30 derniers, sur Storage Box)
ssh-into-prod "rclone ls hetzner-sb:postgres/ | sort"
```

### 2. Récupérer le dump cible

**Si déjà présent localement** (cas nominal — dernier dump du jour) :

```bash
DUMP=/var/backups/clubflow/clubflow_20260503_030000.sql.gz
```

**Si à récupérer depuis Storage Box** :

```bash
ssh-into-prod "rclone copy hetzner-sb:postgres/clubflow_20260503_030000.sql.gz /tmp/"
DUMP=/tmp/clubflow_20260503_030000.sql.gz
```

### 3. Stopper l'API (sinon connexions ouvertes empêchent le DROP DB)

```bash
ssh-into-prod "sudo systemctl stop clubflow-api"
```

### 4. Restore

⚠️ **Étape destructive** — toute donnée non sauvée dans le dump est perdue.

```bash
ssh-into-prod "
  set -e
  gunzip -k $DUMP
  DUMP_SQL=\${DUMP%.gz}

  sudo -u postgres dropdb --if-exists clubflow
  sudo -u postgres createdb -O clubflow clubflow
  sudo -u postgres pg_restore --no-owner --role=clubflow -d clubflow \$DUMP_SQL

  rm -f \$DUMP_SQL
"
```

### 5. Re-démarrer l'API

```bash
ssh-into-prod "sudo systemctl start clubflow-api"
sleep 5
ssh-into-prod "sudo systemctl status clubflow-api --no-pager | head -5"
```

### 6. Smoke test

```bash
curl -s -X POST https://api.clubflow.topdigital.re/graphql \
  -H 'Content-Type: application/json' \
  -H 'Origin: https://clubflow.topdigital.re' \
  -d '{"query":"{__typename}"}'
```

→ `{"data":{"__typename":"Query"}}` attendu.

### 7. Vérification métier

Login admin web → vérifier que les membres apparaissent, les fiches sont
accessibles, le compte admin fonctionne. Si problème, **immédiat** :
re-restore depuis un dump précédent.

## Test de restore (à faire trimestriellement)

Sur un environnement de staging (à créer) ou en clonant la DB sous un
nom temporaire :

```bash
ssh-into-prod "
  gunzip -k $DUMP
  sudo -u postgres createdb -O clubflow clubflow_test_restore
  sudo -u postgres pg_restore --no-owner --role=clubflow -d clubflow_test_restore \${DUMP%.gz}
  sudo -u postgres psql clubflow_test_restore -c '\dt' | head -20
  sudo -u postgres dropdb clubflow_test_restore
"
```

Si les tables apparaissent → backup OK. À planifier dans cron ou tâche
manuelle calendaire.

## Cas particuliers

### Restore partiel (1 table)

```bash
gunzip dump.sql.gz
pg_restore -l dump.sql > toc.txt
# Éditer toc.txt pour ne garder que les lignes voulues
pg_restore -L toc.txt -d clubflow dump.sql
```

### Restore vers une autre DB pour comparer

```bash
sudo -u postgres createdb -O clubflow clubflow_compare
sudo -u postgres pg_restore -d clubflow_compare $DUMP_SQL
sudo -u postgres psql clubflow_compare -c "SELECT count(*) FROM \"Member\";"
```

## Reset point (RPO/RTO)

- **RPO actuel** : 24h (1 backup/jour à 3h Paris)
- **RTO observé** : ~5 min (dump compressé ~500 MB estimé à terme)
- Voir `knowledge/backup-strategy.md` pour les évolutions possibles.
