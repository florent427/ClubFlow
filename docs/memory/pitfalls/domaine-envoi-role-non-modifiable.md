# Piège — un rôle figé à la création ne se corrige qu'en détruisant l'objet

## Symptôme

L'envoi d'une campagne échoue avec un message qui parle de vérification,
alors que le domaine **est** vérifié :

```
Validez un domaine d’envoi (Paramètres → E-mail : enregistrement puis
« Vérifier ») avant d’envoyer.
```

```sql
-- ... et pourtant :
SELECT fqdn, purpose, "verificationStatus" FROM "ClubSendingDomain"
  WHERE "clubId" = '<club>';
--  clubflow.topdigital.re | TRANSACTIONAL | VERIFIED
```

Le message ment sur la cause : ce n'est pas la vérification qui manque,
c'est le **rôle** qui ne couvre pas l'usage demandé.

## Contexte

Vécu en prod le 2026-09-21 sur le club SKSR. `ClubSendingDomain.purpose`
vaut `TRANSACTIONAL`, `CAMPAIGN` ou `BOTH`, et
`ClubSendingDomainService.getVerifiedMailProfile` filtre les domaines
vérifiés par `purposeMatchesUsage(purpose, usage)`. Un domaine vérifié
en `TRANSACTIONAL` est donc invisible pour une campagne — correct, mais
indiscernable d'un domaine non vérifié dans le message rendu.

Le vrai piège est ailleurs : le resolver n'exposait que
`createClubSendingDomain`, `createClubHostedSendingDomain`,
`refreshClubSendingDomainVerification` et `deleteClubSendingDomain`.
**Pas de mutation d'édition.** Le rôle se choisissait à la création et
ne se reprenait plus. Pour corriger `TRANSACTIONAL` → `BOTH`, la seule
voie par l'UI était : supprimer le domaine, le recréer avec le bon rôle,
refaire vérifier.

Or ce domaine servait correctement le transactionnel. Le supprimer pour
réparer la campagne **cassait le transactionnel** (mots de passe oubliés,
vérifications d'adresse) le temps de la re-vérification. La « correction »
était une panne volontaire.

## Cause root

Une entité porte plusieurs responsabilités, un seul champ discrimine
laquelle, et ce champ n'est éditable qu'à la création. Dès que la valeur
est fausse, corriger impose de détruire — donc de perdre aussi tout ce que
l'objet servait correctement par ailleurs.

`create` + `delete` sans `update` n'est pas un CRUD incomplet par
négligence : c'est un CRUD qui **facture la correction au prix d'une
interruption de service**.

## Solution

Mutation `updateClubSendingDomainPurpose(domainId, purpose)` +
`ClubSendingDomainService.updatePurpose`, avec la **même garde qu'à la
création** — `verificationConflict` contre les autres domaines `VERIFIED`
du club, en s'excluant soi-même :

```ts
const row = await this.prisma.clubSendingDomain.findFirst({
  where: { id: domainId, clubId },          // clubId : sinon on édite le domaine d'un autre club
});
if (!row) throw new BadRequestException('Domaine inconnu');
if (row.purpose === purpose) return row;    // idempotent, aucune écriture

const others = await this.prisma.clubSendingDomain.findMany({
  where: { clubId, verificationStatus: 'VERIFIED', id: { not: row.id } },
});
for (const o of others) {
  if (verificationConflict(o.purpose, purpose)) {
    throw new BadRequestException(
      'Un autre domaine vérifié couvre déjà ce type d’envoi. Changez d’abord son rôle ou retirez-le.',
    );
  }
}
return this.prisma.clubSendingDomain.update({
  where: { id: row.id },
  data: { purpose },
});
```

Côté admin, `MailDomainSettingsPage` affiche le rôle en `<select>` sur
chaque carte plutôt qu'en badge figé, avec un état local le temps de
l'aller-retour (sinon la liste retombe visuellement sur l'ancienne valeur
avant la réponse, et l'UI ment sur l'état stocké).

## Pourquoi NE PAS

- ❌ **Supprimer puis recréer** : coupe les usages que le domaine servait
  déjà bien. C'est la voie qu'on cherchait justement à supprimer.
- ❌ **`UPDATE` en base à la main** : contourne `verificationConflict`,
  donc laisse passer deux domaines vérifiés couvrant le même usage ;
  `getVerifiedMailProfile` prend alors le premier venu selon l'ordre des
  lignes. Dépanne une fois, installe une ambiguïté durable.
- ❌ **Ne garder la garde que si le domaine édité est vérifié** : la
  création l'applique aux domaines `PENDING` aussi. Deux règles
  différentes pour le même invariant, c'est l'invariant qui perd (cf.
  [une-supposition-survit-a-la-decision.md](une-supposition-survit-a-la-decision.md)).

## Détection

Le motif à reconnaître, en écrivant plutôt qu'en débuggant : **un resolver
qui expose `create*` et `delete*` mais pas `update*` sur une entité dont un
champ est un rôle / type / mode choisi à la création.**

Liste de départ — les resolvers qui prennent un rôle en argument mais
n'offrent aucune mutation d'édition :

```bash
grep -rl "@Mutation" apps/api/src --include=*.resolver.ts \
  | xargs grep -L "async update" \
  | xargs grep -lE "type: \(\) => [A-Z][A-Za-z]*(Purpose|Kind|Mode|Role)\b"
```

Avant le correctif, `club-sending-domain.resolver.ts` ressortait ; après,
non. Les fichiers restants sont une **liste à relire**, pas des bugs :
c'est la question qui tranche, pas le `grep`. Pour chacun — *si cette
valeur est posée de travers, comment l'utilisateur la corrige-t-il, et que
perd-il en chemin ?* Si la réponse est « il supprime et recrée », il manque
une mutation.

## Lié

- [brevo-sender-domain-must-be-authenticated.md](brevo-sender-domain-must-be-authenticated.md)
  — l'autre raison pour laquelle un domaine `VERIFIED` n'envoie pas.
- [une-supposition-survit-a-la-decision.md](une-supposition-survit-a-la-decision.md)
  — poser la règle au goulot, pas sur chaque chemin.
- [double-ignore-une-clause-du-where.md](double-ignore-une-clause-du-where.md)
  — le double des tests doit faire face à la requête, `clubId` compris.
- [runbooks/add-new-club.md](../../runbooks/add-new-club.md)
