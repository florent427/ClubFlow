# Runbook — Reset baseline migrations Prisma (sortie du workaround `db push`)

> Référencé par [ADR-0003 Prisma db push](../memory/decisions/0003-prisma-db-push.md)
> et [pitfall prisma-migration-order-broken](../memory/pitfalls/prisma-migration-order-broken.md).

## Quand l'utiliser

**1×, quand on est prêt à sortir du workaround `prisma db push`** et basculer
définitivement sur le pipeline `prisma migrate deploy` standard.

⚠️ **Action sensible côté prod** — touche l'historique des migrations et
la table `_prisma_migrations`. À planifier hors heures de pointe + backup
DB juste avant.

## Pré-requis

- Backup DB prod **fait dans la dernière heure** :
  ```bash
  ssh-into-prod "sudo /usr/local/bin/clubflow-backup.sh"
  ```
  → vérifier `ls -lah /var/backups/clubflow/clubflow_*.sql.gz | tail -1`
- Plan de rollback testé en local sur un dump récent
- Maintenance window communiquée si > 1 club actif

## Procédure

### Étape 1 — Snapshot du schema actuel en local

```bash
# Sur ton laptop, à partir d'une DB prod miroir (clone ou backup restauré)
pg_dump -s -h localhost -U clubflow clubflow > /tmp/schema-baseline-$(date +%Y%m%d).sql
```

Si tu n'as pas de miroir, dump via SSH :

```bash
ssh-into-prod 'sudo -u postgres pg_dump -s clubflow' > /tmp/schema-prod-snapshot.sql
```

### Étape 2 — Créer le dossier de migration baseline

```bash
TIMESTAMP=$(date +%Y%m%d%H%M%S)
mkdir -p apps/api/prisma/migrations/${TIMESTAMP}_baseline_2026_05/
cp /tmp/schema-prod-snapshot.sql apps/api/prisma/migrations/${TIMESTAMP}_baseline_2026_05/migration.sql
```

⚠️ **Cleaner le SQL avant commit** :
- Retirer les `SET` PostgreSQL inutiles (search_path, statement_timeout, etc.)
- Retirer le `COMMENT ON SCHEMA public IS 'standard public schema';` si présent
- Vérifier que toutes les `CREATE TABLE`, `CREATE TYPE` ENUM, `CREATE INDEX`,
  `ALTER TABLE ADD CONSTRAINT FOREIGN KEY` sont bien là
- Garder uniquement le DDL (pas de DML, pas de COPY)

### Étape 3 — Supprimer les anciennes migrations cassées du repo

```bash
ls apps/api/prisma/migrations/ | grep -v migration_lock.toml | grep -v baseline_2026_05
# Supprimer toutes les autres :
cd apps/api/prisma/migrations
for f in $(ls | grep -v migration_lock.toml | grep -v baseline_2026_05); do
  rm -rf "$f"
done
```

### Étape 4 — Marquer la baseline comme appliquée sur prod

⚠️ **CRITIQUE** : sans ça, Prisma va tenter de re-jouer la baseline → erreur
"already exists" partout.

```bash
ssh-into-prod 'cd /home/clubflow/clubflow/apps/api && \
  sudo -u clubflow npx prisma migrate resolve \
  --applied <TIMESTAMP>_baseline_2026_05'
```

(Replacer `<TIMESTAMP>` par la valeur exacte du dossier.)

### Étape 5 — Vérifier l'état

```bash
ssh-into-prod 'sudo -u postgres psql clubflow -c "SELECT migration_name, finished_at FROM _prisma_migrations ORDER BY started_at;"'
```

→ Doit afficher 1 seule ligne : `<TIMESTAMP>_baseline_2026_05` avec `finished_at` non null.

### Étape 6 — Switch deploy script vers `migrate deploy`

Sur le serveur, éditer `/usr/local/bin/clubflow-deploy.sh` Phase 2 :

```bash
# Avant :
sudo -u clubflow npx prisma db push --skip-generate

# Après :
sudo -u clubflow npx prisma migrate deploy
```

Optionnel : mettre à jour `apps/api/package.json` `scripts.start:prod` si
référence à `db push`.

### Étape 7 — Test : créer une nouvelle migration

```bash
# En local (DB dev), modifier prisma/schema.prisma puis :
cd apps/api
npx prisma migrate dev --name test_after_baseline

# Vérifier que la migration s'ajoute proprement à côté de la baseline :
ls prisma/migrations/
# → <TIMESTAMP>_baseline_2026_05/
# → <TIMESTAMP+1>_test_after_baseline/

# Push sur main → deploy.yml lance migrate deploy → applique la nouvelle migration
```

### Étape 8 — Commit + PR

```bash
git checkout -b chore/prisma-migrations-baseline
git add apps/api/prisma/migrations/
git commit -m "chore(api): reset historique Prisma migrations à une baseline propre

- Snapshot du schema prod actuel → 1 seule migration baseline
- Suppression des 17 migrations historiques cassées (ordre timestamp incohérent)
- Switch deploy : migrate deploy au lieu de db push (cf. ADR-0003)
- _prisma_migrations en prod marqué applied via 'prisma migrate resolve'
"
gh pr create --title "chore(api): reset Prisma migrations à une baseline propre"
```

### Étape 9 — Mettre à jour la doc

- `ADR-0003-prisma-db-push.md` : ajouter section "Résolu par baseline 2026-XX-XX"
- `pitfalls/prisma-migration-order-broken.md` : marquer RÉSOLU
- Update CLAUDE.md §15 si mentionne db push

## Rollback en cas de problème

Si `prisma migrate deploy` plante après le switch :

```bash
# 1. Revert le deploy script
ssh-into-prod 'sudo cp /usr/local/bin/clubflow-deploy.sh.bak /usr/local/bin/clubflow-deploy.sh'

# 2. Restore la DB depuis le backup pré-procédure
gunzip -c /var/backups/clubflow/clubflow_<DATE>.sql.gz | sudo -u postgres psql clubflow

# 3. Investiguer la cause (souvent : SQL baseline pas idempotent)
```

## Vérification end-to-end après baseline

```bash
# Smoke prod
for h in clubflow.topdigital.re app.clubflow.topdigital.re portail.clubflow.topdigital.re sksr.re; do
  echo "$(curl -s -o /dev/null -w '%{http_code}' https://$h/) $h"
done

# Vérif migrations appliquées
ssh-into-prod 'sudo -u postgres psql clubflow -c "SELECT count(*) FROM _prisma_migrations WHERE finished_at IS NOT NULL;"'
# → 1 (ou plus si tu as déjà fait migrate deploy d'une nouvelle migration)
```

## Estimation

- Préparation locale : ~1h (dump + clean SQL + créer dossier)
- Action prod : ~10 min (migrate resolve + restart deploy script)
- Test : ~30 min (créer une migration test, deploy, smoke)
- **Total : ~2h** sur 1 maintenance window planifiée

## Lié

- [ADR-0003 Prisma db push](../memory/decisions/0003-prisma-db-push.md)
- [pitfalls/prisma-migration-order-broken.md](../memory/pitfalls/prisma-migration-order-broken.md)
- [knowledge/backup-strategy.md](../knowledge/backup-strategy.md)
- Doc Prisma : https://www.prisma.io/docs/orm/prisma-migrate/workflows/baselining
