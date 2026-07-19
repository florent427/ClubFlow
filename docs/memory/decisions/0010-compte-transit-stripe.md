# ADR-0010 — Les encaissements Stripe transitent par le compte 512300

## Statut

✅ **Accepté** — 2026-07-19
Dépend de [ADR-0008](0008-stripe-connect-express.md) (direct charges)

## Contexte

Stripe encaisse le **brut**, prélève sa commission, puis vire le **net** à
la banque du club quelques jours plus tard.

Jusqu'ici tout tombait directement sur « 512000 Banque principale » au
montant brut. Deux conséquences, dont la seconde n'était pas visible :

**1. Le résultat était surévalué.** Aucune charge n'enregistrait les frais
Stripe — `recordStripeFeesFromPayment` existait mais n'était appelé nulle
part. Chaque club voyait un résultat gonflé du total exact de ses
commissions.

**2. Le solde bancaire dérivait, et rien ne pouvait le détecter.** Chaque
paiement débitait 512000 du brut, alors que le virement Stripe crédite le
compte réel du net. L'écart se cumulait à chaque encaissement. Aucun
modèle de rapprochement n'existe au schéma, et les colonnes de lettrage
FEC sont exportées vides : personne n'aurait jamais vu l'écart.

Corollaire vérifié à la lecture du code : le compte PCG `512300 — Stripe
transit` était **déjà seedé** et `kindFromMethod(STRIPE_CARD)` renvoyait
déjà `STRIPE_TRANSIT`. Mais aucun `ClubFinancialAccount` de ce type
n'était créé, et `seedDefaultPaymentRoutes` pointait explicitement
`STRIPE_CARD` sur la banque — route explicite consultée en premier par
`resolveForPayment`. L'infrastructure existait, elle n'était pas câblée.

## Décision

**Les encaissements Stripe créditent un compte de transit dédié 512300.**

Le cycle complet :

| Mouvement | Écriture |
|---|---|
| Encaissement | DÉBIT 512300 (brut) |
| Frais Stripe | CRÉDIT 512300 / DÉBIT 627000 |
| Remboursement | CRÉDIT 512300 / DÉBIT 706100 |
| Virement (`payout.paid`) | CRÉDIT 512300 / DÉBIT 512000 |

Le transit retombe naturellement à zéro à chaque virement, et son solde
intermédiaire est **exactement** ce que Stripe doit au club. Vérifié en
conditions réelles le 2026-07-19 : 100 € encaissés − 40 € remboursés
− 3,50 € de frais = **56,50 €** en attente de virement.

**Règle qui en découle, et qui a coûté trois correctifs :** la
contrepartie de trésorerie de tout mouvement lié à un paiement est le
compte **où ce paiement est réellement tombé** — figé sur l'écriture de
recette — jamais un mapping générique ni « le plus récent de la facture ».
Une facture peut porter plusieurs encaissements sur des comptes
différents : une échéance Stripe sur le transit, un règlement en espèces
en caisse.

## Alternatives écartées

**Garder 512000 et n'ajouter que la charge de frais.** Corrige le résultat,
laisse le solde bancaire dériver indéfiniment. C'est la moitié du
problème, et la moitié invisible.

**Rendre le compte configurable par club.** Double le nombre de chemins à
tester pour un bénéfice nul tant qu'aucun club ne l'a demandé. Le compte
financier reste modifiable à la main par le trésorier si le besoin
apparaît.

## Migration des clubs existants

`repointStripeRouteToTransit` redirige la route `STRIPE_CARD` des clubs
créés avant, sous **deux** conditions :

- `isDefault: true` — la route n'a jamais été touchée par un humain.
  `ClubPaymentRoutesService.upsert` pose désormais `false` dès qu'un
  trésorier choisit son compte. **Sans ce marqueur le filtre serait
  inerte**, le champ valant `true` par défaut au schéma — et comme le seed
  tourne aussi sur les chemins de lecture, le choix disparaîtrait au
  rechargement de l'écran où il vient d'être fait.
- la route pointe encore sur la **banque par défaut**, c'est-à-dire
  exactement l'état produit par l'ancien seed. On corrige un défaut de
  fabrique identifié, pas « tout ce qui n'est pas le transit ».

## Conséquence à annoncer

Brancher la charge de frais fait **mécaniquement baisser** le résultat
affiché de tous les clubs, du montant exact de leurs commissions. C'est
la correction d'une surévaluation, pas une régression — mais un trésorier
qui voit son résultat chuter sans explication ouvrira un ticket.

Par ailleurs, l'écriture de frais arrive avec un décalage : la balance
transaction Stripe n'existe généralement pas encore au moment du webhook,
carte comprise. Le balayage horaire la récupère ensuite. Le résultat est
donc juste à l'heure près, pas à l'instant.

## Déploiement

`payout.paid` doit être **abonné** sur les destinations webhook (test ET
live, périmètre « Comptes connectés ») **avant** la mise en production.
Sans l'abonnement, le transit se remplit sans jamais être soldé — état
pire que celui d'avant. Cf. la règle de l'[ADR-0009](0009-echeancier-paiement-clubflow.md) :
souscrire un événement dans le code ne suffit pas.

## Lié

- [ADR-0008](0008-stripe-connect-express.md) — direct charges
- [ADR-0009](0009-echeancier-paiement-clubflow.md) — tableau des événements webhook
- [ADR-0011](0011-remboursement-eteint-la-creance.md) — ce que devient la
  créance quand on rembourse : c'est l'écriture d'avoir décrite ici qui
  matérialise ce choix
- [pitfalls/compta-non-seedee-webhook-500.md](../pitfalls/compta-non-seedee-webhook-500.md)
