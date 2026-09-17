# ADR-0022 — Crédit du payeur : avances encaissées sans facture, puis imputées sur ses factures

## Statut

✅ **Accepté** — 2026-09-15, à la livraison du lot 1 (avances au guichet), en prod en v0.67.0. Lot 2 (régler une facture avec le crédit, admin) : 2026-09-15.

Complète :
- l'[ADR-0014](0014-rapprochement-bancaire-par-releves.md) : trésorerie par relevés, comptabilité d'encaissement ;
- l'[ADR-0015](0015-cheques-a-encaisser-5112.md) (chèques) et l'[ADR-0010](0010-compte-transit-stripe.md) (transit Stripe) ;
- l'[ADR-0011](0011-remboursement-eteint-la-creance.md) : remboursement et avoir.

Reprend le schéma de l'[ADR-0016](0016-frais-avances-benevoles-467.md) : un compte de tiers unique, et la personne portée par l'écriture.

## Contexte

Besoin exprimé par Florent le 2026-09-15 : accepter les paiements d'avance des membres, notamment pour les adhésions, le membre étant alors « en crédit ».

C'est impossible aujourd'hui (vérifié dans le code le 2026-09-15) :
- **Facture obligatoire** : tout `Payment` en porte une (`invoiceId` non nul).
- **Pas de trop-perçu** : la saisie manuelle refuse un montant supérieur au reste dû ; le rapprochement d'un virement exige que ses parts couvrent exactement des factures ; Stripe plafonne au reste dû.
- **Avoir limité** : il ne réduit que sa facture parente.
- **Comptabilité d'encaissement** : un paiement crédite aussitôt 706100 (cotisations) ou 708000 (boutique). Aucun compte ne peut porter une somme reçue d'avance.

Le code impose aussi quatre contraintes :
- **Factures sans foyer** : achat boutique d'un contact, adhésion d'un membre sans foyer, facture libre.
- **Payeur et foyers** : un même payeur règle parfois plusieurs foyers, et le foyer étendu ne partage la facturation que dans un sens (par invitation).
- **Effets d'un encaissement** : la saisie manuelle et le virement rapproché passent par `recordManualPayment`, tandis que Stripe les rejoue de son côté.
- **Concurrence** : aucun verrou n'entoure les encaissements.

## Décisions

### 1. Le crédit appartient à la personne qui paie

Le propriétaire du crédit est un **payeur** : un membre ou un contact, comme pour `Payment.paidByMemberId` et `paidByContactId`.

- **Même compte utilisateur, même personne** : un membre et un contact rattachés au même compte dans le club partagent le crédit. Un contact promu membre le garde donc, sans migration. C'est possible parce qu'un compte n'a qu'une fiche membre par club (`@@unique([clubId, userId])`).
- **Sans compte utilisateur** : un membre a son propre crédit.
- **Le foyer** n'est pas propriétaire : il **affiche** le crédit de chacune de ses personnes, une ligne par personne, sans total.

### 2. Une avance est un « reçu d'avance », créé payé

Une avance est une facture de nature `PAYER_CREDIT_DEPOSIT`, portée par une nouvelle colonne `Invoice.purpose` (défaut `CHARGE`). Elle désigne sa personne par `payerCreditMemberId` ou `payerCreditContactId`, exactement l'un des deux.

**Elle naît PAYÉE**, créée par une seule fonction dans la même transaction que son `Payment` (et, pour un chèque, que sa fiche). Elle n'est jamais ouverte : aucune relance, aucun retard, aucun échéancier ne peut la prendre pour une dette.

- **Circuit d'encaissement réutilisé tel quel** : espèces, chèque en portefeuille, virement sur la banque du relevé, carte.
- **Carte** (« Créditer mon compte », portail et appli) : la session Stripe porte la personne en metadata. À réception de l'argent, le webhook crée le reçu payé et son paiement ; `stripePaymentIntentId`, unique, sert de clé d'idempotence.
  - **Qui** : le payeur d'un foyer, pour le crédit de son compte, de 1 € à 1 000 €. Proposé seulement si le club encaisse par carte.
  - **Compte émetteur** : l'événement doit venir du compte connecté du club, plateforme exclue. Sinon, comme pour une personne introuvable ou des metadata illisibles, rien n'est crédité : un ENCAISSEMENT ORPHELIN est journalisé, sans erreur que Stripe rejouerait.
- **PDF** : il s'intitule « Reçu d'avance ».
- **Remboursement** : une avance se rembourse comme un encaissement, par un avoir sur le reçu (ADR-0011), jamais par une annulation.
  - **Par carte**, depuis le tiroir du reçu : au plus le crédit encore disponible, la part utilisée ayant quitté le crédit.
  - **Sous le verrou de la personne, puis du reçu**, le crédit se relit, le remboursement se crée chez Stripe et s'enregistre aussitôt s'il a abouti. Une imputation simultanée attend et voit le crédit diminué. Le webhook `charge.refunded` le retrouve sans l'écrire deux fois (`stripeRefundId` unique). Un remboursement en attente chez Stripe n'a rien rendu : le webhook l'enregistrera. Le crédit n'est pas réservé pendant l'attente ; s'il sert entre-temps, il devient négatif à l'enregistrement, à régulariser (§4).
  - **Enregistrement en échec** après l'accord de Stripe : le remboursement est rendu au trésorier comme fait, et le webhook l'écrit.
  - **Depuis le tableau de bord Stripe** : pas de plafond ; le crédit peut devenir négatif, à régulariser (§4).

### 3. Utiliser le crédit, c'est régler la facture « par crédit »

Nouveau moyen de paiement `ClubPaymentMethod.PAYER_CREDIT` : un `Payment` sur la facture à régler, au nom de la personne (`paidBy…`), sans mouvement d'argent.

- **Contrôle du payeur** : le même que pour les autres moyens (`assertPaidBy…AllowedForInvoice`). Le crédit ne règle donc que ce que la personne a le droit de payer. Le contrôle s'étend aux factures sans foyer dont la personne est l'acheteur ou le membre facturé. Les payeurs proposés dans le tiroir de la facture passent par ce même contrôle : la liste ne propose rien que l'imputation refuserait. Pour un encaissement carte, le portail contrôle le payeur à l'ouverture du paiement ; quand Stripe annonce l'argent, un refus n'arrête pas l'encaissement. Le paiement garde son payeur tant que sa fiche existe dans le club, s'enregistre sans payeur sinon, et le refus est journalisé.
- **Effets** : les mêmes qu'un encaissement manuel (facture PAID au solde, commande boutique servie, échéancier clôturé, écriture). La séquence d'après-encaissement de `recordManualPayment` devient une fonction partagée, appelée dans la transaction de l'imputation.
- **Montant** : au plus le crédit disponible, et au plus le reste dû encaissable (`resolveInvoiceBalance`, prélèvements en cours déduits).
- **Concurrence** : la transaction prend deux verrous `pg_advisory_xact_lock`, la personne puis la facture, avant de lire le crédit et le reste dû. Deux imputations simultanées ne peuvent ni dépenser deux fois le même crédit, ni surpayer la facture.
  - **Clés** : `(hashtext('clubflow:payer-credit'), hashtext(<personne>))`, la personne valant `user:<userId>` pour un membre ou un contact rattaché à un compte, `member:<id>` pour un membre sans compte ; puis `(hashtext('clubflow:invoice'), hashtext(<invoiceId>))`.
  - **Ordre** : la personne, puis les factures dans l'ordre de leurs identifiants, puis seulement les écritures sur une commande ou un panier. Un règlement qui solde sa facture sert la commande sous le verrou de la facture : un chemin qui écrirait la commande avant de prendre ce verrou pourrait s'interbloquer avec lui. Les fonctions de verrou vivent dans `payments/settlement-locks.ts`.
  - **Qui prend le verrou de la facture** : tout ce qui encaisse, rembourse, émet un avoir ou annule sur une facture existante.
    - l'imputation, la saisie manuelle, qui relit aussi le reste dû sous verrou, et l'avoir ;
    - les six chemins qui annulent une facture, qui relisent sous verrou son statut et ses paiements avant de l'annuler : l'annulation depuis la facturation, la réouverture d'un panier d'adhésion, l'annulation d'une commande par le club ou par l'adhérent, « Annuler et rembourser » et l'annulation d'un article. D'un règlement et d'une annulation simultanés, un seul passe ;
    - l'encaissement carte (webhook Stripe), avant toute écriture, commande boutique comprise. Il relit sous verrou le paiement déjà enregistré pour son paymentIntent, puis le statut et le reste dû. L'argent est déjà chez le club, et une exception ferait rejouer Stripe en boucle : sur une facture introuvable, annulée ou soldée entre-temps, il n'écrit rien, journalise un ENCAISSEMENT ORPHELIN et répond sans erreur. Au-delà du reste dû, il enregistre ce reste et journalise l'excédent en ENCAISSEMENT ORPHELIN PARTIEL. Un rejeu après commit trouve son paiement : il reprend le soldage de l'échéance et les frais, sans passer pour un orphelin ;
    - le remboursement confirmé par Stripe, avant son paiement négatif et son avoir. Il ne s'intercale plus entre les requêtes d'une relecture sous verrou, ni entre cette relecture et son commit. Il relit aussi sous ce verrou la part qui rend l'excédent d'un ENCAISSEMENT ORPHELIN PARTIEL. Un remboursement créé hors de ClubFlow (tableau de bord Stripe) rend d'abord cet excédent, sans paiement négatif ni avoir ; un remboursement de `refundPayment` rend toujours l'encaissement qu'il désigne. Le plafond de `refundPayment` ne compte pas l'excédent rendu.
- **Rendre le crédit** (avoir ou annulation boutique sur une facture réglée par crédit) : un `Payment` négatif `PAYER_CREDIT` qui désigne l'imputation rendue (`refundedPaymentId`), sur le modèle des remboursements (ADR-0011).
  - **Avoir** : il éteint d'abord ce qui reste dû, et ne rend que ce qui a été payé au-delà du dû qu'il laisse, soit `min(avoir, max(0, payé net − max(0, montant − avoirs)))`. Les imputations sont rendues de la plus récente à la plus ancienne, chacune au plus de ce qui n'en a pas déjà été rendu.
  - **Annulation boutique** : chaque imputation revient au crédit, par un remboursement de nature `CREDIT`.
- **Pas d'imputation automatique** : c'est l'admin ou le payeur qui choisit. Une proposition à la validation d'un panier pourra venir plus tard.
- **Au portail et dans l'appli** :
  - **Le crédit est celui du compte connecté**, jamais celui du profil actif. Un payeur peut activer le profil d'un autre adulte de son foyer ; le crédit de cet adulte reste le sien.
  - **Les factures** sont celles que le profil actif peut régler en ligne, comme pour « Payer en ligne ». Hors de ce périmètre, une facture est introuvable. L'imputation refait ensuite le contrôle du payeur, sur la personne du compte.
  - **Le montant** est celui que le payeur a confirmé. L'imputation le refuse s'il dépasse le crédit ou le reste dû qu'elle relit sous verrou.

### 4. Le solde se calcule à partir des paiements, il n'est stocké nulle part

```
crédit(personne) = Σ paiements des reçus d'avance de la personne   (versements ; remboursements en négatif)
                 − Σ paiements PAYER_CREDIT de la personne           (imputations ; re-crédits en négatif)
```

- **Pourquoi calculer** : les paiements tracent déjà chaque mouvement, sur tous les chemins (saisie, webhook, virement, remboursement). Une colonne ou une table de solde serait une seconde vérité, que chacun de ces chemins devrait tenir à jour ([garantie derrière un effet de bord](../pitfalls/garantie-derriere-effet-de-bord.md)).
- **Indépendant de la comptabilité** : le solde ne dépend pas des écritures, qui sont sans effet quand le module est désactivé.
- **Une seule fonction** calcule le crédit ; l'admin, le portail et l'imputation l'appellent.
- **Crédit négatif** : un remboursement ou un litige carte après usage peut le rendre négatif. Il s'affiche alors « à régulariser » et bloque toute nouvelle imputation.

### 5. Écritures

| Mouvement | Écriture |
|---|---|
| Avance encaissée | **TRANSFER** : DÉBIT trésorerie (530000, 511200, 512x ou 512300 selon le moyen) / CRÉDIT 419100. Compte financier renseigné, donc rapprochable. |
| Crédit utilisé | **INCOME** : DÉBIT 419100 / CRÉDIT 706100 ou 708000, avec la ventilation analytique habituelle. Aucun compte financier : hors trésorerie, hors rapprochement. |
| Crédit rendu (avoir ou annulation boutique sur une facture réglée par crédit) | Contre-passation de la part rendue : DÉBIT produit / CRÉDIT 419100, jamais la banque par repli. Le reste d'un avoir suit l'encaissement d'origine. |
| Avance remboursée | Contre-passation **TRANSFER** : DÉBIT 419100 / CRÉDIT trésorerie. |

- **Nouveau compte** : 419100 « Adhérents – avances et acomptes reçus » (LIABILITY) entre au plan seedé. Tout code qui y écrit appelle `seedIfEmpty` avant de chercher le compte.
- **Sens explicite** sur chaque ligne 419100, car `deriveSide` ignore LIABILITY. Même traitement que 467100.
- **Pas de sous-compte** : un seul 419100, la personne étant portée par l'écriture. Le détail par personne est le calcul du §4.
- **Recette constatée à l'usage** : une adhésion de la saison prochaine payée d'avance n'entre en 706100 que le jour où le crédit la règle.

### 6. Ce que le moyen « Crédit » ne peut pas être

`PAYER_CREDIT` est refusé partout où un moyen de paiement fait entrer de l'argent ou fixe un tarif :
- saisie manuelle d'un encaissement ;
- routes de paiement ;
- règles tarifaires, et moyen servant au tarif d'une facture libre ;
- mode verrouillé d'une facture ou d'un panier.

Il est aussi exclu des cumuls d'encaissements du tableau de bord (encaissé du mois, tendances à 30 et 60 jours) : il ne fait entrer aucun argent.

Un reçu d'avance, lui, ne se règle pas « par crédit », n'accepte ni échéancier ni avoir manuel, et ne s'annule pas.

## Alternatives écartées

- **Crédit du foyer** :
  - des factures n'ont pas de foyer ;
  - un payeur règle parfois plusieurs foyers ;
  - un crédit de groupe laisserait l'avance d'une résidence régler les factures d'une autre, sans invitation.
- **Paiement sans facture (`Payment.invoiceId` nullable)** : tout le code d'encaissement suppose une facture (fiche chèque, webhook Stripe, parts d'un virement, avoirs, PDF). Le reçu d'avance donne à tout ce code son point d'ancrage, sans rien changer.
- **Solde stocké (colonne ou table de mouvements)** : une seconde source de vérité, que chaque chemin d'argent devrait tenir à jour, y compris les chemins futurs (chèque impayé, litige carte).
- **Se servir des avoirs** :
  - un avoir ne réduit que sa facture parente, et le reporter sur une autre facture demanderait un mécanisme neuf ;
  - la contre-passation d'un avoir manuel crédite aujourd'hui la trésorerie à tort.
- **Compte 411 créditeur** : la comptabilité est tenue en encaissement, sans 411 (ADR-0014). Le compte du PCG pour les sommes reçues d'avance est le 419.
- **Imputation automatique** : un crédit versé pour un kimono partirait dans une cotisation. Elle pourra venir plus tard, en option.

## Conséquences

### Positives

- Une avance s'encaisse par tous les moyens existants, se rapproche comme un encaissement et se lit sur un reçu.
- La recette tombe au bon exercice, sans écriture de régularisation.
- Un contact promu membre garde son crédit.
- Le verrou de facture ferme au passage une course de la saisie manuelle : aujourd'hui, deux saisies simultanées peuvent surpayer une facture.
- Le passage PAID s'aligne sur le solde après avoirs.

### Négatives

- Les reçus d'avance apparaissent parmi les factures payées : il faut un badge « Avance » et un filtre dans la facturation.
- Un moyen de paiement de plus, à exclure explicitement de plusieurs écrans (liste au lot 2 du plan).
- Un remboursement ou un litige carte après usage peut rendre un crédit négatif.
- L'appli mobile admin (`apps/mobile-admin`) ne connaît pas le crédit : hors périmètre.

## Lié

- Plan : `docs/superpowers/plans/2026-09-15-credit-du-payeur.md`
- [ADR-0014](0014-rapprochement-bancaire-par-releves.md), [ADR-0015](0015-cheques-a-encaisser-5112.md), [ADR-0010](0010-compte-transit-stripe.md), [ADR-0011](0011-remboursement-eteint-la-creance.md), [ADR-0016](0016-frais-avances-benevoles-467.md)
- [pitfalls/garantie-derriere-effet-de-bord.md](../pitfalls/garantie-derriere-effet-de-bord.md)
- [pitfalls/solde-facture-sans-les-avoirs.md](../pitfalls/solde-facture-sans-les-avoirs.md)
