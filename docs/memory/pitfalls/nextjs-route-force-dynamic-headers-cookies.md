# Piège — une route Next.js reste 100% dynamique malgré un refactor headers()/cookies()

## Symptôme

```
Cache-Control: private, no-cache, no-store, max-age=0, must-revalidate
```

Sur **chaque** page de la vitrine, sur **chaque** requête, TTFB constant
(~750ms depuis l'Europe), aucun gain même sur des requêtes identiques
répétées.

## Contexte

En Next.js 15 stable (pas de PPR/`cacheComponents`, réservé à Next 16),
appeler `headers()` ou `cookies()` **n'importe où** dans l'arbre de rendu
d'une route — y compris un `cookies()` appelé pour un visiteur anonyme
sans le cookie recherché — désactive tout cache statique/ISR pour
**cette route entière**, sur toutes les requêtes suivantes. Sur ClubFlow,
`resolveCurrentClub()` (host via `headers()`) et `isEditModeActive()`
(cookie admin via `cookies()`) étaient appelées depuis le root layout et
`VitrinePageShell`, donc sur 100% des pages.

## Cause root et solution : 3 pièges empilés, chacun masquant le suivant

Le refactor complet a demandé de lever **trois** blocages successifs, où
corriger le premier révèle seulement le suivant (chaque fois validé par
un build qui « réussit » sans erreur) :

**1. `headers()`/`cookies()` dans le render path.**
Solution : le host et le mode édition (cookie) sont résolus dans
`middleware.ts` (qui s'exécute *avant* le pipeline de rendu React, donc
sans jamais désactiver de cache) puis réécrits comme segments de route
via `NextResponse.rewrite()` — `[host]`/`[editFlag]` deviennent des
`params`, la seule API « dynamique » qui reste cacheable par valeur.
L'URL visible du visiteur ne change pas.

**2. Dossier préfixé par `_` = "private folder" Next.js.**
Un dossier `app/_sites/...` est **silencieusement exclu du routing** par
convention Next.js App Router. Résultat : `next build` réussit, mais
`routes-manifest.json` ne contient **aucune route** sous ce préfixe →
404 sur tout, alors que les fichiers sources sont bien présents et bien
déployés. Rien dans les logs ne le signale.
→ Détection : `find .next -name routes-manifest.json -exec grep -o
'<ton-dossier>[^"]*' {} \;` doit lister tes routes. Si rien ne sort,
vérifie que le dossier ne commence pas par `_`.
→ Solution : renommer (`_sites` → `sites`).

**3. Segment dynamique sans `generateStaticParams` = toujours dynamique.**
Même une fois `headers()`/`cookies()` éliminés et le dossier renommé,
`next build` classait encore la route `ƒ` (Dynamic) et non `●` (SSG).
Sans `generateStaticParams` défini **nulle part** sur le segment
dynamique (même un layout parent ne suffit pas — cf. doc Next.js : un
layout ne peut générer que pour *son propre* segment, une page peut
couvrir aussi les segments parents), Next.js ne l'inscrit jamais dans le
mécanisme de fallback ISR ; il reste inconditionnellement dynamique.
→ Solution : exporter `generateStaticParams` retournant `[]` sur
**chaque page** (pas seulement le layout). Le marqueur de build passe de
`ƒ` à `● (SSG, fallback)`.

## Ce qui reste ouvert

Même après les 3 fixes ci-dessus (build montre `●`, `fallback: null`
dans `prerender-manifest.json`), le `Cache-Control` observé en
conditions réelles sur `next start` self-hosted (pas Vercel) **restait**
`no-store`, et rien n'était écrit dans `.next/server/app/...` pour les
combinaisons de params servies. Cause non identifiée malgré plusieurs
cycles de déploiement (pas d'erreur dans les logs, permissions OK).
Hypothèse non confirmée : le Full Route Cache ne supporte peut-être pas
« varier par Host via un rewrite middleware » de la même façon qu'un
`generateStaticParams` connu au build.

**Contournement retenu** : cache HTTP indépendant côté Caddy (module
Souin/cache-handler) plutôt que de continuer à deviner côté interne
Next.js — cf. [souin-respects-origin-no-store.md](souin-respects-origin-no-store.md).

## Pourquoi NE PAS faire

- ❌ Supposer qu'ajouter `generateStaticParams` vide suffit à voir un
  `Cache-Control` cacheable en sortie — vérifié faux ici, il faut
  vérifier le header réel, pas seulement le marqueur `●` du build.
- ❌ Chercher l'erreur dans les logs applicatifs quand un dossier
  `_prefixed` avale silencieusement des routes — `next build` ne remonte
  aucun warning pour ça.

## Lié

- [nextjs-isr-cache-stale.md](nextjs-isr-cache-stale.md) — autre piège
  ISR vitrine, symptôme différent (404 après insert DB)
- [souin-respects-origin-no-store.md](souin-respects-origin-no-store.md)
