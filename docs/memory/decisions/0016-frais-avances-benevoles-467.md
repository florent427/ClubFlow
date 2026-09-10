# ADR-0016 — Les frais avancés par un bénévole passent par un compte de tiers

## Statut

✅ **Accepté** — 2026-09-10
🔒 **Verrouillé**
Complète l'[ADR-0014](0014-rapprochement-bancaire-par-releves.md).

## Contexte

Cas le plus courant de la vie associative : un bénévole paie avec sa carte
personnelle (essence, fournitures, repas d'arbitres), photographie le reçu, et
se fait rembourser plus tard par un virement du club, souvent groupé pour
plusieurs reçus.

Aujourd'hui le reçu lu par OCR devient une écriture de charge dont la
contrepartie est un compte financier **du club** (banque ou caisse). C'est faux :
l'argent n'est pas sorti du club ce jour-là. Au rapprochement, la ligne banque
« VIR JEAN DUPONT 87,40 » ne correspondra jamais aux trois écritures de
12,30 €, 45,10 € et 30,00 € datées de trois jours différents.

## Décision

**Un reçu avancé par un bénévole a pour contrepartie le compte 467
« Bénévoles, frais avancés à rembourser », et le remboursement solde ce
compte.**

| Mouvement | Écriture |
|---|---|
| Reçu avancé par un bénévole | DÉBIT 6xx / CRÉDIT 467100 |
| Remboursement (virement, souvent groupé) | DÉBIT 467100 / CRÉDIT 512x, **une écriture**, du total, listant les reçus couverts |

- Champ `AccountingEntry.advancedByMemberId`. Quand il est posé,
  `financialAccountId` est nul : l'écriture n'a pas de contrepartie de
  trésorerie.
- Le tiroir de revue propose « Payé depuis : un compte du club » ou « avancé par
  un bénévole ».
- Un modèle `VolunteerReimbursement` porte l'écriture de remboursement et la
  liste des reçus soldés ; la ligne banque du virement s'y rapproche.
- Une vue « soldes par bénévole » liste ce que le club doit à chacun.

Le compte PCG est **unique** (467100) ; la ventilation par personne est une
dimension analytique portée par l'écriture, pas N sous-comptes. C'est cohérent
avec le reste du module, qui porte déjà membre, projet et cohorte sur les
allocations.

## Options écartées

**Comptabiliser la charge à la date du remboursement.** Perd la date réelle de
la dépense (exercice, projet, TVA le cas échéant) et interdit de voir ce que le
club doit à ses bénévoles avant de les payer.

**Un compte PCG par bénévole (4671xx).** Multiplie les comptes, casse le seed et
n'apporte rien que l'analytique ne donne déjà.

**Traiter dès maintenant l'abandon de créance** (le bénévole renonce au
remboursement, don ouvrant droit à reçu fiscal). Cas réel mais distinct : un
jour une écriture 467 → 754/758 avec émission du reçu fiscal. Hors périmètre,
noté.

## Conséquences

### Positives
- La ligne banque du remboursement se rapproche d'une écriture unique, à clé
  forte (montant, date, nom du bénévole).
- Le club voit sa dette envers ses bénévoles ; un bénévole peut être remboursé
  en une fois pour plusieurs reçus.

### Négatives
- Un reçu mal qualifié — avancé alors que payé par le club, ou l'inverse —
  fausse deux comptes ; la correction passe par le tiroir de revue tant que
  l'écriture n'est pas verrouillée, par contre-passation ensuite.
- Une notion de plus à expliquer au trésorier : « payé par le club » ou
  « avancé ».

## Quand reconsidérer

- Si l'abandon de créance est demandé → écriture dédiée et génération du reçu
  fiscal (Cerfa 11580).
- Si les salariés du club ont aussi des notes de frais → compte 421 distinct,
  même mécanique.

## Lié

- [ADR-0014](0014-rapprochement-bancaire-par-releves.md)
- [ADR-0015](0015-cheques-a-encaisser-5112.md)
