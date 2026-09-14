# Piège — Throttler derrière Caddy sans `trust proxy` : un seul compteur pour toute la plateforme

## Symptôme

```
ThrottlerException: Too Many Requests
```

La réponse arrive sur `login` (ou `registerContact`, `verifyEmail`…) pour
**tout le monde en même temps**, dès que la plateforme entière dépasse la
limite d'une opération : 20 connexions par minute pour `login`, tous clubs
confondus. Au démarrage, rien ne l'annonce, et en temps normal rien ne se voit.

## Contexte

L'API tourne derrière Caddy, qui relaie vers `localhost:3000`, en prod comme
sur staging. `@nestjs/throttler` compte par `req.ip`, avec une clé
« classe + méthode + adresse ». `GqlThrottlerGuard` ne change que la façon de
lire `req` depuis le contexte GraphQL.

## Cause root

Sans `trust proxy`, Express prend l'adresse de la socket. Or la socket est
celle de Caddy, 127.0.0.1, pour chaque visiteur. Le compteur « par adresse »
devient donc un compteur global :
- la 21ᵉ connexion de la minute est refusée à tout le monde ;
- vingt requêtes volontaires suffisent à bloquer toutes les connexions.

## Solution

`apps/api/src/common/http/trust-local-proxy.ts`, appelé dans `main.ts` :

```ts
app.set('trust proxy', 'loopback');
```

`loopback` ne croit que 127.0.0.1 et ::1. `req.ip` devient la dernière adresse
de `X-Forwarded-For` qui ne vient pas de là : celle que Caddy a vue.

Le test `trust-local-proxy.spec.ts` monte un vrai serveur GraphQL et vérifie
trois cas :
- deux visiteurs ont chacun leur compteur ;
- une adresse inventée en tête d'en-tête ne remet pas le compteur à zéro ;
- sans confiance au proxy local, tout le monde partage un compteur.

## Détection rapide

Sur staging, tout dans la même minute :

1. **Depuis le poste** : 21 tentatives de connexion avec une adresse bidon. La
   21ᵉ répond « Too Many Requests ».
   ```bash
   for i in $(seq 1 21); do curl -s https://staging.api.clubflow.topdigital.re/graphql \
     -H 'content-type: application/json' \
     --data '{"query":"mutation($i: LoginInput!){ login(input: $i){ accessToken } }","variables":{"i":{"email":"sonde@test.invalid","password":"x"}}}' \
     | head -c 90; echo; done
   ```
2. **Depuis une autre adresse** : une tentative depuis le VPS lui-même, via son
   domaine public.
   ```bash
   "/c/Windows/System32/OpenSSH/ssh.exe" clubflow@46.62.197.93 "curl -s https://staging.api.clubflow.topdigital.re/graphql -H 'content-type: application/json' --data '<même corps>' | head -c 90"
   ```
3. **Lecture** :
   - le VPS reçoit aussi « Too Many Requests » : le défaut est là ;
   - il reçoit « Identifiants invalides ou compte inaccessible. » : c'est corrigé.

## Cas observés

- 2026-09-14 : relevé par l'audit des plans de mars (plan inscription/OAuth,
  tâche 6).
  - **Avant correction** : défaut reproduit sur staging. Le poste est bloqué à
    la 21ᵉ tentative, puis la tentative du VPS, faite depuis une autre adresse,
    l'est aussi.
  - **Prod** : Caddy relaie vers `localhost:3000` et aucun `trust proxy`
    n'était posé.

## Pourquoi NE PAS faire

- ❌ **`app.set('trust proxy', true)`** : Express prend alors la PREMIÈRE
  adresse de `X-Forwarded-For`, que le client écrit lui-même. En la changeant
  à chaque requête, il remet son compteur à zéro.
- ❌ **Un `getTracker` qui lit `x-forwarded-for` à la main
  (`split(',')[0]`)** : c'est la même faille, en plus discret.
- ❌ **Un nombre de sauts (`trust proxy: 1`)** : juste aujourd'hui, faux le jour
  où un autre proxy s'ajoute devant Caddy.
- ❌ **Chercher des refus dans les logs de l'API pour conclure « jamais
  arrivé »** : le refus part dans la réponse GraphQL et ne s'écrit pas dans
  le journal. Sur staging, `grep -c ThrottlerException` donnait 0 juste après
  un refus provoqué. Seul le test à deux adresses tranche. Voir
  [pitfalls/juge-non-fiable-verdict-sans-valeur.md](juge-non-fiable-verdict-sans-valeur.md).

## Lié

- `apps/api/src/common/http/trust-local-proxy.ts` et son test
- `docs/knowledge/infra-network.md` : Caddy relaie vers `localhost:3000`
- `docs/superpowers/roadmap/2026-09-14-audit-anciens-plans.md`, point 1.2
- [pitfalls/mot-de-passe-compte-non-verifie.md](mot-de-passe-compte-non-verifie.md) : l'autre correctif du même lot
