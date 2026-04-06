# Application mobile Expo (ClubFlow) — Plan d’implémentation

> **Pour exécution agentique :** skill **requis** : `superpowers:subagent-driven-development` (recommandé) ou `superpowers:executing-plans`. Les étapes utilisent la syntaxe `- [ ]` pour le suivi.

**Objectif :** Ajouter `apps/mobile/`, une application **Expo (React Native)** qui consomme la même API GraphQL que le portail membre (`http://localhost:3000/graphql` en dev), avec connexion email/mot de passe, sélection de profil si besoin, et un écran d’accueil minimal affichant `viewerMe`.

**Architecture :** Client Apollo aligné sur `apps/member-portal/src/lib/apollo.ts` (JWT `Authorization` + en-tête `x-club-id`) ; persistance via **AsyncStorage** avec les **mêmes clés** que le portail (`clubflow_member_*`) pour cohérence métier ; navigation **React Navigation** (stack) ; en-tête optionnel `x-clubflow-client: mobile` pour distinguer les clients côté API/logs. Aucun changement Prisma dans ce plan ; un ajustement **CORS** côté API est prévu **si** les requêtes natives sont rejetées (les clients React Native n’envoient souvent pas d’en-tête `Origin` comme un navigateur).

**Tech stack :** Expo (SDK récent), TypeScript, `@apollo/client`, `graphql`, `@react-native-async-storage/async-storage`, `@react-navigation/native`, `@react-navigation/native-stack`, `react-native-safe-area-context`, `react-native-screens`.

**Références existantes :** `apps/member-portal/src/lib/apollo.ts`, `storage.ts`, `documents.ts`, `auth-types.ts`, `viewer-documents.ts`, `viewer-types.ts`, `pages/LoginPage.tsx`, `pages/SelectProfilePage.tsx`.

---

## Carte des fichiers

| Fichier | Rôle |
|---------|------|
| `apps/mobile/package.json` | Dépendances Expo, Apollo, navigation, AsyncStorage (généré puis complété). |
| `apps/mobile/app.json` ou `app.config.ts` | Métadonnées Expo ; peut charger `EXPO_PUBLIC_*`. |
| `apps/mobile/.env.example` | Modèle `EXPO_PUBLIC_GRAPHQL_HTTP` (sans secrets). |
| `apps/mobile/README.md` | Lancement, URL API (émulateur vs appareil physique), lien avec l’API ClubFlow. |
| `apps/mobile/src/lib/storage.ts` | `getToken` / `setToken` / `getClubId` / etc. via AsyncStorage, mêmes clés que le portail. |
| `apps/mobile/src/lib/apollo.ts` | `HttpLink` + `authLink` (Bearer + `x-club-id` + `x-clubflow-client`). |
| `apps/mobile/src/lib/documents.ts` | `LOGIN_WITH_PROFILES`, `VIEWER_PROFILES`, `SELECT_VIEWER_PROFILE`, `SELECT_VIEWER_CONTACT_PROFILE`, `VIEWER_ME` (copie des définitions du portail). |
| `apps/mobile/src/lib/auth-types.ts` | Types `LoginWithProfilesData`, profils, mutations de sélection (copie ciblée depuis le portail). |
| `apps/mobile/src/lib/viewer-types.ts` | `ViewerMeData` (copie ciblée). |
| `apps/mobile/src/screens/LoginScreen.tsx` | Formulaire email / mot de passe, mutation login, navigation. |
| `apps/mobile/src/screens/SelectProfileScreen.tsx` | Liste des profils + sélection (réutilise la logique du portail). |
| `apps/mobile/src/screens/HomeScreen.tsx` | `useQuery(VIEWER_ME)` + texte de bienvenue + bouton déconnexion. |
| `apps/mobile/App.tsx` | `NavigationContainer`, `ApolloProvider`, stack Login / SelectProfile / Home. |
| `apps/api/src/main.ts` | **Si besoin** : assouplir CORS pour requêtes sans `Origin` (développement ou flag env). |

---

### Tâche 1 : Générer le projet Expo dans `apps/mobile`

**Fichiers :**
- Créer : tout l’arborescence `apps/mobile/` via CLI Expo
- Test : `cd apps/mobile && npx expo-doctor` (si disponible) ou `npx tsc --noEmit`

- [ ] **Étape 1 :** Depuis la racine du dépôt `ClubFlow`, exécuter (PowerShell, répertoire parent existant) :

```powershell
Set-Location C:\Users\flore\ClubFlow
npx create-expo-app@latest apps/mobile --template blank-typescript
```

Attendu : création de `apps/mobile` avec `App.tsx`, `package.json`, `tsconfig.json`, sans erreur fatale.

- [ ] **Étape 2 :** Ouvrir `apps/mobile/package.json` et renommer le champ `"name"` en `"clubflow-mobile"` (slug npm cohérent avec le monorepo).

- [ ] **Étape 3 :** Vérifier que le projet compile.

```powershell
Set-Location C:\Users\flore\ClubFlow\apps\mobile
npx tsc --noEmit
```

Attendu : code de sortie 0.

- [ ] **Étape 4 :** Commit.

```bash
git add apps/mobile
git commit -m "chore(mobile): scaffold Expo app (TypeScript blank)"
```

---

### Tâche 2 : Dépendances runtime (Apollo, navigation, stockage)

**Fichiers :**
- Modifier : `apps/mobile/package.json` (via `npm install`)

- [ ] **Étape 1 :** Installer les paquets :

```powershell
Set-Location C:\Users\flore\ClubFlow\apps\mobile
npm install @apollo/client graphql @react-native-async-storage/async-storage
npm install @react-navigation/native @react-navigation/native-stack react-native-screens react-native-safe-area-context
```

- [ ] **Étape 2 :** Pour Expo, s’assurer que les dépendances natives sont cohérentes (Expo peut proposer `npx expo install` pour versions alignées). Si la CLI signale un décalage :

```powershell
npx expo install react-native-screens react-native-safe-area-context
```

- [ ] **Étape 3 :** Commit.

```bash
git add apps/mobile/package.json apps/mobile/package-lock.json
git commit -m "feat(mobile): add Apollo, navigation, AsyncStorage"
```

---

### Tâche 3 : Variables d’environnement et documentation locale

**Fichiers :**
- Créer : `apps/mobile/.env.example`
- Modifier : `apps/mobile/.gitignore` (si le template n’ignore pas `.env`)

- [ ] **Étape 1 :** Créer `apps/mobile/.env.example` avec exactement :

```env
# URL du endpoint GraphQL (dev : même machine que l’API Nest, port 3000).
# Émulateur Android : souvent http://10.0.2.2:3000/graphql
# Appareil physique : IP LAN de la machine, ex. http://192.168.1.10:3000/graphql
EXPO_PUBLIC_GRAPHQL_HTTP=http://localhost:3000/graphql
```

- [ ] **Étape 2 :** Si `.env` n’est pas listé dans `apps/mobile/.gitignore`, ajouter une ligne `.env`.

- [ ] **Étape 3 :** Commit.

```bash
git add apps/mobile/.env.example apps/mobile/.gitignore
git commit -m "docs(mobile): env example for GraphQL URL"
```

---

### Tâche 4 : Couche `storage` (AsyncStorage, clés alignées portail)

**Fichiers :**
- Créer : `apps/mobile/src/lib/storage.ts`

- [ ] **Étape 1 :** Créer le fichier avec le contenu suivant (reprise logique de `apps/member-portal/src/lib/storage.ts`, API synchrone remplacée par des fonctions async — **l’appelant utilisera `await`**).

```ts
import AsyncStorage from '@react-native-async-storage/async-storage';

const TOKEN_KEY = 'clubflow_member_token';
const CLUB_ID_KEY = 'clubflow_member_club_id';
const CONTACT_ONLY_KEY = 'clubflow_member_contact_only';

export async function getToken(): Promise<string | null> {
  return AsyncStorage.getItem(TOKEN_KEY);
}

export async function setToken(token: string): Promise<void> {
  await AsyncStorage.setItem(TOKEN_KEY, token);
}

export async function getClubId(): Promise<string | null> {
  return AsyncStorage.getItem(CLUB_ID_KEY);
}

export async function setClubId(clubId: string): Promise<void> {
  await AsyncStorage.setItem(CLUB_ID_KEY, clubId);
}

export async function clearClubId(): Promise<void> {
  await AsyncStorage.removeItem(CLUB_ID_KEY);
}

export async function clearAuth(): Promise<void> {
  await AsyncStorage.multiRemove([TOKEN_KEY, CLUB_ID_KEY, CONTACT_ONLY_KEY]);
}

export async function setMemberSession(
  token: string,
  clubId: string,
): Promise<void> {
  await setToken(token);
  await setClubId(clubId);
  await AsyncStorage.removeItem(CONTACT_ONLY_KEY);
}

export async function setMemberContactSession(
  token: string,
  clubId: string,
): Promise<void> {
  await setToken(token);
  await setClubId(clubId);
  await AsyncStorage.setItem(CONTACT_ONLY_KEY, '1');
}

export async function isContactOnlySession(): Promise<boolean> {
  return (await AsyncStorage.getItem(CONTACT_ONLY_KEY)) === '1';
}

export async function hasMemberSession(): Promise<boolean> {
  const token = await getToken();
  const clubId = await getClubId();
  return Boolean(token && clubId);
}
```

- [ ] **Étape 2 :** Commit.

```bash
git add apps/mobile/src/lib/storage.ts
git commit -m "feat(mobile): AsyncStorage session keys aligned with member portal"
```

---

### Tâche 5 : Client Apollo + documents GraphQL + types

**Fichiers :**
- Créer : `apps/mobile/src/lib/apollo.ts`
- Créer : `apps/mobile/src/lib/documents.ts`
- Créer : `apps/mobile/src/lib/auth-types.ts`
- Créer : `apps/mobile/src/lib/viewer-types.ts`

- [ ] **Étape 1 :** Créer `apps/mobile/src/lib/apollo.ts` — utiliser `setContext` async pour lire AsyncStorage avant chaque requête :

```ts
import { ApolloClient, HttpLink, InMemoryCache } from '@apollo/client';
import { setContext } from '@apollo/client/link/context';
import * as storage from './storage';

const uri =
  process.env.EXPO_PUBLIC_GRAPHQL_HTTP ?? 'http://localhost:3000/graphql';

const httpLink = new HttpLink({ uri, credentials: 'include' });

const authLink = setContext(async (_, { headers }) => {
  const token = await storage.getToken();
  const clubId = await storage.getClubId();
  return {
    headers: {
      ...headers,
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(clubId ? { 'x-club-id': clubId } : {}),
      'x-clubflow-client': 'mobile',
    },
  };
});

export const apolloClient = new ApolloClient({
  link: authLink.concat(httpLink),
  cache: new InMemoryCache(),
  defaultOptions: {
    watchQuery: { fetchPolicy: 'network-only' },
    query: { fetchPolicy: 'network-only' },
  },
});
```

- [ ] **Étape 2 :** Créer `apps/mobile/src/lib/documents.ts` en copiant depuis `apps/member-portal/src/lib/documents.ts` les exports suivants avec le **même** `gql` : `LOGIN_WITH_PROFILES`, `VIEWER_PROFILES`, `SELECT_VIEWER_PROFILE`, `SELECT_VIEWER_CONTACT_PROFILE`. Copier depuis `apps/member-portal/src/lib/viewer-documents.ts` l’export `VIEWER_ME` (requête complète telle quelle).

- [ ] **Étape 3 :** Créer `apps/mobile/src/lib/auth-types.ts` avec les types utilisés par ces écrans (copier depuis `apps/member-portal/src/lib/auth-types.ts`) : `ViewerProfile`, `LoginWithProfilesData`, `ViewerProfilesQueryData`, `SelectProfileData`, `SelectContactProfileData`.

- [ ] **Étape 4 :** Créer `apps/mobile/src/lib/viewer-types.ts` en copiant uniquement `ViewerMeData` depuis `apps/member-portal/src/lib/viewer-types.ts`.

- [ ] **Étape 5 :** Lancer `npx tsc --noEmit` dans `apps/mobile`.

- [ ] **Étape 6 :** Commit.

```bash
git add apps/mobile/src/lib/apollo.ts apps/mobile/src/lib/documents.ts apps/mobile/src/lib/auth-types.ts apps/mobile/src/lib/viewer-types.ts
git commit -m "feat(mobile): Apollo client and GraphQL documents for login and viewer"
```

---

### Tâche 6 : Écrans Login, sélection de profil, accueil

**Fichiers :**
- Créer : `apps/mobile/src/screens/LoginScreen.tsx`
- Créer : `apps/mobile/src/screens/SelectProfileScreen.tsx`
- Créer : `apps/mobile/src/screens/HomeScreen.tsx`
- Modifier : `apps/mobile/App.tsx`

- [ ] **Étape 1 :** Créer `LoginScreen.tsx` — logique alignée sur `apps/member-portal/src/pages/LoginPage.tsx` : `useMutation(LOGIN_WITH_PROFILES)` ; si un seul profil, `setMemberSession` puis navigation vers `Home` ; si plusieurs, `clearClubId` puis navigation vers `SelectProfile` ; si contact seulement (`contactClubId` sans profils), `setMemberContactSession` puis `Home` ; sinon message d’erreur. Utiliser `TextInput`, `Button`, `Text`, `ActivityIndicator` de `react-native`. Les appels à `storage` sont **async** (`await setToken`, etc.).

- [ ] **Étape 2 :** Créer `SelectProfileScreen.tsx` — s’inspirer de `SelectProfilePage.tsx` : `useQuery(VIEWER_PROFILES)` ; boutons par profil ; mutations `SELECT_VIEWER_PROFILE` / `SELECT_VIEWER_CONTACT_PROFILE` ; après succès, mettre à jour le token si renvoyé, `setMemberSession`, navigation vers `Home`.

- [ ] **Étape 3 :** Créer `HomeScreen.tsx` : `useQuery<ViewerMeData>(VIEWER_ME)` ; afficher prénom/nom ; bouton « Déconnexion » appelant `clearAuth` + navigation vers `Login`.

- [ ] **Étape 4 :** Remplacer le contenu de `apps/mobile/App.tsx` par une stack React Navigation : écrans `Login`, `SelectProfile`, `Home` ; au montage, utiliser `hasMemberSession()` (async) pour décider de l’écran initial (écran « splash » ou état de chargement jusqu’à résolution). Passer `navigation` aux écrans via props typées ou hooks `useNavigation`.

- [ ] **Étape 5 :** `npx tsc --noEmit` dans `apps/mobile`.

- [ ] **Étape 6 :** Commit.

```bash
git add apps/mobile/App.tsx apps/mobile/src/screens
git commit -m "feat(mobile): login, profile selection, and home viewer screen"
```

---

### Tâche 7 : README et test manuel avec l’API locale

**Fichiers :**
- Créer : `apps/mobile/README.md`

- [ ] **Étape 1 :** Créer `apps/mobile/README.md` avec les sections : prérequis (API sur port 3000, Docker db) ; copier `.env.example` vers `.env` et ajuster l’URL ; commandes `npm install`, `npx expo start` ; note **émulateur Android** (`10.0.2.2`) vs **iOS simulateur** (`localhost`) vs **appareil physique** (IP LAN) ; référence au skill `restart-clubflow` pour l’API ; comptes seed identiques au portail (`admin@clubflow.local`, etc.).

- [ ] **Étape 2 :** Démarrer l’API (`apps/api`, `npm run start:dev`) et l’app (`npx expo start`). Vérifier connexion + affichage `viewerMe`.

- [ ] **Étape 3 :** Si les requêtes échouent avec erreur CORS / préflight : passer à la Tâche 8. Sinon commit README seul.

```bash
git add apps/mobile/README.md
git commit -m "docs(mobile): README for local API and Expo"
```

---

### Tâche 8 (conditionnelle) : CORS API pour clients sans en-tête `Origin`

**Fichiers :**
- Modifier : `apps/api/src/main.ts`
- Modifier : `apps/api/.env.example` (si nouveau flag documenté)

- [ ] **Étape 1 :** Reproduire l’échec (logs navigateur ou message réseau sur l’app Expo).

- [ ] **Étape 2 :** Adapter `enableCors` dans `apps/api/src/main.ts` pour autoriser les requêtes **sans** `Origin` en développement, par exemple en utilisant la forme fonctionnelle de l’option `origin` du package `cors` : si `!origin`, appeler `callback(null, true)` lorsque `NODE_ENV !== 'production'` **ou** lorsque `process.env.CORS_ALLOW_NO_ORIGIN === 'true'`. Conserver les origines existantes pour le web.

Exemple de structure (à intégrer proprement avec les variables `adminOrigins` et `isProd` déjà présentes) :

```ts
app.enableCors({
  origin: (
    origin: string | undefined,
    callback: (err: Error | null, allow?: boolean) => void,
  ) => {
    if (!origin) {
      if (!isProd || process.env.CORS_ALLOW_NO_ORIGIN === 'true') {
        return callback(null, true);
      }
      return callback(new Error('Not allowed by CORS'));
    }
    const allowed =
      adminOrigins.includes(origin) ||
      /^http:\/\/127\.0\.0\.1:\d+$/.test(origin) ||
      /^http:\/\/localhost:\d+$/.test(origin);
    return callback(null, allowed);
  },
  credentials: true,
});
```

- [ ] **Étape 3 :** Relancer l’API et retester l’app mobile.

- [ ] **Étape 4 :** Commit.

```bash
git add apps/api/src/main.ts apps/api/.env.example
git commit -m "fix(api): allow CORS for clients without Origin (mobile dev)"
```

---

## Revue (checklist auteur)

1. **Couverture :** répertoire `apps/mobile` créé ; login ; profils ; home `viewerMe` ; env ; README ; correctif CORS si nécessaire.
2. **Placeholders :** aucun « TBD » dans les étapes ci‑dessus.
3. **Cohérence :** clés storage et documents GraphQL alignés avec le portail ; `authLink` lit token/club de façon async.

---

## Exécution

**Plan enregistré sous :** `docs/superpowers/plans/2026-04-04-app-mobile-expo-clubflow.md`

**Deux modes d’exécution possibles :**

1. **Subagent-driven (recommandé)** — un sous-agent par tâche, relecture entre les tâches, itération rapide. Skill : `superpowers:subagent-driven-development`.

2. **Exécution inline** — enchaîner les tâches dans la même session avec le skill `superpowers:executing-plans`.

**Laquelle préférez-vous ?**
