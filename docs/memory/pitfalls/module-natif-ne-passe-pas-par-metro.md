# `Cannot find native module` : un module natif ne s'installe pas par Metro

## Symptôme

Après un `npm install expo-web-browser` (ou `expo-updates`, ou tout autre
module à partie native), l'application plante au lancement :

```
Cannot find native module 'ExpoWebBrowser'
```

Le code est correct, l'import résout, le bundle se construit sans erreur.
Metro sert la nouvelle version du JS — et pourtant le module « n'existe
pas ».

## Cause

Metro ne transporte que du **JavaScript**. Un module Expo à partie native
a besoin d'être **compilé dans le binaire** : le code Kotlin/Swift, le
registre des modules natifs, les permissions du manifeste. Rien de tout
cela ne peut arriver par le bundler.

Le dev-client installé sur le téléphone est donc un binaire **figé** à la
liste de modules natifs présents au moment de sa construction. Ajouter une
dépendance native après coup ne le met pas à jour ; il continue de servir
un JS qui référence un module qu'il ne contient pas.

## Solution

Reconstruire le dev-client, puis réinstaller l'APK sur l'appareil :

```bash
cd apps/mobile
eas build --profile development --platform android
```

Rien à faire côté Metro : une fois le nouveau binaire installé, le même
bundle fonctionne.

## Le corollaire qui coûte cher : ces builds sont LONGS

Un build EAS prend en pratique **1 à 4 heures** sur ce projet, pas quinze
minutes. Planifier en conséquence : regrouper toutes les dépendances
natives prévues (`expo-web-browser`, `expo-updates`, `expo-dev-client`…)
**dans une seule reconstruction** au lieu d'en enchaîner trois.

Vérifier la durée réelle avant d'annoncer une estimation :

```bash
eas build:list --limit 5    # colonnes de début / fin
```

## Rencontré

2026-07-20/21, ajout de `expo-web-browser` pour le retour de paiement puis
de `expo-updates`. Cf.
[eas-build-view-non-interactive.md](eas-build-view-non-interactive.md) pour
la manière de suivre un build sans le perdre de vue.

## Lié

- [openauthsession-exige-scheme-custom.md](openauthsession-exige-scheme-custom.md)
- [eas-build-view-non-interactive.md](eas-build-view-non-interactive.md)
