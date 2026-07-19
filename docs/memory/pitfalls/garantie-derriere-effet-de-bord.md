# Piège — une garantie placée derrière un effet de bord qui peut échouer

## Symptôme

Il n'y en a pas. C'est tout le problème.

Le code semble correct, les tests passent, et la garantie qu'on croyait
poser ne s'applique tout simplement jamais quand la ligne qui la précède
lève. Les trois occurrences du 2026-07-18/19 se sont manifestées ainsi :

```
# 1. Facture soldée, échéancier resté ACTIVE malgré la clôture censée l'éteindre
 sched_status | inv_status
--------------+------------
 ACTIVE       | PAID

# 2. Webhook Stripe en échec permanent, rejeu stérile
Taux d'erreur : 11 %

# 3. Module comptable activé, zéro écriture pour tous les encaissements
 total_entries
---------------
             0
```

## Contexte

Le motif est toujours le même :

```ts
await tx.créerLeTruc();        // COMMITÉ — irréversible
await effetDeBordQuiPeutLever(); // ← lève
await laGarantieImportante();    // ← jamais atteinte
```

Trois instances réelles, à trois endroits différents du même module :

| Ce qui est commité | Ce qui lève | La garantie perdue |
|---|---|---|
| `Payment` + facture `PAID` | `recordIncomeFromPayment` | clôture de l'échéancier → double prélèvement possible |
| encaissement | `syncFeesForPayment` | rien, mais le webhook échoue → Stripe rejoue en boucle |
| `Payment` + facture `PAID` | `recordIncomeFromPayment` | l'écriture comptable elle-même, définitivement |

**Ce qui rend le motif coûteux à détecter** : chaque morceau est correct
pris isolément, et les tests unitaires mockent en général l'effet de bord
en succès. Le défaut n'existe que dans l'ordre, et l'ordre ne se teste
qu'en faisant échouer délibérément la ligne du milieu.

**Ce qui l'aggrave dans un webhook** : NestJS laisse remonter l'exception,
le contrôleur renvoie 500, l'idempotence est libérée, Stripe rejoue — et
le rejeu retombe sur un garde `if (déjàCréé) return` qui sort en succès.
Le webhook passe alors au vert en n'ayant rien fait. L'échec devient
invisible, et son seul témoin est le taux d'erreur de livraison côté
Stripe.

## Solution

Deux gestes, selon la nature de ce qui suit.

**Si c'est une garantie, la faire passer AVANT.**

```ts
// La clôture protège d'un double prélèvement. Elle ne peut pas dépendre
// de la réussite d'une écriture comptable.
if (soldée) await fermerLÉchéancier();
await this.accounting.recordIncome(...);
```

**Si c'est un accessoire, l'isoler — bruyamment.**

```ts
private async tryRecordIncome(...): Promise<void> {
  try {
    await this.accounting.recordIncomeFromPayment(...);
  } catch (err) {
    // ERROR et non WARN : une recette non comptabilisée fausse le
    // résultat du club.
    this.logger.error(`[compta] RECETTE NON COMPTABILISÉE — ${err.message}`);
  }
}
```

Le `catch` va au **site d'appel**, pas seulement dans le service appelé.
Un service peut s'engager par commentaire à ne jamais lever ; cet
engagement ne se vérifie pas au moment où il compte.

## La question à se poser

> *Cette ligne est-elle une GARANTIE ou un ACCESSOIRE ?*

Une garantie protège d'un dommage irréversible — argent prélevé deux fois,
donnée perdue. Elle passe avant tout ce qui peut échouer.

Un accessoire améliore l'état sans le conditionner — une écriture
comptable, un e-mail, une métrique. Il passe en dernier, dans un `try`,
et son échec se journalise.

Et la question suivante, tout aussi utile :

> *Si la ligne du milieu lève, qu'est-ce qui reste commité, et qui le saura ?*

## Vérification

Aucun test ordinaire n'attrape ce défaut. Il faut **forcer l'échec** :

```ts
it('la garantie tient même si l’accessoire échoue', async () => {
  accounting.recordIncomeFromPayment.mockRejectedValue(new Error('boom'));

  await service.encaisser(...);   // ne doit PAS rejeter

  expect(fermerLÉchéancier).toHaveBeenCalled();
});
```

Puis vérifier que le test **mord** : remettre l'ordre fautif et
s'assurer qu'il rougit. Un test qui reste vert des deux côtés ne prouve
rien — cf. [test-verifie-la-forme-pas-le-comportement.md](test-verifie-la-forme-pas-le-comportement.md).

## Lié

- [compta-non-seedee-webhook-500.md](compta-non-seedee-webhook-500.md) — la
  troisième instance, et la seule arrivée jusqu'en production
- [test-verifie-la-forme-pas-le-comportement.md](test-verifie-la-forme-pas-le-comportement.md)
- [ADR-0009](../decisions/0009-echeancier-paiement-clubflow.md) — le module
  où les trois occurrences ont été trouvées
