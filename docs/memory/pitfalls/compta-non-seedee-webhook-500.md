# Piège — module comptable activé mais plan comptable jamais seedé

## Symptôme

Un club a `ACCOUNTING` activé, des paiements Stripe encaissés, et
**aucune écriture comptable**. Rien dans les logs applicatifs ne le dit.

```sql
select count(*) from "AccountingAccount"    where "clubId"='…';  -- 0
select count(*) from "ClubFinancialAccount" where "clubId"='…';  -- 0
select count(*) from "AccountingEntry"      where "clubId"='…';  -- 0

select "moduleCode", enabled from "ClubModule" where "clubId"='…';
--  ACCOUNTING | t     ← pourtant activé
```

Le **seul** témoin est côté Stripe, dans la destination webhook :

```
Taux d'erreur : 11 %   (3 échecs sur 27 livraisons)
```

Un taux d'erreur non nul sur un endpoint de paiement mérite toujours
qu'on s'y arrête. Ici il a été vu deux fois sans être relevé, et le bug
n'a été trouvé qu'en préparant un test destiné à tout autre chose.

## Contexte

`seedIfEmpty` crée le plan comptable (49 comptes), les comptes financiers
et les routes de paiement. Mais il n'est appelé que depuis les **chemins
de lecture** du resolver comptable — les écrans de comptabilité.

Activer le module **ne seede rien**. Un club qui active la comptabilité
puis encaisse sans jamais ouvrir ces écrans reste sans plan comptable.

La chaîne complète :

1. Paiement Stripe → `applyStripePaymentSuccess` crée le `Payment` et
   passe la facture `PAID` — **transaction commitée**
2. `recordIncomeFromPayment` voit le module activé, appelle
   `lookupAccount` → `NotFoundException: Compte comptable 706100 introuvable`
3. L'exception remonte, `handleStripeWebhook` **libère la réservation
   d'idempotence** et propage → **500**
4. Stripe rejoue → le `Payment` existe déjà → sortie anticipée sur
   `already` → **200**

Résultat : argent enregistré, comptabilité absente, et l'échec **masqué
par la réussite du rejeu**. C'est une instance de
[garantie-derriere-effet-de-bord.md](garantie-derriere-effet-de-bord.md),
la seule arrivée jusqu'en production.

## Solution

**Seeder là où le besoin naît**, et non au moment de l'activation du
module. `AccountingService` injecte déjà `AccountingSeedService` :

```ts
async recordIncomeFromPayment(clubId, paymentId, …) {
  if (!(await this.isAccountingEnabled(clubId))) return;

  // Le plan comptable doit exister AVANT de chercher un compte.
  // Idempotent : répare aussi les clubs déjà dans cet état, sans migration.
  await this.seed.seedIfEmpty(clubId);
  …
}
```

L'avantage sur un seed à l'activation : **les clubs déjà cassés se
réparent tout seuls** au prochain encaissement, sans script de migration.

**Et isoler l'écriture comptable** pour qu'elle ne fasse plus échouer un
encaissement déjà commité — cf. le pitfall lié.

## Vérification

```bash
# Avant : 0 compte. Après un encaissement, le plan doit exister.
ssh … "sudo -u postgres psql -d clubflow_staging -c \
  \"select count(*) from \\\"AccountingAccount\\\" where \\\"clubId\\\"='…';\""
#  49

# Et l'écriture de recette, sur le bon compte de trésorerie
ssh … "… select e.source, aa.code from \"AccountingEntry\" e … \"
#  AUTO_MEMBER_PAYMENT | 512300
```

Côté Stripe, le taux d'erreur de la destination doit retomber à 0 %.

## Le réflexe à garder

Un **taux d'erreur webhook non nul** n'est jamais du bruit. Stripe rejoue,
donc un échec suivi d'un rejeu réussi ne se voit nulle part ailleurs —
ni dans les logs applicatifs, ni dans les données, qui paraissent
cohérentes. La statistique de livraison est parfois le seul endroit où
un bug silencieux laisse une trace.

## Lié

- [garantie-derriere-effet-de-bord.md](garantie-derriere-effet-de-bord.md)
- [ADR-0008](../decisions/0008-stripe-connect-express.md)
- [ADR-0010](../decisions/0010-compte-transit-stripe.md)
