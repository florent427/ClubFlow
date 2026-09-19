# Piège — Un montant pré-rempli finit par être enregistré tel quel

## Symptôme

```
Encaissement Adhésion 2026-2027 — … : chèque de 366,00 €
```

Le 2026-09-19, en prod, un chèque de **91,50 €** (le premier de quatre) a été
enregistré à **366 €**, soit le montant entier de l'adhésion. La facture est
passée « Payée », avec une recette de 366 € en comptabilité et un chèque de
366 € en portefeuille.

## Contexte

Le formulaire « Enregistrer un paiement » du tiroir de facture pré-remplissait
le reste dû, quel que soit le mode. Pour un chèque, l'admin tape le numéro, la
banque et l'émetteur, et le montant proposé part sans avoir été relu. Un
adhérent règle souvent en plusieurs chèques : le reste dû n'est presque jamais
le montant du chèque.

## Cause root

Deux choses ensemble :
- **un montant d'argent pré-rempli** que rien n'oblige à relire. Plus il est
  souvent juste (espèces, virement), plus il passe inaperçu quand il est faux ;
- **aucun chemin pour reprendre une saisie** : la fiche du chèque ne change pas
  de montant, l'annulation d'un chèque ne vaut que hors facture, et un
  remboursement émet un avoir, qui éteint la dette restante. La correction a dû
  se faire en base, à la main.

## Solution

Depuis le 2026-09-19 :
- **pas de montant pré-rempli pour un chèque** : le champ est vide, avec
  « Montant écrit sur le chèque » en indication. Sans montant, l'encaissement
  est refusé avec un message qui dit quoi saisir (`manual-payment-amount.ts`
  dans l'admin) ;
- **« Annuler la saisie »** dans le tiroir : la mutation
  `cancelClubManualPayment` remet la dette sans avoir, contre-passe la recette
  dans la même transaction et annule le chèque encore en portefeuille
  (`manual-payment-cancellation.service.ts`).

Si l'annulation est refusée (chèque déjà remis, recette verrouillée ou
rapprochée), il faut corriger en base. Le modèle est la correction du
2026-09-19, dont le script reste sur le serveur de prod
(`/home/clubflow/correction-cheque-benard.sql`) :
- sauvegarder d'abord toutes les lignes touchées ;
- une seule transaction, où chaque `UPDATE` exige l'état constaté et lève
  sinon ;
- reprendre à la fois le paiement, le chèque, le statut de la facture,
  l'écriture, ses lignes et ses ventilations, au prorata comme le fait
  `AccountingService` pour un paiement partiel.

## Pourquoi NE PAS faire

- ❌ Rembourser l'encaissement : l'avoir émis éteint la créance, et le payeur ne
  doit plus rien alors qu'il doit encore la différence.
- ❌ Annuler la facture puis la refaire : on perd les lignes d'adhésion, les
  remises et le lien au panier.
- ❌ Corriger seulement `Payment.amountCents` en base : la recette, le chèque en
  portefeuille, les ventilations et le statut de la facture restent faux.

## Détection

Un encaissement manuel dont le montant égale exactement le total de la facture
alors que d'autres chèques suivent. Et, plus largement, tout champ de montant
d'argent qui se remplit tout seul : se demander s'il sera relu.

## Lié

- [decisions/0015-cheques-a-encaisser-5112.md](../decisions/0015-cheques-a-encaisser-5112.md)
- [decisions/0022-credit-du-payeur.md](../decisions/0022-credit-du-payeur.md)
- [pitfalls/garantie-derriere-effet-de-bord.md](garantie-derriere-effet-de-bord.md)
