# Piège — une route REST qui croit l'en-tête `X-Club-Id`

## Symptôme

Aucun. Pour un utilisateur légitime, tout marche : l'admin envoie le club
qu'il administre, la route filtre par ce club, et les données sont les bonnes.

Constaté le 2026-09-17, en préparant le lot 3 du crédit du payeur. L'admin d'un
**autre** club, en envoyant l'identifiant du club visé, obtenait :

```
GET    /invoices/inv-1/pdf               200
GET    /accounting/export/csv            200
GET    /accounting/export/fec            200
GET    /events/ev-1/attachments          200
DELETE /events/ev-1/attachments/att-1    200
GET    /media                            200
POST   /media/m-1/public                 201
DELETE /media/m-1                        200
```

## Contexte

Les routes REST (fichiers, exports) ne passent pas par les gardes GraphQL
`ClubContextGuard` et `ClubAdminRoleGuard`. Quatre contrôleurs lisaient le club
dans l'en-tête après le seul `AuthGuard('jwt')`, puis filtraient chaque requête
par ce `clubId`. Le commentaire de l'un d'eux le revendiquait : « le guard de
club est implicite car on filtre systématiquement par `clubId` en base ».

Trois autres contrôleurs du même genre vérifiaient bien le rôle (documents, bons
de livraison, bons de commande). La règle existait ; rien n'obligeait à
l'appliquer.

## Cause root

Filtrer par un `clubId` venu du client borne la lecture à UN club, sans dire
lequel le demandeur a le droit de lire :
- l'en-tête se falsifie ;
- l'identifiant d'un club est **public** (`clubBySlug`, `searchPublicClubs`) ;
- un jeton valide s'obtient par l'inscription publique (`registerContact`), avec
  une adresse e-mail vérifiée.

N'importe quel compte lisait donc les factures et le FEC d'un autre club, et
pouvait rendre publics ou supprimer ses médias.

## Solution

`ClubRestAccessGuard` (`apps/api/src/common/guards/club-rest-access.guard.ts`),
placée après `AuthGuard('jwt')`, vérifie que le compte du jeton appartient au
club de l'en-tête :

```ts
// Back-office (défaut) : admin, bureau, trésorerie, admins système.
@UseGuards(AuthGuard('jwt'), ClubRestAccessGuard)

// Toute l'équipe : tout rôle d'adhésion au club (le public de l'admin).
@UseGuards(AuthGuard('jwt'), ClubRestAccessGuard)
@RequireClubRestAccess('STAFF')
```

Chaque route prend la règle de son pendant GraphQL, sans en inventer :
- facture PDF, exports comptables et pièces jointes d'événements : back-office,
  comme la facturation, la comptabilité et les événements ;
- médiathèque (envoi, liste, passage en public, suppression) : toute l'équipe,
  car la vitrine, les projets et la comptabilité s'en servent.

Test qui discrimine : `club-rest-access.guard.spec.ts` monte les vrais
contrôleurs derrière la vraie stratégie JWT, et envoie de vraies requêtes. Le
compte d'un autre club doit recevoir 403 sur chaque route. Sur le code d'origine,
31 des 42 tests rougissent ; mutations à la main : 10 tuées sur 10.

## Pourquoi NE PAS faire

- ❌ **Se contenter du filtre `where: { clubId }`** : il empêche de lire un autre
  club que celui DEMANDÉ, pas de demander un club qui n'est pas le sien.
- ❌ **Une garde globale « en-tête `X-Club-Id` ⇒ équipe du club »** : le portail
  membre envoie aussi cet en-tête, sans aucun rôle d'adhésion.
- ❌ **Tester la présence du décorateur** : un test de forme (cf.
  [test-verifie-la-forme](test-verifie-la-forme-pas-le-comportement.md)). Seule
  une requête HTTP prouve que la route refuse.

## Détection

Toute route REST qui lit `x-club-id` doit porter la garde, ou un contrôle de rôle
explicite :

```bash
grep -rln "x-club-id" apps/api/src --include=*.controller.ts \
  | xargs grep -L "ClubRestAccessGuard\|userHasClubBackOfficeRole"
```

Une sortie non vide désigne une route qui croit l'en-tête. `GET /media/:id` n'est
pas concernée : sans garde à dessein (vitrine, `<img src>`), elle ne sert un
fichier privé que par URL signée.

## Lié

- [pitfalls/test-verifie-la-forme-pas-le-comportement.md](test-verifie-la-forme-pas-le-comportement.md)
- [pitfalls/double-ignore-une-clause-du-where.md](double-ignore-une-clause-du-where.md)
- [pitfalls/une-supposition-survit-a-la-decision.md](une-supposition-survit-a-la-decision.md)
- [decisions/0006-path-based-multi-tenant.md](../decisions/0006-path-based-multi-tenant.md)
