# ADR-0015 — Les chèques transitent par 5112 jusqu'à la remise

## Statut

✅ **Accepté** — 2026-09-10
🔒 **Verrouillé**
Applique au chèque le schéma de l'[ADR-0010](0010-compte-transit-stripe.md) ;
prérequis du rapprochement de l'[ADR-0014](0014-rapprochement-bancaire-par-releves.md).

## Contexte

Un chèque saisi via `recordManualPayment` (méthode `MANUAL_CHECK`) est routé
par `kindFromMethod` vers la **banque** : l'écriture de recette débite 512 **le
jour de la saisie**, du montant du chèque.

La banque, elle, ne voit rien ce jour-là. Elle voit, des jours ou des semaines
plus tard, **une remise** : une seule ligne « REMISE CHEQUES N° 0007 », du
total de N chèques. Deux conséquences :

1. Le solde banque de ClubFlow est faux entre la réception et la remise, et
   rien ne le dit.
2. Au rapprochement, une ligne de remise devrait se rapprocher de N écritures de
   dates différentes, sans aucune clé commune. C'est exactement le problème que
   le transit Stripe a résolu pour la carte.

S'ajoutent deux besoins exprimés le 2026-09-10 : un **bordereau de remise
imprimable** (les banques l'exigent) et une **photo de chaque chèque** archivée
avec sa remise. Enfin, tous les chèques ne règlent pas une facture d'adhérent :
chèque de sponsor, de subvention, remboursement d'un fournisseur.

## Décision

**Les chèques reçus débitent le compte 5112 « Chèques à encaisser » et
n'atteignent la banque qu'à la remise.**

| Mouvement | Écriture |
|---|---|
| Réception d'un chèque | DÉBIT 511200 / CRÉDIT 7xx — l'écriture de recette existante, dont la contrepartie de trésorerie devient 511200 |
| Remise en banque (N chèques) | DÉBIT 512x / CRÉDIT 511200, **une écriture par remise**, du total, datée du dépôt, portant le n° de bordereau |
| Chèque impayé (plus tard) | contre-passation datée du rejet, facture rouverte |

Concrètement :

- Nouveau `ClubFinancialAccountKind.CHEQUE_TRANSIT` ; un compte financier
  « Chèques à encaisser » seedé sur le compte PCG `511200` ; `kindFromMethod(MANUAL_CHECK)`
  le retourne. Le contrôle de cohérence kind ↔ code (51x) reste valide.
- Un modèle `Cheque` (n°, émetteur, banque, montant, date de réception, photo,
  statut) rattaché **soit** à un `Payment` de facture, **soit** à une écriture
  de produit libre (sponsor, subvention, autre). Les deux sont éligibles à la
  même remise.
- Un modèle `ChequeDeposit` (n° séquentiel par club, compte banque, date,
  total, statut) qui porte l'écriture de virement interne et le PDF du
  bordereau ; les photos des chèques sont archivées avec lui.
- Le solde de 511200 est à tout instant **exactement** la valeur des chèques
  en portefeuille, comme 512300 l'est pour ce que Stripe doit au club.

### Migration des clubs existants

Même règle que `repointStripeRouteToTransit` : la route `MANUAL_CHECK` est
redirigée vers 511200 **seulement** si `isDefault` est encore vrai et si elle
pointe sur la banque par défaut. Les écritures de chèques antérieures restent en
banque ; la date de reprise (ADR-0014 §1) fixe la frontière.

## Options écartées

**Garder la banque et rapprocher 1 ligne ↔ N chèques par recherche de
sous-ensemble.** Faisable, mais le solde banque reste faux entre réception et
remise, et la recherche devient ambiguë dès que deux chèques ont le même
montant.

**Dater l'écriture du chèque à la remise, sans compte de transit.** Perd la
date de réception, qui est la date du paiement pour l'adhérent (facture payée,
mail envoyé, échéancier clôturé) ; et un chèque reçu mais non remis
n'existerait nulle part en compta.

**Photographier la remise entière plutôt que chèque par chèque.** Moins de
gestes, mais impossible de retrouver un chèque précis en cas de litige ou
d'impayé. La photo par chèque se prend au moment de la saisie, elle coûte un
clic.

## Conséquences

### Positives
- La ligne banque « REMISE CHEQUES » se rapproche d'**une** écriture, avec une
  clé forte (montant, date, n° de bordereau).
- Le trésorier voit ce qu'il a en portefeuille et ce qu'il a réellement en
  banque.
- Le bordereau est généré, plus recopié à la main ; les photos sont archivées
  avec la remise.

### Négatives
- Le « solde banque » affiché **baisse** pour tous les clubs qui saisissent des
  chèques : c'est la vérité, mais il faut l'annoncer — même précaution que pour
  les frais Stripe (ADR-0010).
- Une étape de plus pour le trésorier : faire la remise dans l'app. Elle
  remplace le bordereau papier, elle ne s'y ajoute pas.
- Le chèque impayé demande une contre-passation et le retour de la facture en
  dû : prévu, non livré dans le premier lot.

## Quand reconsidérer

- Si un club remet ses chèques un par un sans bordereau (banque en ligne) → la
  remise à un seul chèque reste possible, rien à changer.
- Si l'impayé devient fréquent → statut `BOUNCED` avec contre-passation
  automatique et réouverture de la facture.

## Lié

- [ADR-0010](0010-compte-transit-stripe.md) — le modèle imité
- [ADR-0014](0014-rapprochement-bancaire-par-releves.md) — le rapprochement qui en a besoin
- [pitfalls/garantie-derriere-effet-de-bord.md](../pitfalls/garantie-derriere-effet-de-bord.md)
  — l'écriture de remise et le passage des chèques en « remis » vont dans la
  même transaction
