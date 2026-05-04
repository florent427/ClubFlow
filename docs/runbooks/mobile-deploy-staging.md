# Runbook — Déployer l'app mobile membre en staging (EAS Build, Android APK)

> Mise en ligne staging de `apps/mobile/` (Expo SDK 55, RN 0.83) sur Android.
> APK installable directement sur n'importe quel phone Android via lien de
> téléchargement Expo. iOS (TestFlight) nécessite Apple Developer Account
> $99/an — pas couvert par ce runbook.

## Coût

EAS Free tier : **30 builds gratuits / mois**, suffisant pour staging perso.
Au-delà : EAS Production $99/mo (10x quota) — pas nécessaire avant des
volumes prod réels.

## Pré-requis (à faire 1× — ~10 min)

### 1. Compte Expo (gratuit)

1. https://expo.dev/signup — crée le compte avec ton email
2. Note ton username Expo (ex `florent427`)

### 2. EAS CLI installé localement

```powershell
npm install -g eas-cli
eas --version
# Doit afficher >= 17.0
```

### 3. Login EAS dans ce projet

```powershell
cd apps/mobile
eas login
# Entre tes credentials Expo
eas whoami  # vérifie
```

### 4. Lier le projet Expo

```powershell
cd apps/mobile
eas init
# - Si demandé "Create new project for @<user>/clubflow-mobile?" → Yes
# - Note le projectId généré (ajouté auto à app.json sous expo.extra.eas.projectId)
```

⚠️ **Commit le `app.json` modifié** (avec le projectId) sinon les builds ne fonctionneront pas en CI.

## Premier build staging Android

```powershell
cd apps/mobile
npm run build:android:staging
# = eas build --profile preview --platform android
```

Ce que ça fait :
- Upload le code (sans node_modules) vers les serveurs Expo
- Build cloud Android (~5-10 min)
- Output : APK avec :
  - `EXPO_PUBLIC_API_BASE=https://staging.api.clubflow.topdigital.re` (depuis `eas.json` profile preview)
  - Channel updates `staging` (pour OTA si plus tard)
- Lien de download affiché à la fin (et sur https://expo.dev/accounts/<user>/projects/clubflow-mobile/builds)

## Installer l'APK sur ton phone Android

1. Ouvre le lien Expo build sur ton phone (envoyé par mail ou copié depuis dashboard)
2. Click "Install" — Android demande d'autoriser "Sources inconnues" → Settings → activer pour le browser
3. L'app `ClubFlow` s'installe avec icône
4. Lance — tu te connectes avec tes credentials staging :
   - Email : `florent.morel427@gmail.com`
   - Mot de passe : `StagingClubFlow2026!` (ou celui que tu as choisi)

## Vérifier que ça pointe bien sur staging API

Une fois l'app ouverte, le réseau doit aller vers `https://staging.api.clubflow.topdigital.re`.
Pour vérifier sans tools :
- L'app charge sans erreur réseau → API joignable
- Tu vois le club "Demo Staging" et les utilisateurs/données staging (pas la prod)

Si problème : check `EXPO_PUBLIC_API_BASE` dans le bundle :
```powershell
# Sur le dashboard Expo build → "View artifact" → unzip APK → check assets/index.android.bundle
```

## Cycles suivants : MAJ via EAS Update (OTA, sans re-build natif)

⚠️ **Pré-requis** : installer `expo-updates` dans le projet (à faire 1×).

```powershell
cd apps/mobile
npx expo install expo-updates
# Modifie app.json pour activer expo-updates (auto)
```

Ensuite, à chaque fix JS-only (pas de modif natif), tu push une OTA :

```powershell
cd apps/mobile
eas update --branch staging --message "fix login form"
```

L'app installée détecte la maj au prochain démarrage et la télécharge en
arrière-plan (ou immédiatement). Pas besoin de re-installer l'APK.

## Quand re-build l'APK est nécessaire

Re-build (= nouvelle install APK requise) si tu changes :
- `app.json` (icon, splash, permissions, plugins)
- Une dépendance native (ex: `expo-camera`, `expo-notifications`)
- Le bundle identifier
- L'API URL (sauf si tu utilises un override JS)
- La version Expo SDK

OTA suffit si tu changes :
- Du code JS/TS pur (composants, screens, API calls)
- Des assets (images sans modif app.json)
- Du style

## Distribution beta à plusieurs testeurs

Le lien Expo build d'un APK est partageable. Mais EAS propose aussi :
1. **Internal Distribution** (jusqu'à 100 devices) : email d'invitation depuis
   le dashboard Expo, le testeur reçoit un lien custom
2. **Google Play Internal Testing** : upload AAB → distribution privée via Play Store
   (nécessite Play Console $25 one-shot)

Pour staging perso, le lien direct suffit.

## Workflow staging → prod

```powershell
# Test feature en staging
cd apps/mobile
npm run build:android:staging  # ou eas update --branch staging
# Test sur ton phone
# OK → prod build :
npm run build:android:production
# Output AAB pour Play Store (nécessite Play Console)
```

⚠️ **Production iOS** nécessite Apple Developer Account ($99/an) — pas couvert ici.
Quand tu en auras un, ajouter dans `eas.json` :
- `apple-id` côté `submit.production`
- bundle identifier déjà set (`re.topdigital.clubflow`)
- Run `eas build --profile production --platform ios` puis `eas submit --platform ios`

## Quand ça ne marche pas

| Symptôme | Cause | Action |
|---|---|---|
| `eas build` "No projectId" | `eas init` pas fait | `cd apps/mobile && eas init` |
| Build fail "package missing" | `package` manquant dans `android` du app.json | Vérifier `re.topdigital.clubflow` |
| APK installe mais crash au launch | API_BASE pointe sur localhost | Vérifier eas.json profile preview env block |
| App charge mais "Failed to fetch" | CORS staging API ne whitelist pas mobile | Mobile envoie pas d'Origin → `CORS_ALLOW_NO_ORIGIN=true` côté API staging .env |
| OTA update non reçue | `expo-updates` pas installé OU channel mal configuré | `npx expo install expo-updates` + check `expo.updates.url` dans app.json |

## Lié

- [apps/mobile/eas.json](../../apps/mobile/eas.json) — config build EAS
- [apps/mobile/.env.staging](../../apps/mobile/.env.staging) — env staging mobile
- [docs/runbooks/staging-vps-bootstrap.md](staging-vps-bootstrap.md) — VPS staging API
- Expo EAS docs : https://docs.expo.dev/build/introduction/
- Expo Updates : https://docs.expo.dev/eas-update/introduction/
