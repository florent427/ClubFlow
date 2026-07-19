# ADR-0011 — Un remboursement éteint la créance correspondante

## Statut

✅ **Accepté** — 2026-07-19
Précise [ADR-0010](0010-compte-transit-stripe.md) et [ADR-0009](0009-echeancier-paiement-clubflow.md)

## Contexte

Un remboursement se matérialise par un `Payment` négatif (convention de
`invoice-totals.ts`), qui fait **remonter** le solde de la facture. Un avoir
du montant remboursé est émis en regard, et le solde se calcule
`amountCents − paiements − avoirs`.

Sur une facture **déjà soldée**, l'avoir est indiscutable : sans lui la
facture redeviendrait due et le moteur reprélèverait l'adhérent qu'on vient
de rembourser.

Sur une facture **encore due**, il fait davantage, et c'est là que le choix
se pose. Échéancier de 300 €, première échéance de 100 € prélevée puis
remboursée :

| | Solde après remboursement | Total payé par l'adhérent |
|---|---|---|
| L'avoir est émis (choix retenu) | 200 € | 200 € |
| L'avoir n'est pas émis | 300 € | 300 € |

L'audit de pré-vol du 2026-07-19 a signalé le premier cas comme un défaut
majeur : « le club abandonne 100 € de créance sans qu'aucun geste ne l'ait
décidé ». Trois réfuteurs se sont divisés dessus — le désaccord portait en
réalité sur l'invariant voulu, pas sur ce que le code fait.

## Décision

**Rendre l'argent éteint la dette correspondante.**

L'avoir vaut **toujours** le montant remboursé, quel que soit le reste dû.

Le geste est explicite et tracé : `refundClubPayment` exige un **motif non
vide**, repris tel quel sur l'avoir, et journalise l'opération. Le montant,
lui, est **facultatif** — l'omettre rembourse la totalité du solde encore
remboursable.

Ce n'est pas un effet de bord : la description GraphQL de la mutation énonce
la conséquence, chiffres à l'appui, pour que l'appelant la connaisse sans
avoir à lire cet ADR.

## Alternative écartée

**Ressusciter la dette** — ne pas émettre d'avoir sur la part non couverte.

Le solde repasserait à 300 €, mais l'échéancier ne porte plus que deux
échéances de 100 €. Le moteur plafonne chaque prélèvement au solde
recouvrable (`Math.min(inst.amountCents, balance.collectableCents)`), donc il
encaisserait 200 € et laisserait **100 € dus sans échéance pour les porter** :
un reliquat orphelin que personne ne recouvrerait davantage.

Aucune des deux options ne récupère l'argent automatiquement. La différence
est de présentation, pas de trésorerie — et la seconde laisse en plus une
facture éternellement ouverte qui pollue les relances.

## Si un jour il faut rembourser SANS éteindre

Cas réel envisageable : un geste commercial, ou le remboursement d'un
prélèvement erroné sur une adhésion qui reste due. Ce sera alors un
**paramètre explicite** de `refundClubPayment` — jamais un comportement
implicite déduit de l'état de la facture, qui rendrait le résultat
imprévisible pour le trésorier.

## Comment l'invariant est verrouillé

Par un test sur une facture **partiellement réglée**
(`stripe-refunds.service.spec.ts`, « facture PARTIELLEMENT réglée : l'avoir
éteint la créance remboursée »).

Ce que ce test prouve exactement, et il faut être précis : que l'avoir vaut le
montant remboursé **inconditionnellement**. `applyRefundConfirmed` ne lit pas
le solde de la facture — c'est précisément le point. Un correctif qui
plafonnerait l'avoir introduirait cette lecture, et le test rougirait.

L'assertion `invoicePaymentTotals(30_000, 0, ...)` qui suit est illustrative :
elle documente la conséquence chiffrée pour le lecteur, elle ne teste pas le
code. Le distinguer importe — c'est la différence entre vérifier un
comportement et vérifier une arithmétique qu'on a écrite soi-même.

Le test préexistant portait sur une facture intégralement réglée — le cas où
l'invariant est vrai par construction. Il ne prouvait donc rien sur le cas où
l'on peut se tromper. C'est l'illustration exacte de
[test-verifie-la-forme-pas-le-comportement](../pitfalls/test-verifie-la-forme-pas-le-comportement.md) :
un test sincère, au bon nom, qui certifie un invariant qu'il ne vérifie pas.

Vérifié par mutation le 2026-07-19 : plafonner l'avoir fait rougir 3 tests.

## Lié

- [ADR-0009](0009-echeancier-paiement-clubflow.md) — échéancier
- [ADR-0010](0010-compte-transit-stripe.md) — compte de transit
- [pitfalls/test-verifie-la-forme-pas-le-comportement.md](../pitfalls/test-verifie-la-forme-pas-le-comportement.md)
