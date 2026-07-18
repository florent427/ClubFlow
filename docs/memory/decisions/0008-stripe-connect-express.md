# ADR-0008 — Stripe Connect Express + direct charges (encaissement multi-tenant)

## Statut

✅ **Accepté** — 2026-07-18
🟢 **Pas d'historique à migrer** — le code v1 est déployé mais n'a **jamais
été activé en prod** (clés Stripe absentes du `.env`), donc aucun paiement
réel n'a transité par le compte plateforme. Voir « Migration ».

## Contexte

Stripe est **déjà en production** depuis la v1, mais sur un montage
**mono-compte plateforme** :

- une seule `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` lues en env,
  process-wide ;
- `new Stripe(key)` sans `stripeAccount` — aucune trace de Connect
  (`application_fee_amount`, `transfer_data`, `on_behalf_of` absents) ;
- `ClubFinancialAccount.stripeAccountId` (`acct_xxx`) est saisi dans l'UI
  admin et persisté, mais **jamais transmis au SDK** — le schéma le
  documente explicitement « informatif en v1 (pas de discriminator
  multi-Stripe) ».

**Conséquence : l'argent de tous les clubs tombe sur le même compte
Stripe** (celui de la plateforme). Ce n'est pas seulement un problème
opérationnel (reversements manuels, rapprochement impossible) : encaisser
pour le compte de tiers puis reverser relève de l'activité d'établissement
de paiement, avec les obligations réglementaires associées.

Le périmètre encaissant actuel est la **facture d'adhésion** payée par
carte depuis le portail membre / mobile (Checkout hébergé + webhook
`payment_intent.succeeded` idempotent + écriture comptable auto).

## Options évaluées

### Option A : Statu quo — compte plateforme unique
- ✅ Rien à faire, ça marche déjà
- ❌ ClubFlow détient les fonds de tiers → encaissement pour compte de
  tiers, statut réglementaire à assumer
- ❌ Reversement manuel à chaque club, réconciliation ingérable à l'échelle
- ❌ Un litige/chargeback d'un club impacte le compte de tous

### Option B : Clé Stripe propre à chaque club (chiffrée en base)
- ✅ Pas de Connect à implémenter ; pattern de chiffrement AES-256-GCM
  déjà éprouvé (clé OpenRouter par club, `aiOpenrouterApiKeyEnc`)
- ✅ ClubFlow ne touche jamais l'argent
- ❌ Chaque club doit créer et gérer son propre compte Stripe (friction
  d'onboarding forte pour des associations)
- ❌ **Aucune commission plateforme possible** automatiquement
- ❌ ClubFlow manipule des clés secrètes de production de tiers

### Option C : Stripe Connect **Standard**
- ✅ Argent direct au club, KYC porté par Stripe
- ✅ Le club a son dashboard Stripe complet
- ❌ Onboarding plus lourd côté club, UX non maîtrisée
- ❌ Support : le club gère seul, ClubFlow a peu de visibilité

### Option D : Stripe Connect **Express**
- ✅ Argent **direct au club** — ClubFlow ne détient jamais les fonds
- ✅ Onboarding et KYC **hébergés par Stripe** (AccountLink), friction
  minimale pour une association
- ✅ ClubFlow garde la main sur l'UX et voit l'état du compte
  (`charges_enabled`, `payouts_enabled`, `details_submitted`)
- ✅ Compatible `application_fee_amount` → commission activable plus tard
- ❌ Implémentation à faire (onboarding, webhooks comptes connectés,
  migration de l'historique)

## Décision

**Option D — Stripe Connect Express, en `direct charges`.**

La Checkout Session est créée **sur le compte connecté du club** :

```ts
stripe.checkout.sessions.create(params, { stripeAccount: club.stripeAccountId })
```

Le club est le **marchand de référence** : le paiement, les fonds et les
payouts vivent sur son compte. ClubFlow orchestre, n'encaisse pas.

### Commission plateforme : préparée, désactivée

La question « ClubFlow prélève-t-il une commission ? » n'est **pas
tranchée** à ce jour. Le choix des *direct charges* est précisément ce qui
permet de la trancher plus tard **sans migration** : il suffira d'ajouter
`application_fee_amount` aux paramètres de session. Tant que la décision
n'est pas prise, aucun `application_fee` n'est envoyé.

C'est la raison principale de préférer *direct charges* à *destination
charges* : les deux vont chez le club, mais direct charges laisse le club
marchand de référence tout en gardant la commission possible.

## Conséquences

### Positives
- ClubFlow sort du périmètre « encaissement pour compte de tiers »
- Litiges/chargebacks isolés par club
- Payouts gérés par Stripe vers le compte bancaire du club
- Modèle de revenus (commission) activable sans refonte
- `ClubFinancialAccount.stripeAccountId` cesse d'être décoratif

### Négatives / à traiter
- **Onboarding obligatoire par club** : tant que `charges_enabled` est
  faux, le club ne peut pas encaisser en ligne → il faut un état
  intermédiaire propre dans l'UI (et ne pas casser les clubs qui
  n'ont pas encore onboardé).
- **Webhooks** : les événements des comptes connectés arrivent avec le
  champ `account` renseigné. Le handler doit router par compte, et non
  plus supposer un compte unique.
- **Historique** : les paiements déjà encaissés l'ont été sur le compte
  **plateforme**. Leurs remboursements devront rester sur ce compte. Il
  faut donc **tracer sur quel compte chaque `Payment` a été réalisé**
  (sinon on casse le remboursement de l'historique).
- **Staging** : aucune variable Stripe dans `.env.staging.example`
  aujourd'hui → le tunnel de paiement n'est pas testable hors prod, ce qui
  contredit la règle « valider sur staging avant prod ». À corriger en
  préalable.

## Migration

**Constat du 2026-07-18** : le `.env` de production ne contient
**ni `STRIPE_SECRET_KEY` ni `STRIPE_WEBHOOK_SECRET`**. Or
`StripeCheckoutService.getStripe()` lève une `BadRequestException` quand la
clé est absente : aucune Checkout Session n'a donc jamais pu être créée en
prod, donc aucun webhook, donc **aucun `Payment` de méthode `STRIPE_CARD`**.
Le paiement en ligne est du code déployé mais **dormant**.

Conséquence : **il n'y a pas d'historique à ménager.** On implémente Connect
Express directement, sans chemin de compatibilité mono-compte :

1. Ajouter l'état Connect au schéma (compte + statut KYC). Tracer malgré
   tout le compte Stripe utilisé sur chaque `Payment` — non pour la
   migration, mais pour pouvoir rembourser sur le bon compte si un club
   change de compte connecté plus tard.
2. Onboarding Express (AccountLink) + webhook `account.updated` pour
   suivre `charges_enabled` / `payouts_enabled`.
3. Créer les sessions sur `stripeAccount` du club. Si le club n'est pas
   onboardé → refuser proprement le paiement en ligne (message explicite),
   **plutôt que** de retomber sur le compte plateforme.

⚠️ Corollaire : activer Stripe en prod (poser les clés) **avant** d'avoir
Connect reviendrait à ouvrir le montage mono-compte que cet ADR écarte.
Poser les clés Stripe en prod seulement à la mise en service de Connect.

## Quand reconsidérer

- Si ClubFlow décide d'assumer un statut d'établissement/agent de paiement
  (alors le compte plateforme redevient envisageable)
- Si le besoin de commission devient central au point de justifier des
  *destination charges* (marchand de référence = ClubFlow)
- Si Stripe fait évoluer Connect Express de façon incompatible
- Si un club exige son propre contrat Stripe négocié (→ Standard pour ce
  club, cohabitation possible)

## Lié

- [runbooks/restore-env.md](../../runbooks/restore-env.md) — secrets
  `STRIPE_*` et `AI_SECRETS_KEY`
- [ADR-0006 — Multi-tenant par path](0006-path-based-multi-tenant.md)
