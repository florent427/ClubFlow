# L'échec qui ne dit rien : un chemin d'erreur muet se lit comme « rien ne s'est passé »

## Symptôme

L'utilisateur signale « ça se recharge sans rien dire », « ça revient à zéro »,
« je vois l'écran d'avant ». **Pas de message d'erreur, pas de crash** — juste
une action qui semble n'avoir aucun effet, ou un état qui réapparaît.

C'est le symptôme le plus trompeur qui soit : il n'y a **rien à grep**, aucune
trace dans les logs, et l'utilisateur décrit une conséquence (« ça recharge »)
qui est souvent la cause exacte, prise au mot.

## Le motif — rencontré 3× dans la seule journée du 2026-07-20/21

Chaque fois, une garantie ou une erreur était **avalée** au lieu d'être dite :

1. **Rattachement de fiche muet** (`member-account-link`) — `linkInvoice`
   écrasait en silence le lien d'une facture déjà rattachée ailleurs. Aucune
   erreur ; l'écart ne se voyait qu'au contrôle comptable.
2. **Conflit d'activation muet** (`member-account-activation`) — le rattachement
   par e-mail échouait sans un mot quand l'index unique `(clubId, userId)`
   refusait la place déjà prise. C'est ce silence qui a produit l'incident
   « je tombe sur une autre fiche ».
3. **Erreur de login furtive** (`session-expiry-policy`) — un login raté était
   traité comme une session expirée : l'errorLink émettait
   `SESSION_EXPIRED_EVENT`, la navigation se réinitialisait vers Login, l'écran
   se **remontait** et son `error` repassait à `null`. Le message « mot de passe
   incorrect » disparaissait avant d'être lu.

Le point commun n'est pas technique, il est de conception : **du code qui gère
un cas d'échec sans le rendre visible**. Un `catch` sans message, un `updateMany`
dont on ignore le `count`, un remontage d'écran qui efface un état d'erreur, un
événement global qui réagit trop largement.

## Pourquoi on ne le trouve pas par grep

Il n'y a pas de message d'erreur à chercher — c'est précisément le problème. On
le débusque en se demandant, de chaque chemin d'échec : **« si ça rate ici,
est-ce que quelqu'un le voit ? »** Si la réponse est non, c'est le piège.

## La règle

Un chemin d'erreur doit produire un signal proportionné à sa gravité :

- une **garantie** (unicité, tenant, dernier admin) → l'écriture conditionnelle
  porte le prédicat, on teste le `count`, et un `count` inattendu LÈVE en
  nommant le conflit. Jamais un `catch` muet, jamais un lien volé en silence.
- une **erreur métier** affichée à l'utilisateur → elle doit RESTER à l'écran
  jusqu'à ce qu'il agisse. Se méfier de tout ce qui remonte l'écran ou
  réinitialise la navigation en réaction à une erreur : ça efface le message.
- un **effet de bord global** (errorLink, listener d'événement) → vérifier qu'il
  ne se déclenche pas trop large. Un handler « session expirée » ne doit pas
  s'armer sur un login raté : avant authentification, il n'y a pas de session.

## Le test qui mord

Un correctif de ce type ne vaut que si un test échoue quand le silence revient.
Extraire la décision en fonction PURE (sans dépendance framework) la rend
testable ; la neutraliser doit faire rougir au moins un test. Cf. le trio
`shouldExpireSession`, le prédicat de `linkInvoice`, la détection du conflit
d'activation — les trois sont couverts par un test qui reconstitue le silence.

## Lié

- [garantie-derriere-effet-de-bord.md](garantie-derriere-effet-de-bord.md) — le
  cousin : une garantie posée derrière un effet de bord qui peut échouer.
- [test-verifie-la-forme-pas-le-comportement.md](test-verifie-la-forme-pas-le-comportement.md)
  — un test vert pour une mauvaise raison est un silence de plus.
