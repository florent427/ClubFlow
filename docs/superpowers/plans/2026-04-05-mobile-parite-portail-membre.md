# Parité app mobile — portail membre (ClubFlow) — Plan d’implémentation

> **Pour exécution agentique :** skill **requis** : `superpowers:subagent-driven-development` (recommandé) ou `superpowers:executing-plans`. Les étapes utilisent la syntaxe `- [ ]` pour le suivi.

**Objectif :** Faire de `apps/mobile` un client **équivalent** au portail web `apps/member-portal` pour les personnes connectées : mêmes **espaces** (membre complet vs contact seul), mêmes **écrans** (tableau de bord, progression, planning, famille & facturation, paramètres), mêmes **requêtes GraphQL** et règles (`hideMemberModules`, payeur, espace foyer partagé), sans dupliquer l’**app admin** Vite (l’admin reste une app web ; le bouton « Administration » ouvre le navigateur avec la limite décrite ci‑dessous).

**Architecture :** Navigation **React Navigation** : un **stack** racine (auth + shell) ; sous le shell, des **onglets inférieurs** (ou stack + drawer) calqués sur la barre basse du portail (`MemberLayout` / `ContactLayout`). Réutiliser les documents `gql` et types en les centralisant ou en les copiant depuis `apps/member-portal/src/lib/` (pas d’import direct cross‑package tant qu’il n’y a pas de package partagé). Extraire les **helpers de formatage** (`format.ts`) dans `apps/mobile/src/lib/format.ts`. Composants lourds découpés en fichiers dédiés (`JoinFamilyByPayerEmailCta`, `MemberRoleToggle`, cartes facture / créneaux).

**Tech stack :** Expo 54, React Navigation (tabs + native stack), Apollo Client 4, AsyncStorage, `expo-linking` / `Linking` pour ouvrir l’URL admin, `EXPO_PUBLIC_*` pour URLs.

**Références web à parcourir avant d’implémenter :**  
`apps/member-portal/src/App.tsx`, `MemberOrContactShell.tsx`, `MemberOnly.tsx`, `HomeEntry.tsx`, `MemberLayout.tsx`, `ContactLayout.tsx`, `pages/DashboardPage.tsx`, `ContactHomePage.tsx`, `ProgressionPage.tsx`, `PlanningPage.tsx`, `FamilyPage.tsx`, `SettingsPage.tsx`, `JoinFamilyByPayerEmailCta.tsx`, `MemberRoleToggle.tsx`, `lib/viewer-documents.ts`, `lib/documents.ts` (inscription), `lib/format.ts`, `lib/admin-switch.ts`, `lib/viewer-types.ts`.

**Limitation connue — bouton « Administration » :** Sur le web, `navigateToAdminApp` copie le JWT dans `localStorage` sous les clés `clubflow_admin_*` puis redirige vers l’admin (`apps/admin`), **même origine** ou onglet. Sur mobile, `Linking.openURL('http://localhost:5173/')` ouvre le **navigateur système** : on **ne peut pas** injecter ces clés dans le `localStorage` de l’admin. Tant que l’API n’expose pas un flux sécurisé (lien signé, WebView avec injection, SSO), le plan prévoit : **ouvrir l’URL admin** (`EXPO_PUBLIC_ADMIN_APP_URL`) ; l’utilisateur **se reconnecte** sur l’admin si besoin. Documenter dans `apps/mobile/README.md`. (Ne pas inventer de paramètre d’URL token sans spec backend.)

---

## Carte des fichiers (cible)

| Fichier / dossier | Rôle |
|-------------------|------|
| `apps/mobile/src/navigation/types.ts` | Types `RootStackParamList`, `MainTabParamList`. |
| `apps/mobile/src/navigation/MainTabs.tsx` | Onglets : Accueil, Progression, Planning, Famille, Paramètres — visibilité conditionnelle comme `MemberLayout`. |
| `apps/mobile/src/navigation/AppNavigator.tsx` | Stack : Login, SelectProfile, **Main** (tabs ou shell contact). |
| `apps/mobile/src/lib/viewer-documents.ts` | Copie / fusion des exports nécessaires depuis le portail (toutes les queries viewer utilisées). |
| `apps/mobile/src/lib/documents.ts` | Inscription / vérif e‑mail si parité auth étendue (phase 2). |
| `apps/mobile/src/lib/viewer-types.ts` | Types alignés sur `viewer-types.ts` du portail (extensions). |
| `apps/mobile/src/lib/format.ts` | Copie de `format.ts` du portail (euros, heures, calendrier, certificat). |
| `apps/mobile/src/lib/admin-switch.ts` | `adminAppTargetUrl()` + `openAdminInBrowser()` via `Linking` (pas de `localStorage` admin). |
| `apps/mobile/src/components/MemberRoleToggle.tsx` | Variantes header / segment ; appelle `openAdminInBrowser`. |
| `apps/mobile/src/components/JoinFamilyByPayerEmailCta.tsx` | Mutation + navigation vers onglet Famille. |
| `apps/mobile/src/components/SlotCard.tsx` | Carte créneau (réutilisée dashboard + planning). |
| `apps/mobile/src/screens/HomeDashboardScreen.tsx` | Parité `DashboardPage.tsx`. |
| `apps/mobile/src/screens/HomeContactScreen.tsx` | Parité `ContactHomePage.tsx`. |
| `apps/mobile/src/screens/ProgressionScreen.tsx` | Parité `ProgressionPage.tsx` (timeline grades). |
| `apps/mobile/src/screens/PlanningScreen.tsx` | Parité `PlanningPage.tsx`. |
| `apps/mobile/src/screens/FamilyScreen.tsx` | Parité `FamilyPage.tsx` (factures, listes). |
| `apps/mobile/src/screens/SettingsScreen.tsx` | Parité `SettingsPage.tsx` + cohérence navigation profil. |
| `apps/mobile/src/screens/HomeScreen.tsx` | Remplacé ou délégué à `HomeEntry` (contact vs membre). |
| `apps/mobile/.env.example` | Ajouter `EXPO_PUBLIC_ADMIN_APP_URL` (ex. `http://localhost:5173/` en dev). |

---

### Tâche 1 : Fondations navigation et shell membre / contact

**Fichiers :**
- Créer : `apps/mobile/src/navigation/types.ts`
- Créer : `apps/mobile/src/navigation/MainTabs.tsx`
- Créer : `apps/mobile/src/navigation/AppNavigator.tsx`
- Modifier : `apps/mobile/App.tsx` — déléguer le rendu à `AppNavigator` ; conserver bootstrap AsyncStorage + `ApolloProvider`.

- [ ] **Étape 1 :** Définir les types de navigation :

```ts
// apps/mobile/src/navigation/types.ts
export type MainTabParamList = {
  Home: undefined;
  Progression: undefined;
  Planning: undefined;
  Famille: undefined;
  Parametres: undefined;
};

export type RootStackParamList = {
  Login: undefined;
  SelectProfile: undefined;
  Main: undefined;
};
```

- [ ] **Étape 2 :** Installer les onglets si besoin : `npm install @react-navigation/bottom-tabs` dans `apps/mobile` (vérifier compatibilité Expo : `npx expo install @react-navigation/bottom-tabs`).

- [ ] **Étape 3 :** Implémenter `MainTabs` avec `@react-navigation/bottom-tabs` : 5 écrans ; pour l’instant brancher des **écrans placeholder** (`Text`) nommés comme les routes web. Utiliser `screenOptions` pour les icônes ( `@expo/vector-icons` déjà dispo avec Expo ).

- [ ] **Étape 4 :** Logique **contact vs membre** : lire `storage.isContactOnlySession()` au montage du groupe `Main`. Si **contact** : afficher **un seul onglet** « Espace contact » + contenu `HomeContactScreen` (Tâche 4) — soit un tab navigator réduit à un écran, soit un stack sans tabs (comme `ContactLayout` : pas de bottom bar multi‑entrées). Si **membre** : tabs complets ; masquer Progression + Planning si `hideMemberModules` (requête `VIEWER_ME` dans un wrapper ou `getFocusedRoute` + `tabBarStyle: { display: 'none' }` sur onglets masqués — préférer **ne pas enregistrer** les écrans Progression/Planning dans le tab navigator quand `hideMemberModules`, via navigator **conditionnel** ou liste d’écrans dynamique).

- [ ] **Étape 5 :** Remplacer dans le stack racine l’ancien `Home` unique par `Main` (tabs). Conserver `Login` et `SelectProfile`.

- [ ] **Étape 6 :** `cd apps/mobile && npx tsc --noEmit` — attendu : code 0.

- [ ] **Étape 7 :** Commit.

```bash
git add apps/mobile/src/navigation apps/mobile/App.tsx
git commit -m "feat(mobile): main tabs shell and contact vs member entry"
```

---

### Tâche 2 : Librairies GraphQL et `format.ts`

**Fichiers :**
- Créer / étendre : `apps/mobile/src/lib/viewer-documents.ts`
- Étendre : `apps/mobile/src/lib/viewer-types.ts`
- Créer : `apps/mobile/src/lib/format.ts`

- [ ] **Étape 1 :** Copier depuis `apps/member-portal/src/lib/viewer-documents.ts` les exports suivants **à l’identique** : `VIEWER_ADMIN_SWITCH`, `VIEWER_ME`, `VIEWER_JOIN_FAMILY_BY_PAYER_EMAIL`, `VIEWER_UPCOMING_SLOTS`, `VIEWER_FAMILY_BILLING`, `CLUB`.

- [ ] **Étape 2 :** Copier depuis `apps/member-portal/src/lib/viewer-types.ts` les types : `ViewerAdminSwitchData`, `ViewerMeData`, `ViewerUpcomingData`, `ViewerBillingData`, `ViewerSlot`, `ClubQueryData`, `ViewerJoinFamilyByPayerEmailData` (et sous‑types nécessaires pour factures).

- [ ] **Étape 3 :** Copier `apps/member-portal/src/lib/format.ts` vers `apps/mobile/src/lib/format.ts` tel quel.

- [ ] **Étape 4 :** `npx tsc --noEmit` dans `apps/mobile`.

- [ ] **Étape 5 :** Commit.

```bash
git add apps/mobile/src/lib/viewer-documents.ts apps/mobile/src/lib/viewer-types.ts apps/mobile/src/lib/format.ts
git commit -m "feat(mobile): viewer GraphQL documents and format helpers aligned with portal"
```

---

### Tâche 3 : Composants partagés — `MemberRoleToggle` et admin URL

**Fichiers :**
- Créer : `apps/mobile/src/lib/admin-switch.ts`
- Créer : `apps/mobile/src/components/MemberRoleToggle.tsx`
- Modifier : `apps/mobile/.env.example`
- Modifier : `apps/mobile/src/env.d.ts` — ajouter `EXPO_PUBLIC_ADMIN_APP_URL?: string`

- [ ] **Étape 1 :** Implémenter `adminAppTargetUrl()` :

```ts
// apps/mobile/src/lib/admin-switch.ts
import { Linking } from 'react-native';

export function adminAppTargetUrl(): string {
  const v = process.env.EXPO_PUBLIC_ADMIN_APP_URL;
  if (typeof v === 'string' && v.trim()) return v.trim();
  return 'http://localhost:5173/';
}

/** Ouvre l’admin dans le navigateur. Pas d’équivalence localStorage inter-apps (voir README). */
export function openAdminInBrowser(): void {
  const url = adminAppTargetUrl();
  void Linking.openURL(url);
}
```

- [ ] **Étape 2 :** `MemberRoleToggle` : si `canAccessClubBackOffice !== true`, retourner `null`. Sinon bouton « Administration » qui appelle `openAdminInBrowser()` (ne pas passer token ; documenter la limite).

- [ ] **Étape 3 :** `.env.example` :

```env
EXPO_PUBLIC_ADMIN_APP_URL=http://localhost:5173/
```

- [ ] **Étape 4 :** Commit.

```bash
git add apps/mobile/src/lib/admin-switch.ts apps/mobile/src/components/MemberRoleToggle.tsx apps/mobile/.env.example apps/mobile/src/env.d.ts
git commit -m "feat(mobile): admin button opens browser (documented limitation vs web SSO)"
```

---

### Tâche 4 : Écrans d’accueil — `HomeDashboardScreen` et `HomeContactScreen`

**Fichiers :**
- Créer : `apps/mobile/src/screens/HomeDashboardScreen.tsx`
- Créer : `apps/mobile/src/screens/HomeContactScreen.tsx`
- Modifier : `apps/mobile/src/navigation/MainTabs.tsx` — onglet `Home` rend soit l’un soit l’autre selon `isContactOnlySession()`.

- [ ] **Étape 1 :** `HomeContactScreen` : reprendre le contenu textuel de `ContactHomePage.tsx` (3 cartes onboarding) en `ScrollView` + `Text` + styles `StyleSheet` (pas de Material Icons obligatoire ; utiliser emoji ou `@expo/vector-icons/MaterialIcons`).

- [ ] **Étape 2 :** `HomeDashboardScreen` : porter la logique de `DashboardPage.tsx` : `useQuery` sur `VIEWER_ADMIN_SWITCH`, `VIEWER_ME`, `CLUB`, `VIEWER_UPCOMING_SLOTS` (skip si `hideMemberModules`), `VIEWER_FAMILY_BILLING`. Afficher : en‑tête club, `MemberRoleToggle`, badges grade / certificat / Telegram (si `!hideMemberModules`), résumé factures ouvertes pour payeur, liste des 3 prochains créneaux, liens de navigation vers onglets Progression / Planning / Famille via `navigation.navigate('Progression')` etc.

- [ ] **Étape 3 :** Extraire `SlotCard` dans `apps/mobile/src/components/SlotCard.tsx` (props `ViewerSlot`).

- [ ] **Étape 4 :** Intégrer `JoinFamilyByPayerEmailCta` (Tâche 5) sur le dashboard ou placeholder jusqu’à la Tâche 5.

- [ ] **Étape 5 :** `npx tsc --noEmit` ; commit.

```bash
git add apps/mobile/src/screens/HomeDashboardScreen.tsx apps/mobile/src/screens/HomeContactScreen.tsx apps/mobile/src/components/SlotCard.tsx apps/mobile/src/navigation/MainTabs.tsx
git commit -m "feat(mobile): dashboard and contact home parity with web portal"
```

---

### Tâche 5 : `JoinFamilyByPayerEmailCta` (mutation rattachement)

**Fichiers :**
- Créer : `apps/mobile/src/components/JoinFamilyByPayerEmailCta.tsx`

- [ ] **Étape 1 :** Porter la logique de `JoinFamilyByPayerEmailCta.tsx` du portail : `useQuery(VIEWER_ME)`, `useMutation(VIEWER_JOIN_FAMILY_BY_PAYER_EMAIL)` avec `refetchQueries` sur `VIEWER_ME` et `VIEWER_FAMILY_BILLING` (importer les documents depuis `viewer-documents.ts`).

- [ ] **Étape 2 :** Remplacer `useNavigate` par `useNavigation` et `navigation.navigate('Famille')` après succès.

- [ ] **Étape 3 :** UI : `Modal` ou `View` repliable avec `TextInput`, `Button`, messages d’erreur (alignés sur le web).

- [ ] **Étape 4 :** `npx tsc --noEmit` ; commit.

```bash
git add apps/mobile/src/components/JoinFamilyByPayerEmailCta.tsx
git commit -m "feat(mobile): join family by payer email CTA"
```

---

### Tâche 6 : `ProgressionScreen` et `PlanningScreen`

**Fichiers :**
- Créer : `apps/mobile/src/screens/ProgressionScreen.tsx`
- Créer : `apps/mobile/src/screens/PlanningScreen.tsx`
- Modifier : `apps/mobile/src/navigation/MainTabs.tsx` — lier les écrans.

- [ ] **Étape 1 :** `ProgressionScreen` : copier la constante `GRADE_HIERARCHY`, `findGradeIndex`, et le rendu visuel (belt + timeline) depuis `ProgressionPage.tsx` en composants RN (`View`, `ScrollView`, styles). Si `hideMemberModules`, `navigation.replace` ou redirection vers `Home` (équivalent `<Navigate to="/" />`).

- [ ] **Étape 2 :** `PlanningScreen` : `useQuery(VIEWER_ME)` puis `useQuery(VIEWER_UPCOMING_SLOTS, { skip: hideMemberModules })` ; liste des `SlotRow` réutilisant `SlotCard` ou variante large.

- [ ] **Étape 3 :** Commit.

```bash
git add apps/mobile/src/screens/ProgressionScreen.tsx apps/mobile/src/screens/PlanningScreen.tsx
git commit -m "feat(mobile): progression and planning screens"
```

---

### Tâche 7 : `FamilyScreen` (facturation)

**Fichiers :**
- Créer : `apps/mobile/src/screens/FamilyScreen.tsx`

- [ ] **Étape 1 :** Porter `FamilyPage.tsx` : `useQuery(VIEWER_FAMILY_BILLING)`, `JoinFamilyByPayerEmailCta variant="compact"`, cartes factures (`FlatList` ou `ScrollView`), statuts `OPEN` / `PAID` / etc., montants avec `formatEuroCents`, blocs foyer partagé (`isHouseholdGroupSpace`), listes membres.

- [ ] **Étape 2 :** Gestion erreurs / chargement alignée sur le web.

- [ ] **Étape 3 :** Commit.

```bash
git add apps/mobile/src/screens/FamilyScreen.tsx
git commit -m "feat(mobile): family and billing screen"
```

---

### Tâche 8 : `SettingsScreen`, profil switcher, suppression ancien `HomeScreen`

**Fichiers :**
- Modifier : `apps/mobile/src/screens/SettingsScreen.tsx` (remplacer l’actuel minimal par parité `SettingsPage.tsx` : boutons « Choisir un autre profil » → `navigation.navigate('SelectProfile')` ou reset stack, « Déconnexion »).
- Créer : `apps/mobile/src/components/MemberShellHeader.tsx` (optionnel) — chips changement de profil comme `MemberLayout` : `useQuery(VIEWER_PROFILES)`, mutations `SELECT_*`, `setMemberSession`, puis `navigation.reset` vers `Main`.

- [ ] **Étape 1 :** Implémenter la barre d’actions profil (chips) dans un **header** commun ou dans `MainTabs` `screenOptions` `headerRight` — reproduire `switchToProfile` + `goChangeProfile` (effacer `clubId` et aller à `SelectProfile`).

- [ ] **Étape 2 :** Supprimer ou fusionner l’ancien `HomeScreen.tsx` devenu inutile ; mettre à jour les imports.

- [ ] **Étape 3 :** Commit.

```bash
git add apps/mobile/src/screens/SettingsScreen.tsx apps/mobile/src/components/MemberShellHeader.tsx
git commit -m "feat(mobile): settings and profile switcher parity"
```

---

### Tâche 9 : Parité auth étendue (optionnel — phase 2)

**Fichiers :**
- Créer : `apps/mobile/src/screens/RegisterScreen.tsx`, `VerifyEmailScreen.tsx`
- Modifier : `AppNavigator` — routes `/register`, `/verify-email`
- Copier mutations depuis `apps/member-portal/src/lib/documents.ts` : `REGISTER_CONTACT`, `VERIFY_EMAIL`, etc.

- [ ] **Étape 1 :** Porter les formulaires simplifiés (champs alignés sur `RegisterPage` / `VerifyEmailPage`).

- [ ] **Étape 2 :** OAuth Google (`OAuthCallbackPage`) : nécessite **scheme** Expo (`app.json` → `scheme`) et `expo-auth-session` ou `WebBrowser` ; traiter en **sous‑projet** si la spec OAuth mobile existe côté API.

- [ ] **Étape 3 :** Commit séparé par flux (inscription vs OAuth).

---

### Tâche 10 : Documentation et tests manuels

**Fichiers :**
- Modifier : `apps/mobile/README.md`

- [ ] **Étape 1 :** Documenter : navigation = parité portail ; **Administration** ouvre le navigateur sans session partagée ; variables `EXPO_PUBLIC_GRAPHQL_HTTP`, `EXPO_PUBLIC_ADMIN_APP_URL`.

- [ ] **Étape 2 :** Checklist manuelle : compte **membre** avec modules visibles / masqués (`hideMemberModules`) ; compte **contact seul** ; payeur vs non‑payeur sur Famille ; multi‑profils (chips).

- [ ] **Étape 3 :** Commit.

```bash
git add apps/mobile/README.md
git commit -m "docs(mobile): parity scope and admin browser limitation"
```

---

## Revue auteur

1. **Couverture :** Tous les écrans protégés du portail membre sont mappés (sauf routes auth phase 2 optionnelles).
2. **Placeholders :** Aucun « TBD » dans les étapes ci‑dessus.
3. **Cohérence :** Noms d’onglets alignés sur les routes web (`Famille`, `Parametres` sans accent pour clés TS stables).

---

## Exécution

**Plan enregistré sous :** `docs/superpowers/plans/2026-04-05-mobile-parite-portail-membre.md`

**Deux modes d’exécution possibles :**

1. **Subagent-driven (recommandé)** — un sous-agent par tâche, relecture entre les tâches. Skill : `superpowers:subagent-driven-development`.

2. **Exécution inline** — enchaîner les tâches dans la même session avec `superpowers:executing-plans`.

**Laquelle préférez-vous ?**
