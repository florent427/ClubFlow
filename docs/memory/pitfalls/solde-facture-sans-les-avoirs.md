# Piège — un solde de facture calculé sans les avoirs

## Symptôme

Aucun message, aucune erreur. Le montant réclamé ou affiché est trop élevé du
montant des avoirs, et une facture qu'un avoir a éteinte reste « à relancer »
ou « en retard ». Seul un recoupement avec le reste dû du portail le montre.

Trouvé le 2026-09-14, à trois endroits :

| Endroit | Effet |
|---|---|
| `InvoiceRemindersService.listOverdue` et `sendReminder` | mail de relance réclamant le montant déjà crédité ; facture éteinte relancée |
| `DashboardService.trends` | « Factures en retard » : nombre et montant gonflés |
| `PaymentScheduleService.createForInvoice` | échéancier bâti sur le montant crédité (corrigé à part) |

## Cause

Un avoir est une ligne `Invoice` (`isCreditNote`, `parentInvoiceId`) créée
PAID, qui ne ferme PAS sa facture parente : la parente reste OPEN, avec un
solde nul quand l'avoir couvre tout. Le solde réel est donc
`montant − paiements − avoirs non VOID`
([ADR-0011](../decisions/0011-remboursement-eteint-la-creance.md)).

`invoicePaymentTotals(amount, paid, creditNotes = 0)` porte ce calcul, mais son
troisième paramètre a une valeur par défaut : l'oublier compile et rend un
nombre plausible. Le calcul écrit à la main (`amount − paid`) a le même défaut.

## Solution

Charger les avoirs non annulés avec la facture, et les passer au calcul :

```ts
include: {
  payments: true,
  creditNotes: {
    where: { isCreditNote: true, status: { not: InvoiceStatus.VOID } },
    select: { amountCents: true },
  },
},
// …
invoicePaymentTotals(
  inv.amountCents,
  inv.payments.reduce((s, p) => s + p.amountCents, 0),
  inv.creditNotes.reduce((s, c) => s + c.amountCents, 0),
);
```

Pour décider d'un encaissement sur UNE facture, préférer `resolveInvoiceBalance`
(`apps/api/src/payments/invoice-balance.ts`), qui déduit aussi les
prélèvements en vol.

Les tests de ce correctif suivent
[double-ignore-une-clause-du-where](double-ignore-une-clause-du-where.md) : la
relation `creditNotes` du double applique la clause `status` du service, sans
quoi retirer le filtre VOID resterait vert.

## Détection

```bash
grep -rn -A4 "invoicePaymentTotals(" apps/api/src --include=*.ts | grep -v "\.spec\.ts"
```

Tout appel à deux arguments, et tout `amountCents - paid` écrit à la main, est
suspect.
