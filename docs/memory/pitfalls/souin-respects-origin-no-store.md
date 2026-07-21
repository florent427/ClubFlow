# Piège — Souin (cache-handler Caddy) refuse de cacher malgré default_cache_control

## Symptôme

```
Cache-Status: Souin; fwd=uri-miss; key=GET-https-<host>-/; detail=PRIVATE-OR-AUTHENTICATED-RESPONSE
```

Répété identiquement sur chaque requête (jamais `hit`), alors que la
directive `cache { default_cache_control "public, s-maxage=30" }` est
bien présente et que `caddy validate` charge la config sans erreur.

## Contexte

Vitrine ClubFlow servie derrière Caddy + module
[cache-handler](https://github.com/caddyserver/cache-handler) (Souin),
installé pour contourner un souci de cache Next.js côté origine (cf.
[nextjs-route-force-dynamic-headers-cookies.md](nextjs-route-force-dynamic-headers-cookies.md)).
L'origine (Next.js `next start`) renvoie `Cache-Control: private,
no-cache, no-store, max-age=0, must-revalidate` sur toutes ses réponses.

## Cause root

Souin est conforme RFC 7234/9111 : une réponse marquée `private` ou
`no-store` par l'origine ne doit **jamais** être mise en cache par un
cache partagé, point final. `default_cache_control` ne s'applique que
si l'origine **ne renvoie aucun** `Cache-Control` — ce n'est pas un
override, c'est un fallback. Avec une origine qui envoie explicitement
`no-store`, `default_cache_control` n'a aucun effet.

## Solution

Réécrire le `Cache-Control` de la réponse **avant** qu'elle ne remonte
vers le handler `cache` — via `header_down` **dans le `reverse_proxy`
lui-même**, pas via une directive `header` séparée (évite tout souci
d'ordre de directives). Avec `order cache before reverse_proxy`,
`reverse_proxy` est l'handler le plus interne : sa réécriture de header
est donc déjà appliquée quand `cache` (qui l'englobe) inspecte la
réponse.

```caddyfile
{
    order cache before reverse_proxy
    cache {
        ttl 30s
        stale 2m
    }
}

exemple.tld {
    @cacheable {
        not header_regexp Cookie mon_cookie_sensible=
    }
    cache @cacheable {
        default_cache_control "public, s-maxage=30, stale-while-revalidate=120"
    }
    reverse_proxy @cacheable localhost:5275 {
        header_down Cache-Control "public, s-maxage=30, stale-while-revalidate=120"
    }
    reverse_proxy localhost:5275
}
```

Deux `reverse_proxy` : le premier (matché `@cacheable`) réécrit le
header et sert de cible à `cache` ; le second (sans matcher, donc
requêtes non-cacheable comme celles avec le cookie sensible) proxy tel
quel, `Cache-Control: no-store` d'origine préservé — la mise en cache
Souin ne s'applique de toute façon pas à ces requêtes (`cache
@cacheable` ne les matche pas), mais préserver le header d'origine sur
ce chemin évite aussi que le **navigateur** du visiteur mette en cache
une réponse sensible (mode édition, session authentifiée…).

## Vérification

```bash
curl -s -o /dev/null -D - https://exemple.tld/ | grep -i cache-status
# 1er hit : fwd=uri-miss; stored
# 2e+  : hit; ttl=<n>
```

## Pourquoi NE PAS faire

- ❌ Augmenter `ttl`/ajouter `stale` en pensant que le souci vient de la
  durée — le souci n'a rien à voir avec la durée, la réponse n'entre
  jamais en cache du tout tant que `no-store` n'est pas neutralisé.
- ❌ Mettre `header_down` dans un `reverse_proxy` unique sans matcher —
  réécrirait le `Cache-Control` de **toutes** les requêtes, y compris
  celles qui doivent rester `no-store` (session admin, contenu
  personnalisé) : fuite potentielle via le cache navigateur/CDN en aval.

## Lié

- [nextjs-route-force-dynamic-headers-cookies.md](nextjs-route-force-dynamic-headers-cookies.md)
- [caddyfile-log-block-inline-vs-multiline.md](caddyfile-log-block-inline-vs-multiline.md)
