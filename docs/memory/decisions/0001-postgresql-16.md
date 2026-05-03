# ADR-0001 — PostgreSQL 16 (pas 15, pas 17)

## Statut

✅ **Accepté** — 2026-04-15
🔒 **Verrouillé** jusqu'à au moins 2027

## Contexte

Au moment du choix (avril 2026) :
- **PG 14** : EOL nov 2026, déjà ancien
- **PG 15** : LTS jusqu'à nov 2027
- **PG 16** : LTS jusqu'à nov 2028, sortie sept 2023, **stable**
- **PG 17** : sortie sept 2024, encore "fresh", quelques bugs reportés
  sur certains workloads

Besoins ClubFlow :
- ACID strict (compta, RGPD)
- JSON support (settings clubs, audit logs)
- Full-text search FR (recherche membres)
- Backup binaire fiable (`pg_dump -Fc` + WAL si besoin futur)

## Décision

**PostgreSQL 16.x** (au moment du provisioning serveur : 16.13).

Tuning hardcodé pour serveur 8 GB RAM (CX33 Hetzner) :

```ini
shared_buffers = 2GB
effective_cache_size = 6GB
work_mem = 16MB
maintenance_work_mem = 256MB
wal_buffers = 16MB
max_connections = 100
```

## Conséquences

### Positives
- LTS jusqu'à nov 2028 → 2 ans de tranquillité
- `pg_jsonb` mature, indexation GIN parfaite pour nos `settingsJson`
- `gen_random_uuid()` natif (pas besoin d'extension `uuid-ossp`)
- Logical replication v2 dispo si besoin de réplica plus tard
- Tuning éprouvé pour 8 GB RAM (cf. PGTune defaults)

### Négatives
- Pas la **dernière** version (PG 17 a des perfs marginally better sur
  certaines requêtes parallèles)
- Migration future PG 16 → 18 (LTS 2030) à prévoir vers 2027-2028

## Pourquoi pas PG 17

- Trop récent au moment du provisioning (sept 2024 → avril 2026 = 18 mois,
  c'est court pour un noyau de DB)
- Quelques bugs reportés sur des workloads spécifiques (B-tree concurrency)
- Bénéfices marginaux pour notre use case
- Si on hésite : LTS plus longue avec 16 (jusqu'à nov 2028 vs nov 2029
  pour 17, peu de différence) mais 16 est plus battle-tested

## Pourquoi pas PG 15

- LTS expire **nov 2027** (vs nov 2028 pour 16) → upgrade obligatoire
  plus tôt
- Pas de bénéfice par rapport à 16

## Migration future

Quand PG 18 sortira (~sept 2025) et sera stabilisé (~mi-2026) :
- Tester en local avec un dump prod
- Plan upgrade : `pg_upgrade --link` (zero-downtime relatif) sur le
  serveur en single-user mode
- Window de maintenance : 30 min (pour 50 GB de DB estimé à terme)

## Lié

- [knowledge/stack.md](../../knowledge/stack.md)
- [knowledge/infra-prod.md](../../knowledge/infra-prod.md) §Tuning Postgres
