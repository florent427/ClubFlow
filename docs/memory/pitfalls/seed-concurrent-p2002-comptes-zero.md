# Piège — deux `seedIfEmpty` concurrents, et l'écran affiche « Comptes (0) »

## Symptôme

Paramètres → Comptabilité affiche **« Comptes (0) »** et « Aucun compte.
Crée-en un. » pour un club qui a trois comptes financiers en base. Un
rechargement, et tout est là. Aucune erreur côté client : Apollo rend `data`
undefined, le composant affiche zéro.

Le **seul** témoin est le log API :

```
ERROR [ExceptionsHandler] PrismaClientKnownRequestError:
Invalid `this.prisma.accountingAccount.create()` invocation in
  dist/accounting/accounting-seed.service.js
Unique constraint failed on the fields: (`clubId`,`code`)
    at async AccountingSeedService.seedIfEmpty
    at async AccountingResolver.clubPaymentRoutes
```

Vu sur staging le 2026-07-20 (sans être relevé) et le 2026-09-10, au premier
chargement de l'écran après un déploiement.

## Contexte

`seedIfEmpty` est un top-up **idempotent en séquence** : il lit les codes
présents, crée les manquants. Il tourne sur les chemins de **lecture**
(`clubFinancialAccounts`, `clubPaymentRoutes`, `clubAccountingAccounts`), et
l'écran lance ces trois requêtes **au montage**.

Trois seeds concurrents lisent donc le même plan, voient les mêmes codes
manquants — il suffit qu'un commit ait ajouté des comptes au seed depuis le
dernier passage — et tentent les mêmes `create`. Le premier gagne, les
autres lèvent P2002, et **leur requête entière échoue** : celle qui portait
la liste des comptes rend un écran vide.

« Idempotent » ne veut pas dire « sûr en concurrence » : un check-then-create
ne l'est jamais.

## Solution

Cohortes et comptes sont insérés par
`createMany({ data: manquants, skipDuplicates: true })`, ce que Prisma
traduit en `ON CONFLICT DO NOTHING` : le doublon est ignoré, `count` ne
compte que les lignes réellement insérées. Les mappings, comptes financiers
et routes toléraient déjà P2002 par un `catch`.

Test `accounting-seed-concurrency.spec.ts` : deux `seedIfEmpty` en
`Promise.all` sur un mock qui **reproduit la contrainte unique** (P2002 sans
`skipDuplicates`, ignoré avec). Retirer `skipDuplicates: true` le fait
rougir — vérifié par mutation le 2026-09-10.

## Le réflexe à garder

- Un seed sur un chemin de lecture s'exécute **autant de fois qu'il y a de
  requêtes simultanées**. Écrire ses insertions en `createMany
  skipDuplicates`, en `upsert` sur la clé unique, ou tolérer P2002.
- Un écran qui affiche **zéro sans erreur** ne prouve pas qu'il n'y a rien :
  aller lire le log API avant de conclure.

## Lié

- [garantie-derriere-effet-de-bord.md](garantie-derriere-effet-de-bord.md) —
  un seed qui lève casse la lecture qu'il devait garantir
- [compta-non-seedee-webhook-500.md](compta-non-seedee-webhook-500.md) —
  l'autre face du même seed : absent là où il fallait
