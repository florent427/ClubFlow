# Piège — `1fr` vaut `minmax(auto, 1fr)` : un texte nowrap élargit la colonne hors écran

## Symptôme

Aucune erreur, et `document.documentElement.scrollWidth === innerWidth`
(zéro débord horizontal) parce que `.cf-shell { overflow-x: clip }`.
Pourtant le tiers droit du panneau est hors champ : la méta des cartes et
le bouton « message » n'apparaissent jamais.

Mesuré le 2026-09-09, admin mobile 375 px :

```
members-panel members-panel--table   right = 467   // viewport = 375
```

## Contexte

`apps/admin/src/mobile.css` passait la grille Membres en une colonne avec
`.members-loom__grid { grid-template-columns: 1fr }`. Le panneau contient
la liste en cartes (`.cf-cardlist__row`, flex) dont le sous-titre — un
e-mail — est en `white-space: nowrap`.

## Cause root

`1fr` est un raccourci de `minmax(auto, 1fr)` : le **minimum** de la
piste est la taille min-content de son contenu. La contribution
min-content d'une rangée flex est la somme de celles de ses enfants, et
`min-width: 0` sur l'enfant n'y change rien (il n'agit que dans
l'algorithme flex, pas sur la contribution remontée à la grille). Un
e-mail de trente caractères sans césure impose donc ~470 px à la piste.

`overflow-x: clip` sur la coquille cache ensuite le débord à tout outil
qui lit `scrollWidth`.

## Solution

`minmax(0, 1fr)` pour toute grille à une colonne :

```css
.members-loom__grid { grid-template-columns: minmax(0, 1fr); }
```

Le socle le faisait déjà via `.members-loom__grid--single`, écrasé par la
règle mobile. Pour la mesure, ne pas se fier à `scrollWidth` :

```js
[...document.querySelectorAll('body *')].filter(
  (e) => e.getBoundingClientRect().right > innerWidth + 1 &&
    getComputedStyle(e).position !== 'fixed',
);
```

## Pourquoi NE PAS faire X

- ❌ `overflow: hidden` sur le panneau : masque le symptôme, la carte reste
  coupée.
- ❌ `word-break: break-all` partout : casse noms et e-mails n'importe où.
  `overflow-wrap: anywhere` sur le seul titre suffit.

## Lié

- [pitfalls/backdrop-filter-bloc-conteneur-fixed.md](backdrop-filter-bloc-conteneur-fixed.md)
  — l'autre piège silencieux de la même session
- `apps/admin/src/mobile.css` — la couche mobile de l'admin
