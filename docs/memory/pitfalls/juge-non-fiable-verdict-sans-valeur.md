# Le juge non fiable : un verdict rendu sur un signal dont on n'a pas vérifié le sens

## Symptôme

Un test, un script E2E ou un moniteur rend un verdict **net et faux** — dans
un sens ou dans l'autre :

- **Faux rouge** : « la session est toujours payable, le correctif ne marche
  pas » alors que le code est bon.
- **Faux vert** : « le refus métier fonctionne » alors que la requête était
  simplement invalide.
- **Verdict absent lu comme un verdict** : « statut inconnu, on continue
  d'attendre » alors que l'outil de mesure est cassé.

Le point commun n'est pas le résultat, c'est sa **source** : on a interprété
un signal dont on avait **supposé** la sémantique au lieu de la vérifier.

## Trois occurrences, trois formes

| Signal utilisé | Ce qu'on croyait | Ce qu'il valait vraiment |
|---|---|---|
| Code HTTP d'une URL Stripe Checkout | expirée ⇒ redirection 3xx | **200 dans les deux cas** — la page est une application qui affiche ensuite le message |
| Erreur GraphQL renvoyée par l'API | refus métier | souvent une **erreur de validation** : requête invalide, aucun métier exécuté |
| Sortie de `eas build:view --non-interactive` | build en cours | **flag invalide** : la commande échoue, le moniteur boucle indéfiniment |

Le premier a failli me faire « corriger » du code qui fonctionnait — le
correctif venait pourtant d'être validé par 13 tests unitaires. Le deuxième
a rendu des scripts verts pour la mauvaise raison. Le troisième a fait
tourner un moniteur toute une nuit sur un build fini en une heure.

## Pourquoi c'est difficile à voir

Un juge non fiable ne se signale jamais : il rend un verdict **plausible et
catégorique**. Rien ne distingue à l'œil un « 200 = payable » d'un
« 200 = page servie quel que soit l'état ». Et comme le verdict est net, il
inspire confiance — d'autant plus quand il **confirme** ce qu'on craignait.

Le danger maximal est le faux rouge sur du code correct : il pousse à
« réparer » ce qui marche, et donc à casser pour de bon.

## La règle

Avant de faire dépendre une conclusion d'un signal, se poser **une** question :

> **Est-ce que je sais, pour l'avoir vérifié, ce que ce signal vaut dans les
> deux cas — succès ET échec ?**

Si la réponse est « je suppose », alors :

1. **Établir la ligne de base.** Mesurer le signal dans l'état connu-bon
   *et* dans l'état connu-mauvais. S'ils ne diffèrent pas, le signal ne
   discrimine rien — il faut en changer.
2. **Préférer un observable dont on connaît la sémantique.** Ici : demander
   son état à Stripe (`checkout.sessions.retrieve(...).status` → `open` puis
   `expired`), ou lire une trace en base que le code n'écrit que dans un cas
   précis. Un observable qu'on a soi-même écrit vaut mieux qu'un signal tiers
   interprété.
3. **Distinguer « échec » de « je ne sais pas ».** Un juge qui ne peut pas
   conclure doit le DIRE, jamais tomber par défaut sur un verdict. Toute
   boucle d'attente doit être bornée.
4. **Ne pas laisser un juge invalide en place.** Le retirer ou le neutraliser
   en expliquant pourquoi — sinon le prochain passage refera l'erreur.

## Le garde-fou qui a marché

Sur les scripts E2E GraphQL, un garde explicite tue la classe entière du faux
vert : toute erreur ressemblant à de la validation **avorte le script** au lieu
d'être comptée comme un refus métier.

```js
if (/Cannot query|must not have|Unknown argument|Unknown type/i.test(msg)) {
  console.error(`REQUÊTE INVALIDE (pas un refus métier) : ${msg}`);
  process.exit(1);
}
```

Il a fonctionné dès le premier lancement du script d'expiration de session :
`memberLogin` n'existait pas (c'est `login`), et le script s'est arrêté net
au lieu de conclure quoi que ce soit.

## Rencontré

2026-07-20 au 2026-07-22 — moniteur EAS, scripts E2E boutique, puis
vérification de l'expiration des sessions Stripe.

## Lié

- [test-verifie-la-forme-pas-le-comportement.md](test-verifie-la-forme-pas-le-comportement.md)
  — le cousin : le test observe la bonne chose, mais au mauvais niveau.
- [prisma-executeraw-pour-retour-void.md](prisma-executeraw-pour-retour-void.md)
  — un faux client qui diverge du vrai est lui aussi un juge non fiable.
- [eas-build-view-non-interactive.md](eas-build-view-non-interactive.md)
- [echec-silencieux-chemin-erreur.md](echec-silencieux-chemin-erreur.md)
