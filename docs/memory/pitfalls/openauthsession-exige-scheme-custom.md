# Retour de paiement mobile : `openAuthSessionAsync` exige un schéma custom, pas une URL https

## Symptôme

Après un paiement Stripe depuis l'application mobile, on **n'atterrit pas
dans l'app** mais dans le portail membre web, souvent déconnecté. Le
navigateur intégré ne se referme jamais tout seul. L'utilisateur doit tuer
l'app et la rouvrir pour voir la commande passer à « Payée ».

Rien n'échoue : le paiement est bien encaissé. C'est le *retour* qui est
cassé, et il l'est silencieusement.

## Cause

`WebBrowser.openAuthSessionAsync(url, returnUrl)` ne referme sa fenêtre que
lorsque la navigation atteint une URL préfixée par `returnUrl`, et
**`returnUrl` doit être un schéma custom de l'application** (`clubflow://`).

Passer une URL https ne marche pas : le système ne sait pas qu'elle
appartient à l'app. Pour qu'un lien https soit capté, il faudrait des
**App Links Android / Universal Links iOS vérifiés** — fichiers
`assetlinks.json` / `apple-app-site-association` servis sur le domaine,
empreinte de signature, propagation. Hors de proportion pour un retour de
paiement.

Or Stripe, lui, **refuse une `success_url` en schéma custom** : il n'accepte
que http(s). Les deux contraintes sont inconciliables directement — c'est
là que le piège se referme.

## Solution : une page-pont statique

Stripe redirige vers une page https servie par le portail, qui rebondit
immédiatement vers le schéma custom :

```
Stripe ──https──> {PORTAIL}/app-return.html?paid=1 ──clubflow://──> app
```

La page vit dans `apps/member-portal/public/app-return.html` (donc copiée
telle quelle dans `dist/` par Vite, sans build).

Deux règles de sécurité, non négociables :

- le schéma cible est **écrit en dur** dans la page, jamais lu depuis
  l'URL — sinon c'est une redirection ouverte ;
- seuls `paid` et `canceled` sont propagés, rien d'autre.

Côté API, le `returnPath` du checkout bascule sur le pont dès que l'appel
vient du natif (`nativeApp: true`), et la mutation retourne le
`paymentReturnUrl` que le mobile passera à `openAuthSessionAsync`.

## Le webhook reste asynchrone : ne jamais présumer le paiement

Revenir dans l'app avec `paid=1` signifie **« Stripe a accepté »**, pas
« la commande est PAID en base » — c'est le webhook qui la bascule, un peu
plus tard. D'où, côté mobile : un `refetch` immédiat **puis** un second
différé (~3,5 s) pour rattraper le webhook.

Et surtout, la lecture du retour ne présume rien : un `type: 'success'`
**sans marqueur `paid=1` reconnu** est traité comme un abandon. On préfère
afficher « en attente » à tort qu'annoncer un paiement qui n'a pas eu lieu.

## Rencontré

2026-07-20/21, boutique puis factures. **Trouvé par Florent, pas par moi** :
j'avais livré la première version en croyant l'architecture correcte, et
elle ne pouvait structurellement pas fonctionner. Les tests unitaires de
`interpretStripeReturn` étaient verts — ils testaient l'interprétation du
retour, jamais le fait qu'un retour arrive.

## Lié

- [echec-silencieux-chemin-erreur.md](echec-silencieux-chemin-erreur.md) —
  un retour qui n'arrive jamais est un silence de plus.
- [module-natif-ne-passe-pas-par-metro.md](module-natif-ne-passe-pas-par-metro.md)
  — `expo-web-browser` a d'abord fait planter l'app pour cette raison.
