# Piège — Le déploiement supprime toute table de `public` absente du schéma Prisma

## Symptôme

Deux cas :

1. Le déploiement échoue sur une table que personne n'a touchée :

   ```
   Error: ERROR: permission denied for table _backup_member_phone_20261110
   ```

   C'est ce qui est arrivé au déploiement de la v0.87.0 (2026-11-11).

2. **Aucun symptôme du tout** : une table de sauvegarde créée à la main
   disparaît sans laisser de trace au déploiement suivant.

## Contexte

`bin/clubflow-deploy.sh` exécute à chaque déploiement en prod (et sur
staging) :

```bash
npx prisma db push --skip-generate --accept-data-loss
```

Le cas typique : quelqu'un crée une table de sauvegarde avant une
correction de données, par exemple
`create table _backup_member_phone_20261110 as select ...`, et la laisse
dans le schéma `public`.

## Cause root

`db push` aligne le schéma `public` sur `schema.prisma`. Toute table de
`public` qui n'est pas dans le schéma Prisma est considérée comme du
surplus, et `DROP TABLE` est généré. Avec `--accept-data-loss`, rien ne
demande de confirmation.

En 2026-11, la table n'a été sauvée que parce qu'elle appartenait à
`postgres` : l'utilisateur `clubflow` n'avait pas le droit de la
supprimer. Si la table avait été créée en tant que `clubflow`, la
sauvegarde aurait été effacée en silence.

## Solution

Ne jamais laisser de table hors schéma dans `public`. Pour une
sauvegarde ponctuelle, utiliser un schéma à part, `backups`, que
`db push` ignore car le datasource ne cible que `public` :

```sql
create schema if not exists backups;
create table backups._backup_<sujet>_<date> as select ... ;
-- ou, pour une table déjà créée dans public :
alter table public._backup_<sujet>_<date> set schema backups;
```

Si le déploiement a déjà échoué de cette façon :

1. Déplacer la table dans `backups` (commande ci-dessus, en tant que
   `postgres`).
2. Vérifier qu'il ne reste pas d'autre écart, en lecture seule :
   `npx prisma migrate diff --from-url "$DATABASE_URL" --to-schema-datamodel prisma/schema.prisma --script`.
   La sortie doit être vide ou ne contenir que les changements attendus.
3. Relancer le déploiement : `gh workflow run deploy.yml --ref main`.

## Pourquoi NE PAS faire X

- ❌ Donner la table à `clubflow` pour « débloquer » le déploiement :
  `db push` la supprime aussitôt.
- ❌ Retirer `--accept-data-loss` du script : il est nécessaire pour les
  changements de contrainte (voir
  [ADR-0003](../decisions/0003-prisma-db-push.md)), et le déploiement
  bloquerait à chaque fois.
- ❌ Compter sur le propriétaire `postgres` comme protection : c'est un
  hasard, pas une garantie.

## Détection

Avant un déploiement, lister les tables de `public` absentes du schéma.
Une sortie de `migrate diff` qui contient `DROP TABLE` sur une table
inconnue désigne le coupable.

```sql
select tablename, tableowner from pg_tables
where schemaname = 'public' and tablename like '\_%';
```

## Lié

- [ADR-0003 — prisma db push](../decisions/0003-prisma-db-push.md)
- [runbooks/deploy.md](../../runbooks/deploy.md)
- [runbooks/restore-db.md](../../runbooks/restore-db.md)
- [Une garantie derrière un effet de bord qui peut échouer](garantie-derriere-effet-de-bord.md)
