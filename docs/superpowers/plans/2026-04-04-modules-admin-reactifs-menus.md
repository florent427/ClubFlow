# Modules admin réactifs (menus, routes, grisage) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Lorsqu’un administrateur active ou désactive un module sur la page « Modules du club », les entrées de navigation correspondantes (sidebar, sous-menus membres/paramètres, liens du hub) se mettent à jour sans recharger la page — à défaut, elles sont grisées, non cliquables et non focalisables — et les routes protégées redirigent si le module est coupé.

**Architecture:** Une seule source de vérité côté client : la requête GraphQL `ClubModules`, exposée via un provider React (contexte) qui lit le cache Apollo. La mutation `setClubModuleEnabled` met à jour ce cache (`update` + `refetchQueries`) pour que toutes les vues branchées sur le même client se synchronisent instantanément. Les menus utilisent un petit composant ou helper qui associe chaque entrée à un ou plusieurs `ModuleCodeStr` (ET logique). Un garde de route optionnel redirige vers l’accueil si l’URL est visitée directement alors que le module est off. Côté Nest, les résolveurs concernés sont déjà protégés par `ClubModuleEnabledGuard` ; ce plan ne change pas la logique métier serveur sauf alignement optionnel (ex. domaine e-mail).

**Tech Stack:** React 19, Apollo Client 4, React Router 7, NestJS GraphQL (existant), Prisma `ClubModule` (existant).

---

## Carte des fichiers

| Fichier | Rôle |
|---------|------|
| `apps/admin/src/lib/club-modules-context.tsx` (créer) | Provider : `useQuery(CLUB_MODULES)`, valeur `modules` + `isEnabled(code)` |
| `apps/admin/src/lib/club-modules-nav.ts` (créer) | Table de correspondance route / entrée de menu → module(s) requis |
| `apps/admin/src/lib/documents.ts` | S’assurer que la mutation `SET_MODULE` est référencée pour `refetchQueries` / `update` |
| `apps/admin/src/lib/apollo.ts` | Option : ajuster `defaultOptions` pour les queries nommées ou laisser `cache-first` sur `ClubModules` uniquement via le provider |
| `apps/admin/src/App.tsx` | Envelopper l’arbre protégé avec `ClubModulesProvider` |
| `apps/admin/src/components/AdminLayout.tsx` | Brancher chaque `NavLink` sur l’état module (ou composant dédié) |
| `apps/admin/src/pages/members/MembersLayout.tsx` | Sous-menu : désactiver lignes selon `MEMBERS` / `FAMILIES` |
| `apps/admin/src/pages/settings/SettingsLayout.tsx` | Sous-menu : `MEMBERS`, `PAYMENT`, `COMMUNICATION` selon la section |
| `apps/admin/src/pages/settings/SettingsHubPage.tsx` | Cartes cliquables : mêmes règles |
| `apps/admin/src/pages/ClubModulesPage.tsx` | Mutation avec mise à jour cache Apollo |
| `apps/admin/src/components/ModuleRouteGuard.tsx` (créer) | `Navigate` ou enfants selon modules pour routes `/planning`, `/communication`, etc. |
| `apps/admin/src/index.css` | Classe `members-subnav__link--disabled` (miroir de `.cf-sidenav__link--disabled`) |
| `apps/admin/src/lib/club-modules.ts` | Éventuellement exporter des helpers réutilisés par le contexte (sans casser les imports existants) |
| `apps/api/src/mail/club-sending-domain.resolver.ts` (optionnel) | Ajouter `@RequireClubModule(COMMUNICATION)` pour aligner l’API sur l’UI « E-mail » liée aux envois |

**Correspondance fonctionnelle (admin) — à respecter dans le code :**

- **MEMBERS** : `/members` (sauf chemins réservés aux familles), `/contacts`, « Groupes dynamiques » (déjà partiellement), paramètres « Fiche adhérent ».
- **FAMILIES** : `/members/families`, `/members/families/new`, entrée « Familles & payeurs » du sous-menu membres.
- **PAYMENT** : `/settings/adhesion` (cohérent avec `AdhesionSettingsPage` et guards `membership` / `payments`).
- **PLANNING** : `/planning`.
- **COMMUNICATION** : `/communication`, `/settings/mail-domain` (texte existant sur les campagnes e-mail).

---

### Task 1 : Tests unitaires du helper « module requis pour une route »

**Files:**
- Create: `apps/admin/src/lib/club-modules-nav.test.ts`
- Modify: `apps/admin/package.json` (ajouter `vitest`, `@vitest/coverage-v8` si besoin — minimal : `vitest` seul)

- [ ] **Step 1 : Ajouter Vitest au package admin**

Dans `apps/admin/package.json`, ajouter dans `devDependencies` :

```json
"vitest": "^3.0.0"
```

Et dans `scripts` :

```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 2 : Créer `vitest.config.ts`** à la racine de `apps/admin` :

```ts
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.ts'],
  },
});
```

- [ ] **Step 3 : Créer `club-modules-nav.ts`** (logique pure testée avant le provider) :

```ts
import type { ModuleCodeStr } from './module-catalog';

/** Modules requis (tous true) pour qu’une URL soit accessible. */
export function modulesRequiredForPath(pathname: string): ModuleCodeStr[] {
  if (pathname.startsWith('/members/families')) return ['MEMBERS', 'FAMILIES'];
  if (pathname.startsWith('/members')) return ['MEMBERS'];
  if (pathname.startsWith('/contacts')) return ['MEMBERS'];
  if (pathname.startsWith('/planning')) return ['PLANNING'];
  if (pathname.startsWith('/communication')) return ['COMMUNICATION'];
  if (pathname === '/settings/adhesion' || pathname.startsWith('/settings/adhesion'))
    return ['MEMBERS', 'PAYMENT'];
  if (pathname === '/settings/mail-domain' || pathname.startsWith('/settings/mail-domain'))
    return ['COMMUNICATION'];
  if (pathname.startsWith('/settings/member-fields')) return ['MEMBERS'];
  return [];
}

export function pathAllowed(
  pathname: string,
  isEnabled: (c: ModuleCodeStr) => boolean,
): boolean {
  const need = modulesRequiredForPath(pathname);
  return need.every((c) => isEnabled(c));
}
```

- [ ] **Step 4 : Écrire le test en échec**

Fichier `apps/admin/src/lib/club-modules-nav.test.ts` :

```ts
import { describe, expect, it } from 'vitest';
import { modulesRequiredForPath, pathAllowed } from './club-modules-nav';

describe('modulesRequiredForPath', () => {
  it('planning', () => {
    expect(modulesRequiredForPath('/planning')).toEqual(['PLANNING']);
  });
  it('families needs MEMBERS and FAMILIES', () => {
    expect(modulesRequiredForPath('/members/families')).toEqual([
      'MEMBERS',
      'FAMILIES',
    ]);
  });
});

describe('pathAllowed', () => {
  it('denies planning when PLANNING off', () => {
    const isEnabled = (c: string) => c !== 'PLANNING';
    expect(pathAllowed('/planning', isEnabled)).toBe(false);
  });
  it('allows dashboard always', () => {
    expect(pathAllowed('/', () => false)).toBe(true);
  });
});
```

- [ ] **Step 5 : Lancer les tests**

Run: `cd apps/admin && npm install && npm run test`  
Expected: PASS

- [ ] **Step 6 : Commit**

```bash
git add apps/admin/package.json apps/admin/package-lock.json apps/admin/vitest.config.ts apps/admin/src/lib/club-modules-nav.ts apps/admin/src/lib/club-modules-nav.test.ts
git commit -m "test(admin): helpers de routage par modules club"
```

---

### Task 2 : Contexte React `ClubModulesProvider`

**Files:**
- Create: `apps/admin/src/lib/club-modules-context.tsx`
- Modify: `apps/admin/src/lib/club-modules.ts` (optionnel : réexporter `useClubModules` depuis le contexte pour migration progressive)

- [ ] **Step 1 : Implémenter le provider**

```tsx
// apps/admin/src/lib/club-modules-context.tsx
import { createContext, useCallback, useContext, useMemo, type ReactNode } from 'react';
import { useQuery } from '@apollo/client/react';
import { CLUB_MODULES } from './documents';
import type { ClubModulesQueryData } from './types';
import type { ModuleCodeStr } from './module-catalog';

type Ctx = {
  loading: boolean;
  /** Indique si le module est explicitement activé en base. */
  isEnabled: (code: ModuleCodeStr) => boolean;
};

const ClubModulesContext = createContext<Ctx | null>(null);

export function ClubModulesProvider({ children }: { children: ReactNode }) {
  const { data, loading } = useQuery<ClubModulesQueryData>(CLUB_MODULES, {
    fetchPolicy: 'cache-and-network',
    nextFetchPolicy: 'cache-first',
  });

  const isEnabled = useCallback(
    (code: ModuleCodeStr) =>
      data?.clubModules?.some((m) => m.moduleCode === code && m.enabled) === true,
    [data?.clubModules],
  );

  const value = useMemo(() => ({ loading, isEnabled }), [loading, isEnabled]);

  return (
    <ClubModulesContext.Provider value={value}>{children}</ClubModulesContext.Provider>
  );
}

export function useClubModules(): Ctx {
  const ctx = useContext(ClubModulesContext);
  if (!ctx) {
    throw new Error('useClubModules doit être utilisé sous ClubModulesProvider');
  }
  return ctx;
}
```

- [ ] **Step 2 : Brancher le provider dans `App.tsx`**

Entourer `MembersUiProvider` + `AdminLayout` (ou l’inverse selon l’ordre souhaité : `ClubModulesProvider` **à l’intérieur** de `ApolloProvider` et **autour** du routeur protégé) :

```tsx
import { ClubModulesProvider } from './lib/club-modules-context';
// ...
<Protected>
  <ClubModulesProvider>
    <MembersUiProvider>
      <AdminLayout />
    </MembersUiProvider>
  </ClubModulesProvider>
</Protected>
```

- [ ] **Step 3 : Commit**

```bash
git add apps/admin/src/lib/club-modules-context.tsx apps/admin/src/App.tsx
git commit -m "feat(admin): contexte ClubModules pour la navigation"
```

---

### Task 3 : Synchronisation Apollo après `setClubModuleEnabled`

**Files:**
- Modify: `apps/admin/src/pages/ClubModulesPage.tsx`
- Modify: `apps/admin/src/lib/documents.ts` (si besoin d’exporter `CLUB_MODULES` déjà importé — aucun changement si import direct)

- [ ] **Step 1 : Étendre la mutation pour rafraîchir le cache**

Dans `ClubModulesPage.tsx`, importer `CLUB_MODULES` depuis `documents` et passer à `useMutation` :

```tsx
const [setModule, { loading: mutating }] = useMutation(SET_MODULE, {
  refetchQueries: [{ query: CLUB_MODULES }],
  awaitRefetchQueries: true,
});
```

Supprimer la dépendance stricte à `refetchModules()` après succès **ou** la garder comme filet de sécurité (les deux sont redondants ; garder un seul pour éviter double requête — préférer `refetchQueries` uniquement).

- [ ] **Step 2 : Vérifier manuellement**

1. Lancer l’admin (`npm run dev` dans `apps/admin`).
2. Ouvrir « Modules du club » et un second onglet sur le tableau de bord.
3. Désactiver « Planning » : la sidebar doit refléter l’état après retour sur l’autre onglet **sans** F5 (si besoin, ajouter `pollInterval: 4000` temporairement sur le provider pour valider le multi-onglet — retirer ensuite ; le scénario principal est un seul onglet + cache).

- [ ] **Step 3 : Commit**

```bash
git add apps/admin/src/pages/ClubModulesPage.tsx
git commit -m "fix(admin): synchroniser le cache Apollo après toggle module"
```

---

### Task 4 : Composant lien de navigation désactivable par module

**Files:**
- Create: `apps/admin/src/components/ModuleGatedNavLink.tsx`

- [ ] **Step 1 : Implémenter**

```tsx
// apps/admin/src/components/ModuleGatedNavLink.tsx
import { NavLink, type NavLinkProps } from 'react-router-dom';
import type { ModuleCodeStr } from '../lib/module-catalog';
import { useClubModules } from '../lib/club-modules-context';

type Props = Omit<NavLinkProps, 'to'> & {
  to: string;
  /** Tous requis. */
  modules: ModuleCodeStr[];
};

export function ModuleGatedNavLink({
  modules,
  to,
  className,
  children,
  ...rest
}: Props) {
  const { isEnabled, loading } = useClubModules();
  const allowed =
    !loading && modules.every((m) => isEnabled(m));

  if (!allowed) {
    return (
      <span
        className={`${className ?? ''} cf-sidenav__link--disabled`.trim()}
        aria-disabled="true"
        title="Module désactivé — activez-le dans Modules du club."
      >
        {children}
      </span>
    );
  }

  return (
    <NavLink {...rest} to={to} className={className}>
      {children}
    </NavLink>
  );
}
```

**Note :** Pour `MembersLayout` / `SettingsLayout`, dupliquer une variante `ModuleGatedSubnavLink` avec les classes `members-subnav__link` ou accepter `disabledClassName` en prop.

- [ ] **Step 2 : Commit**

```bash
git add apps/admin/src/components/ModuleGatedNavLink.tsx
git commit -m "feat(admin): lien de nav conditionné par modules"
```

---

### Task 5 : `AdminLayout` — sidebar principale

**Files:**
- Modify: `apps/admin/src/components/AdminLayout.tsx`

- [ ] **Step 1 : Remplacer les `NavLink` concernés**

Importer `ModuleGatedNavLink` et `ModuleCodeStr` :

- Tableau de bord : pas de module (NavLink classique).
- Gestion des membres : `modules={['MEMBERS']}`.
- Contacts : `modules={['MEMBERS']}`.
- Groupes dynamiques : `modules={['MEMBERS']}` (route `/members/dynamic-groups` — aligné avec l’usage actuel de `MembersDynamicGroupsPage`).
- Adhésion & formules : `modules={['MEMBERS', 'PAYMENT']}` (lien vers `/settings/adhesion`).
- Planning sportif : `modules={['PLANNING']}`.
- Communication : `modules={['COMMUNICATION']}`.
- Modules du club / Paramètres / Déconnexion : toujours actifs.

Conserver la structure des `className` avec la fonction `isActive` en la passant au `NavLink` interne via `ModuleGatedNavLink` (étendre le composant pour accepter `className` comme fonction si nécessaire, comme l’exemple actuel).

Exemple de signature étendue pour `ModuleGatedNavLink` :

```tsx
className?: NavLinkProps['className'];
```

- [ ] **Step 2 : Commit**

```bash
git add apps/admin/src/components/AdminLayout.tsx
git commit -m "feat(admin): griser la sidebar selon modules actifs"
```

---

### Task 6 : `MembersLayout` — sous-menu

**Files:**
- Modify: `apps/admin/src/pages/members/MembersLayout.tsx`
- Modify: `apps/admin/src/index.css`

- [ ] **Step 1 : Ajouter le style désactivé pour le sous-menu**

```css
.members-subnav__link--disabled {
  opacity: 0.45;
  cursor: not-allowed;
  pointer-events: none;
}
```

- [ ] **Step 2 : Utiliser `ModuleGatedNavLink` ou spans** pour chaque entrée avec `modules` appropriés (`['MEMBERS']`, `['MEMBERS','FAMILIES']` pour Familles).

- [ ] **Step 3 : Commit**

```bash
git add apps/admin/src/pages/members/MembersLayout.tsx apps/admin/src/index.css
git commit -m "feat(admin): sous-menu membres selon modules MEMBERS/FAMILIES"
```

---

### Task 7 : `SettingsLayout` + `SettingsHubPage`

**Files:**
- Modify: `apps/admin/src/pages/settings/SettingsLayout.tsx`
- Modify: `apps/admin/src/pages/settings/SettingsHubPage.tsx`

- [ ] **Step 1 : Même logique** — Adhésion : `MEMBERS` + `PAYMENT` ; E-mail : `COMMUNICATION` ; Fiche adhérent : `MEMBERS`.

Pour `SettingsHubPage`, remplacer les `Link` par des composants qui rendent soit `<Link>`, soit `<span className="settings-hub-card settings-hub-card--disabled">` avec style grisé (ajouter classe dans `index.css` : `.settings-hub-card--disabled { opacity: 0.45; pointer-events: none; }`).

- [ ] **Step 2 : Commit**

```bash
git add apps/admin/src/pages/settings/SettingsLayout.tsx apps/admin/src/pages/settings/SettingsHubPage.tsx apps/admin/src/index.css
git commit -m "feat(admin): paramètres et hub selon modules"
```

---

### Task 8 : Garde de route `ModuleRouteGuard`

**Files:**
- Create: `apps/admin/src/components/ModuleRouteGuard.tsx`
- Modify: `apps/admin/src/App.tsx`

- [ ] **Step 1 : Implémenter**

```tsx
import { Navigate, useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useClubModules } from '../lib/club-modules-context';
import { pathAllowed } from '../lib/club-modules-nav';

export function ModuleRouteGuard({ children }: { children: ReactNode }) {
  const { isEnabled, loading } = useClubModules();
  const { pathname } = useLocation();

  if (loading) {
    return <div className="cf-dash">Chargement…</div>;
  }

  if (!pathAllowed(pathname, isEnabled)) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}
```

- [ ] **Step 2 : Envelopper les routes** dans `App.tsx` :

Exemple :

```tsx
<Route path="planning" element={<ModuleRouteGuard><PlanningPage /></ModuleRouteGuard>} />
```

Répéter pour `communication`, les sous-routes `members` (imbriquées sous un seul guard MEMBERS + enfants spécifiques pour families — **deux options** : un guard parent sur `MembersLayout` qui vérifie `MEMBERS` et un guard sur les routes `families` pour `FAMILIES`, ou un seul guard lisant `pathname` via `ModuleRouteGuard` déjà basé sur `modulesRequiredForPath`).

Approche recommandée : envelopper `<Route path="members" element={<ModuleRouteGuard><MembersLayout /></ModuleRouteGuard>}>` avec un guard qui autorise tout préfixe `/members` si `MEMBERS` ; ajouter une route imbriquée `families` avec guard `FAMILIES` **ou** laisser `ModuleRouteGuard` global sur `MembersLayout` en utilisant `pathAllowed` sur `pathname` à chaque navigation (le composant se re-rend au changement de route).

Simplification : un seul `ModuleRouteGuard` autour de `<Outlet />` en créant `MembersModuleGuard` qui lit `useLocation().pathname` et applique `pathAllowed`.

- [ ] **Step 3 : Commit**

```bash
git add apps/admin/src/components/ModuleRouteGuard.tsx apps/admin/src/App.tsx
git commit -m "feat(admin): redirection accueil si module désactivé"
```

---

### Task 9 : Pages existantes qui dupliquent `useQuery(CLUB_MODULES)`

**Files:**
- Modify: `apps/admin/src/pages/members/MembersDynamicGroupsPage.tsx`
- Modify: `apps/admin/src/pages/settings/AdhesionSettingsPage.tsx`
- Modify: `apps/admin/src/lib/useClubCommunicationEnabled.ts`

- [ ] **Step 1 : Remplacer** les `useQuery(CLUB_MODULES)` locaux par `useClubModules().isEnabled` où c’est pertinent pour éviter des requêtes réseau redondantes (le provider garde une seule subscription).

Adapter `useClubCommunicationEnabled` pour utiliser le contexte en interne :

```ts
export function useClubCommunicationEnabled(): boolean {
  const { isEnabled } = useClubModules();
  return isEnabled('COMMUNICATION');
}
```

- [ ] **Step 2 : Commit**

```bash
git add apps/admin/src/pages/members/MembersDynamicGroupsPage.tsx apps/admin/src/pages/settings/AdhesionSettingsPage.tsx apps/admin/src/lib/useClubCommunicationEnabled.ts
git commit -m "refactor(admin): mutualiser l’état modules via contexte"
```

---

### Task 10 (optionnel) : Aligner l’API « domaine e-mail » sur le module Communication

**Files:**
- Modify: `apps/api/src/mail/club-sending-domain.resolver.ts`
- Modify: `apps/api/src/mail/mail.module.ts` (enregistrer `ClubModuleEnabledGuard` si absent)

- [ ] **Step 1 :** Reprendre le même motif que `comms.resolver.ts` : `@UseGuards(..., ClubModuleEnabledGuard)` et `@RequireClubModule(ModuleCode.COMMUNICATION)` au niveau classe.

- [ ] **Step 2 :** Test d’intégration manuel : avec module Communication off, une query GraphQL du resolver doit retourner `Forbidden`.

- [ ] **Step 3 : Commit**

```bash
git add apps/api/src/mail/club-sending-domain.resolver.ts apps/api/src/mail/mail.module.ts
git commit -m "feat(api): garde module Communication sur domaine e-mail club"
```

---

## Revue (checklist auteur)

1. **Couverture spec :** Menus principaux et sous-menus, hub paramètres, synchronisation après toggle, protection de navigation directe — couverts. Multi-admin strict « temps réel » sans WebSocket : option `pollInterval` non incluse par défaut ; peut être ajoutée en une ligne dans le provider si exigée plus tard.
2. **Placeholders :** Aucun TBD.
3. **Cohérence des types :** `ModuleCodeStr` partout ; `pathAllowed` et `ModuleGatedNavLink` utilisent les mêmes codes.

---

**Plan complete and saved to `docs/superpowers/plans/2026-04-04-modules-admin-reactifs-menus.md`. Two execution options:**

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**
