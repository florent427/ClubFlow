# Piège — Migrations Prisma dans le mauvais ordre

## Symptôme

```
$ npx prisma migrate deploy
Error: P3009
migrate found failed migrations in the target database

Migration name: 20260330070848_members_core
Database error code: 42P01
Database error: ERROR: relation "Club" does not exist
```

## Contexte

Le repo a accumulé **17 migrations sur main** dont l'ordre est cassé :
- `20260330070848_members_core` (référence `Club`)
- `20260330120000_init_socle` (crée `Club`) ← **plus tard que members_core**

Prisma applique dans l'ordre **timestamp lexicographique** des dossiers,
donc `members_core` (070848) avant `init_socle` (120000) → fail.

## Cause root

L'historique des migrations a été manipulé manuellement (renommage de
dossiers ?, squashes incohérents) à un moment donné. Résultat :
l'ordre des timestamps **ne reflète pas** l'ordre logique de création
des tables.

## Solution actuelle (workaround)

**Utiliser `prisma db push`** au lieu de `prisma migrate deploy` :

```bash
npx prisma db push --skip-generate
```

`db push` :
- Compare le schema actuel à la DB
- Applique les diff **sans utiliser l'historique de migrations**
- Idempotent (peut tourner 100 fois sans casser)

**Conséquence** : la table `_prisma_migrations` n'est pas à jour, donc
on ne peut pas faire `migrate resolve` ni `migrate deploy` sans reset.

## Solution propre (à faire)

1. Créer une **baseline** : sur une DB de prod cleanée, dump le schema
   complet, créer une seule migration `00000000000000_baseline_2026_05`
   contenant tout le DDL actuel
2. Marquer cette baseline comme appliquée :
   `prisma migrate resolve --applied 00000000000000_baseline_2026_05`
3. Supprimer les 17 migrations cassées du repo
4. Repartir sur des migrations propres pour la suite

⚠️ Avant de faire ça : **dump complet de la DB** + tester sur un env de
staging.

## ADR lié

[ADR-0003](../decisions/0003-prisma-db-push.md) — Utiliser `db push` en
prod le temps de stabiliser les migrations.

## Pièce manquante : env de staging

Pour tester proprement la baseline, il faudrait un env de staging avec
une copie de la prod. Pas en place. À mettre dans la roadmap.

## Lié

- [ADR-0003 — Prisma db push](../decisions/0003-prisma-db-push.md)
- [runbooks/deploy.md](../../runbooks/deploy.md) Phase 2
- [knowledge/stack.md](../../knowledge/stack.md)
