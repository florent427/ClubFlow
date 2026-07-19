# ADR-0009 — Échéancier de paiement géré par ClubFlow (carte + SEPA)

## Statut

✅ **Accepté** — 2026-07-18
🏗️ **Chantier en 5 lots** — dépend de [ADR-0008](0008-stripe-connect-express.md)

## Contexte

Deux besoins convergent vers le même manque :

**1. Le « paiement en 3 fois » ne fonctionne pas.** Testé en staging le
2026-07-18 sur une facture de 300 € avec `installmentsCount: 3` : la
session Checkout est créée **sans erreur**, mais la page de paiement
n'offre aucune option de fractionnement — l'adhérent paie 300 € en une
fois. Stripe ignore silencieusement la demande.

Cause : `payment_method_options.card.installments` est réservé à certains
marchés (Mexique, Brésil, Italie, Espagne). En France/EUR, le paiement
fractionné passe par Klarna ou Alma, pas par les facilités carte.

Conséquence actuelle : `Invoice.installmentsCount` est un **marqueur
cosmétique** qui ment. ClubFlow ne planifie rien, ne connaît aucune date
d'échéance, et ne déclenche aucun prélèvement.

**2. La mensualisation ne facture qu'un seul mois.**
`SubscriptionBillingRhythm.MONTHLY` n'est pas un étalement : le panier
prend `product.monthlyAmountCents` au lieu de `annualAmountCents`,
désactive le prorata, et génère **une facture d'un mois payée en une
fois**. Dans le seed, Enfant = 150 € annuel vs 15 € mensuel — le mensuel
vaut 1/10 de l'annuel, mais **les 9 autres mois ne sont jamais facturés**.

## Options évaluées

### Option A : Klarna (via Stripe)
- ✅ Vrai paiement fractionné disponible en France, sans rien planifier
- ✅ Le risque d'impayé est porté par Klarna
- ❌ C'est Klarna qui porte le crédit — image de marque et conditions
  imposées à des associations
- ❌ Ne résout **pas** la mensualisation sur une saison (10 échéances)
- ❌ Frais nettement supérieurs

### Option B : Stripe Subscriptions
- ✅ Récurrence gérée par Stripe (relances, échecs, SCA)
- ❌ Modèle « abonnement » mal aligné : une cotisation est un **montant
  total borné**, découpé en N, pas un abonnement sans fin
- ❌ Difficile à réconcilier avec le modèle `Invoice`/`Payment` existant
  (soldes, avoirs, compta en partie double)

### Option C : Échéancier géré par ClubFlow
- ✅ Un seul mécanisme couvre **3×** et **mensualisation sur la saison**
- ✅ ClubFlow maîtrise dates, montants, relances et politique d'échec
- ✅ S'intègre nativement au modèle existant (`Invoice`, `Payment`,
  soldes partiels déjà supportés par `invoicePaymentTotals`)
- ✅ Indépendant d'un prestataire de crédit
- ❌ C'est nous qui portons la complexité : planification, idempotence,
  échecs, SCA, mandats SEPA

## Décision

**Option C — échéancier géré par ClubFlow**, avec **carte ET SEPA** :
l'adhérent choisit son moyen à la souscription.

`SubscriptionBillingRhythm.MONTHLY` devient un **vrai échéancier borné par
`ClubSeason`** (ex. septembre → juin), ce qui corrige le manque à gagner
décrit plus haut.

### Politique d'échec retenue

3 tentatives maximum : la tentative initiale, puis **J+3**, puis **J+7**.
Un e-mail part à l'adhérent à chaque échec. Après la 3ᵉ, l'échéance passe
en échec définitif, **la facture reste due**, et le trésorier est alerté
pour reprendre la main.

Réessayer indéfiniment est explicitement écarté : chaque rejet peut être
facturé par la banque et dégrade la réputation du compte.

### Règle d'intégrité centrale

**Une ligne `Payment` n'est créée QUE lorsque l'argent est effectivement
encaissé.** Une échéance planifiée, en cours ou échouée vit exclusivement
dans les tables d'échéancier.

Raison : `Payment` n'a pas de statut — une ligne = de l'argent encaissé.
C'est ce qui alimente les soldes de facture et les écritures comptables en
partie double. Y écrire des échéances futures fausserait la comptabilité
et les relances d'impayés.

## Conséquences

### Ce qu'il faut construire
- **Infrastructure de planification** : elle n'existe pas. `@nestjs/schedule`
  n'est pas installé ; les deux « crons » actuels sont des `setInterval`
  ancrés sur l'heure de boot, remis à zéro à chaque `systemctl restart` du
  déploiement. « Prélever le 5 du mois à 8h » est aujourd'hui impossible.
- **Modèle d'échéancier** : `PaymentSchedule` + `PaymentScheduleInstallment`
  (statut, compteur de tentatives, `nextAttemptAt`).
- **Moyen de paiement réutilisable** : la session Checkout actuelle
  n'enregistre rien (`setup_future_usage` absent). Il faut un Customer et
  un PaymentMethod — **sur le compte connecté du club** (conséquence des
  direct charges, ADR-0008). Un membre présent dans deux clubs aura donc
  **deux Customers distincts**.
- **Webhooks manquants** : seuls `account.updated` et
  `payment_intent.succeeded` sont traités. Il faudra
  `payment_intent.payment_failed`, `payment_intent.requires_action`,
  `mandate.updated`, `setup_intent.*`, `charge.dispute.*`.
- **Dunning** : `InvoiceRemindersService` est manuel (déclenché par
  l'admin) et à granularité 30 jours — inutilisable pour un prélèvement
  raté qu'il faut relancer sous 48–72 h.

### Points de vigilance
- **Idempotence** : une clé d'idempotence Stripe par *tentative*
  d'échéance. Sans elle, un rejeu de cron ou de webhook produit un
  **double débit**. Le seul précédent du repo (`StripeWebhookEvent`) est
  un check-then-insert non atomique — à ne pas copier tel quel.
- **Répartition des centimes** : découper un total en N échéances laisse
  un reliquat ; la dernière échéance l'absorbe, et la somme des échéances
  doit toujours égaler le total de la facture.
- **SCA / 3-D Secure** : un prélèvement carte off-session peut exiger une
  authentification (`requires_action`). Il faut alors recontacter
  l'adhérent avec un lien — aucun mécanisme de ce type n'existe.
- **SEPA** : mandat + RUM, préavis avant prélèvement, délai de rejet de
  plusieurs jours, révocation possible par l'adhérent. Boucle d'échec
  sensiblement plus lente que la carte.
- **Coût comparé** : carte ≈ 1,5 % + 0,25 € **par échéance** (sur 10
  mensualités de 15 €, les frais rongent ~4 €) ; SEPA quelques centimes.
  C'est ce qui justifie de proposer les deux.

## ⚠️ Souscription des événements Stripe — piège opérationnel

Écouter un événement dans le code **ne suffit pas** : il faut aussi le
souscrire sur la destination webhook côté Stripe (Dashboard →
Développeurs → Webhooks → destination → modifier les événements).

Constaté le 2026-07-18 : le lot 2 écoutait `setup_intent.succeeded`, mais
la destination n'avait été configurée qu'avec deux événements au lot 1.
L'échéancier restait donc bloqué en `PENDING_SETUP` alors que le code était
correct — aucune erreur nulle part, juste un événement jamais délivré.

Événements à souscrire, par lot (⚠️ périmètre **« Comptes connectés »**,
puisqu'on est en direct charges) :

État au 2026-07-19 — **9 événements souscrits** sur les deux destinations
(`ClubFlow staging` et `ClubFlow API prod`) :

| Événement | Requis par | Souscrit |
|---|---|---|
| `account.updated` | Connect (onboarding) | ✅ |
| `payment_intent.succeeded` | Encaissement | ✅ |
| `setup_intent.succeeded` | Lot 2 — enregistrement du moyen de paiement | ✅ |
| `setup_intent.setup_failed` | Lot 2 — échec d'enregistrement | ✅ |
| `payment_intent.payment_failed` | Lot 4 — échec de prélèvement | ✅ |
| `payment_intent.requires_action` | Lot 4 — 3-D Secure off-session | ✅ |
| `mandate.updated` | Lot 4 — révocation d'un mandat SEPA | ✅ |
| `payout.paid` | Phase 2 — solde du compte de transit ([ADR-0010](0010-compte-transit-stripe.md)) | ✅ |
| `charge.refunded` | Phase 2 — remboursements | ✅ |
| `charge.dispute.created` | Litiges — **ni souscrit, ni traité dans le code** | ❌ |

**Règle** : tout ajout d'un `event.type` dans `handleStripeWebhook` doit
s'accompagner de la mise à jour de la destination, en test **et** en prod.
L'ordre compte : abonner d'abord, déployer ensuite. Le code seul ne reçoit
rien ; l'abonnement seul est inoffensif.

**Deux comportements différés, assumés** (cf. [ADR-0010](0010-compte-transit-stripe.md)) :

- Les **frais** ne sont généralement pas disponibles au moment du webhook,
  carte comprise — un balayage horaire les récupère.
- Un remboursement **SEPA** naît `pending` : le webhook l'ignore à raison,
  et c'est le rapprochement quotidien qui l'enregistre une fois passé à
  `succeeded`. Brancher `refund.updated` le rendrait immédiat.

## Lots

| Lot | Contenu |
|---|---|
| 0 | Infrastructure de planification (heure murale + verrou) |
| 1 | Modèle `PaymentSchedule` / `PaymentScheduleInstallment` |
| 2 | Enregistrement du moyen de paiement (carte + mandat SEPA) |
| 3 | Moteur de prélèvement off-session + idempotence |
| 4 | Échecs, relances, 3-D Secure |

## Quand reconsidérer

- Si le volume d'échéances dépasse ce qu'un cron mono-process traite
  confortablement → passer à une vraie file (Redis est déjà présent sur le
  serveur, inutilisé).
- Si la charge de conformité SEPA (mandats, litiges) s'avère supérieure au
  gain de frais → se replier sur la carte seule.
- Si Stripe rend `card.installments` disponible en France → à réévaluer
  pour le 3× uniquement, jamais pour la mensualisation.

## Lié

- [ADR-0008 — Stripe Connect Express](0008-stripe-connect-express.md)
