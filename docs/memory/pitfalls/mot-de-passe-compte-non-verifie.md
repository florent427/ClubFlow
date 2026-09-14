# Piège — Mot de passe d'un compte non vérifié : l'écraser OU le garder ouvre une reprise de compte

## Symptôme

Aucun. Un tiers se connecte au compte de quelqu'un d'autre, avec **son propre**
mot de passe, après que le vrai titulaire a confirmé son adresse. Rien ne
casse, rien ne s'écrit dans les logs, et un test qui se contente de vérifier
que « le mot de passe est enregistré » reste vert.

## Contexte

Une inscription (`registerContact`, `createClubAndAdmin`) arrive avec l'adresse
d'un compte existant dont l'e-mail n'est pas encore vérifié. Ce compte peut
venir :
- d'une inscription abandonnée ;
- du formulaire du site ou d'un événement public ;
- d'un tiers malveillant.

Personne n'a encore prouvé qu'il lit la boîte.

## Cause root

Deux règles « évidentes », deux failles :

- **Écraser** (la règle jusqu'au 2026-09-14) :
  1. Camille s'inscrit.
  2. Avant qu'elle clique, un tiers se réinscrit avec son propre mot de passe.
  3. Un nouveau lien part chez Camille, et l'ancien est invalidé.
  4. Elle clique : l'adresse est vérifiée, avec le mot de passe du tiers.
- **Garder le premier** : le tiers inscrit l'adresse de Camille en premier et
  attend. Quand Camille s'inscrit puis clique, le mot de passe actif est encore
  celui du tiers.

Trois cas voisins relèvent de la même famille :
- **Google relié à un compte jamais vérifié** : le mot de passe posé à
  l'inscription restait valide.
- **Compte vérifié rattaché à un nouveau club sans son mot de passe** :
  connaître l'adresse suffisait.
- **Réponse de l'inscription** : elle révélait qu'un compte existait.

## Solution

`AuthService.passwordForUnverifiedAccount`, utilisé par l'inscription et par la
création de club :

| Situation du compte non vérifié | Mot de passe | Noms, clubs |
|---|---|---|
| Même mot de passe que le compte | gardé | mis à jour |
| Pas de mot de passe et aucun lien en cours | celui choisi | mis à jour |
| Sinon : conflit | **aucun** | inchangés |

En conflit, le lien de confirmation dit qu'aucun mot de passe n'est actif et
renvoie vers « Mot de passe oublié ». Cette page est désormais ouverte aux
comptes vérifiés sans mot de passe.

Autres règles du lot :
- **Compte vérifié** : rejoindre un club exige son mot de passe. Sans lui, rien
  n'est créé et le titulaire reçoit « vous avez déjà un compte ». La réponse
  reste celle d'une inscription neuve.
- **Google sur un compte jamais vérifié** : le mot de passe est effacé.

`auth.service.spec.ts` joue la scène entière : inscriptions, clic sur le
dernier lien reçu, puis connexion du tiers, qui doit échouer.

## Risque restant, assumé

Un tiers inscrit l'adresse de Camille, qui ne s'est jamais inscrite. Si Camille
ouvre quand même ce lien qu'elle n'a pas demandé, le compte s'active avec le
mot de passe du tiers. L'e-mail dit explicitement de ne pas l'ouvrir.

La seule parade complète est de faire choisir le mot de passe après la
confirmation, et non dans le formulaire. Cela change le parcours du portail et
de l'application mobile.

## Pourquoi NE PAS faire

- ❌ **Refuser la réinscription d'une adresse en attente** : la réponse dirait
  qu'un compte existe (énumération), et bloquerait qui a perdu son premier
  e-mail.
- ❌ **Arbitrer sur l'ordre d'arrivée des inscriptions** : l'attaquant choisit
  son moment, avant ou après.
- ❌ **Tester seulement « le mot de passe est mis à jour »** : les deux règles
  fautives passent un tel test. Le test utile se termine par la connexion du
  tiers. Voir
  [pitfalls/test-verifie-la-forme-pas-le-comportement.md](test-verifie-la-forme-pas-le-comportement.md).

## Cas observés

- 2026-09-14 : relevé par l'audit des plans de mars (inscription contact/OAuth,
  T4 S5 et T7 S3) et corrigé dans le lot sécurité.

## Lié

- [pitfalls/signup-unverified-email-blocks-login.md](signup-unverified-email-blocks-login.md) : pourquoi la connexion exige une adresse vérifiée
- [pitfalls/throttler-sans-trust-proxy.md](throttler-sans-trust-proxy.md) : l'autre correctif du même lot
- `docs/superpowers/roadmap/2026-09-14-audit-anciens-plans.md`, point 1.1
