# Piège — `backdrop-filter` enferme les descendants `position: fixed`

## Symptôme

Aucune erreur. Une feuille plein écran (`position: fixed; inset: 0`)
rendue depuis un composant de la top-bar apparaît comme une bande de
56 px de haut, coupée, et un menu « bottom sheet » (`bottom: 0`) se cale
sous la barre au lieu du bas de l'écran.

Mesuré dans le navigateur le 2026-09-09, admin mobile 375×812 :

```
.cf-gs-sheet             { top: 0,    height: 55 }   // attendu : height 812
.cf-club-switcher__menu  { top: -132, bottom: 55 }   // attendu : bottom 812
```

## Contexte

La top-bar de l'admin porte `backdrop-filter: blur(20px)` (effet verre
dépoli du design Stitch, cf. `design stitch/DESIGN.md`). La feuille de
recherche mobile (`GlobalSearchBar` en mode `sheet`) et le menu du
`ClubSwitcher` sont rendus **dans** cette barre.

## Cause root

Comme `transform`, `filter`, `perspective`, `contain: paint` ou
`will-change: transform`, la propriété `backdrop-filter` (valeur autre que
`none`) fait de l'élément le **bloc conteneur** de ses descendants en
`position: fixed`. `inset: 0` se résout alors sur la barre (56 px), pas
sur le viewport. C'est spécifié (Filter Effects 2), pas un bug navigateur.

## Solution

Sous 900 px la top-bar perd son flou (`apps/admin/src/mobile.css`) :

```css
.cf-topbar {
  background: #fff;
  -webkit-backdrop-filter: none;
  backdrop-filter: none;
}
```

Le desktop garde le verre dépoli : sa liste déroulante de recherche est
en `position: absolute`, pas `fixed`, et n'a pas besoin de sortir de la
barre.

## Pourquoi NE PAS faire X

- ❌ Monter le `z-index` : le problème n'est pas l'empilement mais le bloc
  conteneur ; la feuille reste enfermée dans 56 px.
- ❌ Passer la feuille en `createPortal(…, document.body)` pour le
  ClubSwitcher : son click-outside (`ref.current.contains(e.target)`)
  traiterait tout le portail comme extérieur et refermerait le menu au
  `mousedown`, avant que le `click` de l'option ne parte. Possible pour la
  recherche (pas de click-outside), inutile si le flou est retiré.

## Détection

```js
const el = document.querySelector('.cf-gs-sheet');
el.getBoundingClientRect().height !== window.innerHeight
// → chercher un ancêtre avec backdrop-filter / filter / transform ≠ none
```

## Lié

- [pitfalls/grid-1fr-minimum-auto-deborde.md](grid-1fr-minimum-auto-deborde.md)
  — l'autre débord silencieux rencontré en construisant la couche mobile
- `apps/admin/src/mobile.css` — la couche mobile de l'admin
