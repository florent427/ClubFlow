# ADR-0003 — Utiliser `prisma db push` au lieu de `migrate deploy` (temporaire)

## Statut

⚠️ **Workaround accepté** — 2026-04-30
🔄 À remplacer par migrations propres dès qu'on a un env de staging

## Contexte

Le repo a 17 migrations Prisma sur main avec un **ordre cassé** :
- `20260330070848_members_core` référence `Club` mais...
- `20260330120000_init_socle` (qui crée `Club`) vient APRÈS dans l'ordre
  lexicographique des timestamps

→ `prisma migrate deploy` fail au step 1.

Cf. [pitfalls/prisma-migration-order-broken.md](../pitfalls/prisma-migration-order-broken.md)
pour le détail.

Au moment du déploiement initial (avril 2026), pas le temps de re-baseliner
proprement → workaround.

## Décision

**Utiliser `npx prisma db push --skip-generate`** dans le script de
déploiement à la place de `prisma migrate deploy`.

```bash
# Phase 2 de clubflow-deploy.sh
cd /home/clubflow/clubflow/apps/api
npm ci
npx prisma generate
npx prisma db push --skip-generate
nest build
```

## Conséquences

### Positives
- Le déploiement **fonctionne** et est idempotent
- Pas besoin de toucher aux migrations cassées (low-risk pour l'historique)
- `db push` détecte les diff et applique en 1 commande

### Négatives
- ❌ Pas d'historique de migrations dans la table `_prisma_migrations`
- ❌ Pas de **rollback** Prisma natif
- ❌ Risque silencieux de perte de données si on enlève une colonne
  (db push affiche un warning mais on doit ajouter `--accept-data-loss`
  pour des changements destructifs)
- ❌ Pas de séparation "schema dev" vs "schema prod" : ce qui est dans
  `schema.prisma` **est** la prod après push

### Mitigations
- Backup quotidien Postgres + Storage Box (cf. `runbooks/restore-db.md`)
- Toujours faire `git diff apps/api/prisma/schema.prisma` avant deploy
- Code review attentif sur les PR qui touchent le schema

## Plan de sortie

1. **Créer un env de staging** (DB séparée, branche staging du serveur
   ou autre VPS)
2. **Snapshot le schema actuel de prod** :
   ```bash
   pg_dump -s -h localhost -U clubflow clubflow > /tmp/baseline.sql
   ```
3. **Créer une migration baseline** :
   ```bash
   mkdir apps/api/prisma/migrations/00000000000000_baseline_2026_05/
   cp /tmp/baseline.sql apps/api/prisma/migrations/00000000000000_baseline_2026_05/migration.sql
   ```
4. **Marquer comme appliquée sur prod** :
   ```bash
   npx prisma migrate resolve --applied 00000000000000_baseline_2026_05
   ```
5. **Supprimer les 17 migrations cassées du repo**
6. **Switch le déploiement** vers `prisma migrate deploy`

À planifier : Q3 2026.

## Lié

- [pitfalls/prisma-migration-order-broken.md](../pitfalls/prisma-migration-order-broken.md)
- [runbooks/deploy.md](../../runbooks/deploy.md) Phase 2
- [knowledge/stack.md](../../knowledge/stack.md)
