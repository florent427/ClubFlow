# ADR-0014 — Rapprochement bancaire piloté par les relevés

## Statut

✅ **Accepté** — 2026-09-10
🔒 **Verrouillé** sur les principes (le relevé est la source de vérité, le
contrôle arithmétique est bloquant, aucune écriture sans validation humaine).
🔄 **Réversible** sur les moyens (modèles de lecture, formats supportés).
Prolonge [ADR-0010](0010-compte-transit-stripe.md) (transit Stripe). Plan
d'exécution : [plans/2026-09-10-rapprochement-bancaire-implementation.md](../../superpowers/plans/2026-09-10-rapprochement-bancaire-implementation.md).

## Contexte

La comptabilité ClubFlow est une **comptabilité de trésorerie** : chaque
encaissement et chaque décaissement produit une écriture dont la contrepartie
est un compte financier réel (banque, caisse, transit Stripe). Ces écritures
naissent automatiquement — webhooks Stripe, paiements manuels, reçus lus par
OCR — mais **rien ne les confronte jamais à la banque**. L'ADR-0010 l'avait
constaté : « aucun modèle de rapprochement n'existe au schéma, personne
n'aurait jamais vu l'écart ». Le champ `bankReconciledAt` posé sur
`AccountingEntryLine` attendait cette feature depuis la v1.

Pour le trésorier, la conséquence est concrète : il pointe à la main ce que la
banque a vu, et rien ne lui signale un virement d'adhérent jamais rattaché, un
prélèvement oublié, un solde qui dérive, ou un paiement Stripe passé hors
ClubFlow.

Objectif fixé par Florent le 2026-09-10 : **une mise en comptabilité par
simple dépôt de documents** — relevés de chaque banque, livre de caisse, reçus
et factures (déjà en place) — l'IA rapproche, propose et questionne, l'humain
tranche.

## Décisions

### 1. L'exercice est un paramètre du club ; la reprise a une date et des soldes

- `Club.fiscalYearStartMonth` / `fiscalYearStartDay`, défaut 1er janvier :
  aucun changement pour les clubs existants. Un club sportif choisira
  typiquement le 1er septembre, aligné sur sa saison.
- `Club.accountingStartsOn` : date de reprise de la compta dans ClubFlow.
  **Rien d'antérieur n'est rapproché** ; une ligne de relevé antérieure est
  ignorée avec le motif « hors reprise ».
- Chaque compte financier porte un **solde d'ouverture** à cette date, vérifié
  contre le solde de début du premier relevé déposé.
- La clôture annuelle se calcule sur les bornes de l'exercice du club, plus sur
  l'année civile. `AccountingFiscalYearClose.year` désigne l'année de **début**
  d'exercice ; le libellé affiché est « 2026-2027 ».

### 2. Le relevé est la source de vérité du compte banque

Une ligne de relevé égale **une écriture** sur le compte 51x correspondant, ni
plus ni moins. On reste en trésorerie : pas d'engagement 401/411.

Le rapprochement se matérialise par une table de liaison ligne ↔ écriture,
**N↔N** — un virement pour deux enfants, une facture réglée en deux virements,
une remise pour N chèques — et par `bankReconciledAt` posé sur la ligne 51x de
l'écriture. Une écriture d'un mois **verrouillé** peut être rapprochée : rien ne
change à ses montants. Aucune écriture nouvelle n'est créée dans un mois
verrouillé, règle inchangée.

### 3. Trois formats, l'IA seulement là où elle est indispensable

| Format | Lecture | Coût IA | Soldes de début / fin |
|---|---|---|---|
| OFX | parseur déterministe (`STMTTRN`, `FITID`, `LEDGERBAL`) | aucun | fournis par le fichier |
| CSV | parseur déterministe, mapping de colonnes mémorisé par compte | aucun | saisis par le trésorier |
| PDF | **double lecture** par deux modèles vision indépendants, fusion déterministe | oui, feature `BANK_STATEMENT_OCR` | lus par les deux modèles |

Le « relevé Stripe » n'existe pas comme document : voir §5.

### 4. Contrôle arithmétique bloquant et chaînage des relevés

Un relevé n'est **jamais** exploitable (`READY`) tant que l'une de ces
conditions tient :

- solde de début + Σ crédits − Σ débits ≠ solde de fin, au centime ;
- solde de début ≠ solde de fin du relevé précédent sur le même compte (ou ≠
  solde d'ouverture pour le premier) ;
- sa période chevauche un relevé déjà déposé sur le même compte.

C'est ce contrôle, et non la double lecture, qui **garantit** qu'aucune ligne
n'a été inventée ni oubliée : deux modèles peuvent se tromper ensemble,
l'arithmétique non. Les lignes où les deux lectures divergent sont mises en
évidence pour correction manuelle, et le contrôle est relancé après chaque
correction. Une seule fonction fait passer un relevé en `READY`, et elle
n'accepte que le résultat du contrôle (cf.
[garantie-derriere-effet-de-bord](../pitfalls/garantie-derriere-effet-de-bord.md)).

Le refus du chevauchement **remplace** toute déduplication heuristique : deux
lignes identiques le même jour (deux dépôts de 10 €) sont légitimes, et une
clé (date, montant, libellé) les aurait écrasées.

### 5. Stripe par API, jamais par upload

Tout ce que Stripe sait est déjà accessible : encaissements et frais
(`balance_transaction`), remboursements, virements (`payout.paid` → écriture
`AUTO_STRIPE_PAYOUT` identifiée par `po_xxx`, montant net, date d'arrivée).

- La ligne banque « VIR STRIPE » se rapproche de l'écriture de virement
  existante : montant net + date d'arrivée ± 3 jours + libellé.
- Le compte de transit est traité comme **un compte à relevé synthétisé** : un
  balayage liste les `balanceTransactions` de chaque virement, vérifie que
  chacune correspond à un `Payment`, des frais ou un remboursement connus, et
  projette les inconnues (paiement fait depuis le dashboard Stripe, litige,
  ajustement) comme lignes « à catégoriser » sur le transit. Il rattrape aussi
  un `payout.paid` manqué.

### 6. Aucune écriture, aucun encaissement sans validation humaine

- Le rapprochement **déterministe** — clé forte, ou montant + date sans autre
  candidat — est automatique, tracé dans l'audit, et réversible d'un clic
  (« détacher »).
- Toute **création** — écriture de charge ou de produit, encaissement d'une
  facture d'adhérent, remboursement de bénévole — reste une proposition tant
  qu'un humain ne l'a pas validée. Un bouton « tout valider » traite en lot les
  propositions sûres ; c'est toujours un geste.

Encaisser une facture passe le bulletin en payé, envoie des mails et clôture un
échéancier : l'IA ne pose pas ce geste seule.

### 7. Règles apprises d'abord, IA ensuite, dialogue, puis manuel

Pour une ligne sans écriture correspondante, dans cet ordre :

1. **Règles du club** (`AccountingCategorizationRule`, créées à chaque
   validation, visibles et modifiables) : « EDF » → 606100. Déterministe,
   gratuit ; le deuxième mois passe sans IA.
2. **Deux modèles texte en parallèle** — le modèle principal et le modèle de
   secours configurés par le club. Accord sur le compte et confiance haute →
   proposition « claire ». Désaccord ou confiance basse → l'IA formule **une
   question** en langage naturel sur cette ligne.
3. Le trésorier répond librement, l'IA retente avec la réponse, au plus trois
   tours.
4. Saisie manuelle, toujours accessible, à chaque étape.

### 8. La caisse n'a pas de relevé externe : l'app est le livre de caisse

Les mouvements d'espèces sont déjà des écritures sur le compte 53x. Ce qui
manque est le **livre** (solde courant) et le **comptage** : un comptage à une
date joue le rôle de relevé, l'écart éventuel devient une écriture d'écart de
caisse validée par le trésorier, et le dépôt d'espèces en banque est un
virement interne 53 → 51 que la ligne banque « VERSEMENT ESPECES » rapproche.

## Options écartées

**Agrégateur bancaire (Bridge, Powens, GoCardless Bank Account Data).**
Synchronisation automatique, mais consentement DSP2 à renouveler tous les
90 jours par un mandataire du club, coût par compte connecté, et aucun
trésorier ne l'a demandé. Déposer un relevé mensuel est un geste que tous font
déjà pour leur AG. À reconsidérer, voir plus bas.

**Rapprocher au niveau des paiements, sans passer par la compta.** Plus simple,
mais laisse de côté toutes les charges — loyer, assurance, fédération — qui
sont l'essentiel des lignes d'un relevé.

**Laisser l'IA comptabiliser les lignes « claires » sans validation.** Quelques
clics par mois de gagnés contre une écriture fausse qui ne se voit qu'à la
clôture. « Tout valider » donne le même gain sans retirer le regard humain.

**Dédupliquer les lignes par empreinte au lieu d'interdire le chevauchement.**
Écrase les lignes identiques légitimes ; le chaînage des soldes rend la
déduplication inutile.

## Conséquences

### Positives
- Le solde de chaque compte financier dans ClubFlow devient **vérifié**, et
  plus seulement calculé.
- Les virements d'adhérents jamais rattachés, les prélèvements oubliés et les
  paiements Stripe hors ClubFlow deviennent visibles.
- Le coût IA se concentre sur les PDF et les lignes réellement inconnues ;
  OFX, CSV et règles apprises sont gratuits.

### Négatives
- Un trésorier qui saisissait ses charges au fil de l'eau verra ses écritures
  « en attente de rapprochement » jusqu'au dépôt du relevé : statut nouveau, à
  expliquer.
- Le contrôle bloquant peut frustrer sur un PDF mal lu : il faut corriger les
  lignes avant d'avancer. C'est voulu.
- Les clubs déjà en production gardent des écritures antérieures à la reprise,
  jamais rapprochées. Elles restent telles quelles, hors périmètre.

### Mitigations
- La date de reprise et les soldes d'ouverture tracent une frontière nette
  entre « avant » et « rapproché ».
- Les lignes divergentes entre les deux lectures sont pointées une à une, avec
  l'image de la page en regard.

## Quand reconsidérer

- Si trois clubs demandent la synchronisation automatique → évaluer un
  agrégateur **en complément** du dépôt ; le modèle de lignes reste le même,
  seule la source change.
- Si plus de 10 % des relevés PDF d'un mois restent bloqués par le contrôle →
  revoir la stratégie de lecture (tuilage, modèles, prompt), pas le contrôle.
- Si un club a besoin d'engagements (factures fournisseurs à payer, 401) →
  sortir de la trésorerie pure, ce qui change l'invariant « une ligne = une
  écriture ».

## Lié

- [ADR-0010](0010-compte-transit-stripe.md) — transit Stripe, dont ce
  rapprochement est la vérification
- [ADR-0015](0015-cheques-a-encaisser-5112.md) — chèques à encaisser et remises
- [ADR-0016](0016-frais-avances-benevoles-467.md) — frais avancés par un bénévole
- [pitfalls/garantie-derriere-effet-de-bord.md](../pitfalls/garantie-derriere-effet-de-bord.md)
  — le contrôle d'intégrité est une garantie, pas un accessoire
- [pitfalls/test-verifie-la-forme-pas-le-comportement.md](../pitfalls/test-verifie-la-forme-pas-le-comportement.md)
- [plans/2026-09-10-rapprochement-bancaire-implementation.md](../../superpowers/plans/2026-09-10-rapprochement-bancaire-implementation.md)
