# Planning calendrier (Mois / Semaine / Jour) + DnD pas 15 min — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remplacer l’écran planning « liste + formulaire seul » par un calendrier à trois vues (mois, semaine, jour) avec drag-and-drop et redimensionnement sur semaine/jour, snap 15 minutes, mise à jour via `updateClubCourseSlot`, styles alignés sur `design stitch/`, en conservant le formulaire de création/édition des créneaux.

**Architecture:** Vue **mois** statique (navigation vers semaine). **Semaine** et **jour** partagent un composant `PlanningTimeGrid` qui positionne les `CourseSlot` en pixels (hauteur d’heure fixe), gère le snap quart d’heure en local et appelle une mutation GraphQL après chaque interaction. État de vue + date dans **query string** (`view`, `date`). Optionnel côté API : validation « minutes UTC multiples de 15 » pour éviter les valeurs hors pas. Utilitaires de date et de conversion testés par **Vitest** (admin) et **Jest** (API).

**Tech Stack:** React 19, Apollo Client 4, React Router 7, `@dnd-kit/core` (drag), `date-fns` (grille mensuelle et bornes de semaine), Vitest + jsdom (admin), Jest (API Nest).

**Spécification source:** `docs/superpowers/specs/2026-04-04-planning-calendrier-dnd-design.md`

---

## File map (création / modification)

| Fichier | Rôle |
|---------|------|
| `apps/api/src/planning/quarter-hour.ts` | Fonction pure `assertUtcQuarterHour(d: Date): void` (ou équivalent exporté testé) |
| `apps/api/src/planning/quarter-hour.spec.ts` | Tests Jest de la validation |
| `apps/api/src/planning/planning.service.ts` | Appeler la validation dans `createCourseSlot` / `updateCourseSlot` après parsing des dates |
| `apps/admin/src/lib/documents.ts` | Ajouter mutation `UPDATE_CLUB_COURSE_SLOT` |
| `apps/admin/src/lib/types.ts` | Type `UpdateClubCourseSlotMutationData` si besoin pour typage Apollo |
| `apps/admin/src/lib/planning-calendar.ts` | Snap local 15 min, conversion px ↔ minutes dans la plage jour, chevauchements coach |
| `apps/admin/src/lib/planning-calendar.test.ts` | Tests Vitest |
| `apps/admin/src/planning/usePlanningCalendarSearchParams.ts` | Sync `view` + `date` avec `useSearchParams` |
| `apps/admin/src/components/planning/PlanningMonthView.tsx` | Grille mois + clic jour |
| `apps/admin/src/components/planning/PlanningTimeGrid.tsx` | Grille temps × jours, scroll, placement absolu |
| `apps/admin/src/components/planning/CourseSlotBlock.tsx` | Carte créneau + état drag + conflit |
| `apps/admin/src/pages/PlanningPage.tsx` | Orchestration : toolbar, switch de vue, inclusion des sous-vues, formulaire existant (replié ou dessous) |
| `apps/admin/package.json` | Dépendances `date-fns`, `@dnd-kit/core` |
| `apps/admin/src/index.css` ou CSS module local | Tokens calendrier (ombres drag) si besoin |

---

### Task 1: API — validation quarts d’heure (UTC)

**Files:**
- Create: `apps/api/src/planning/quarter-hour.ts`
- Create: `apps/api/src/planning/quarter-hour.spec.ts`
- Modify: `apps/api/src/planning/planning.service.ts`

- [ ] **Step 1: Ajouter le module pur**

```typescript
// apps/api/src/planning/quarter-hour.ts
import { BadRequestException } from '@nestjs/common';

/** Rejette si l’instant n’est pas aligné sur une minute UTC ∈ {0,15,30,45} avec secondes et ms nulles. */
export function assertUtcQuarterHour(label: string, d: Date): void {
  if (
    d.getUTCMilliseconds() !== 0 ||
    d.getUTCSeconds() !== 0 ||
    d.getUTCMinutes() % 15 !== 0
  ) {
    throw new BadRequestException(
      `${label} : horaire invalide (pas d’un quart d’heure exact, UTC).`,
    );
  }
}
```

- [ ] **Step 2: Tests Jest**

```typescript
// apps/api/src/planning/quarter-hour.spec.ts
import { BadRequestException } from '@nestjs/common';
import { assertUtcQuarterHour } from './quarter-hour';

describe('assertUtcQuarterHour', () => {
  it('accepte 2026-04-04T09:00:00.000Z', () => {
    expect(() =>
      assertUtcQuarterHour('Début', new Date('2026-04-04T09:00:00.000Z')),
    ).not.toThrow();
  });

  it('rejette les minutes non multiples de 15 (UTC)', () => {
    expect(() =>
      assertUtcQuarterHour('Début', new Date('2026-04-04T09:07:00.000Z')),
    ).toThrow(BadRequestException);
  });
});
```

- [ ] **Step 3: Brancher dans `PlanningService`**

Dans `createCourseSlot`, après `const startsAt = new Date(input.startsAt)` et `const endsAt = new Date(input.endsAt)` :

```typescript
import { assertUtcQuarterHour } from './quarter-hour';
// ...
assertUtcQuarterHour('Début', startsAt);
assertUtcQuarterHour('Fin', endsAt);
```

Idem dans `updateCourseSlot` pour les dates effectivement mises à jour (si `input.startsAt` fourni, valider ce `startsAt` ; idem `endsAt`).

- [ ] **Step 4: Lancer les tests**

Run: `cd apps/api && npm test -- --testPathPattern=quarter-hour`
Expected: tous les tests passent.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/planning/quarter-hour.ts apps/api/src/planning/quarter-hour.spec.ts apps/api/src/planning/planning.service.ts
git commit -m "feat(api): validation quarts d'heure UTC pour créneaux cours"
```

---

### Task 2: Admin — mutation `updateClubCourseSlot`

**Files:**
- Modify: `apps/admin/src/lib/documents.ts`
- Modify: `apps/admin/src/lib/types.ts`

- [ ] **Step 1: Document GraphQL**

Dans `documents.ts`, après `DELETE_CLUB_COURSE_SLOT` :

```typescript
export const UPDATE_CLUB_COURSE_SLOT = gql`
  mutation UpdateClubCourseSlot($input: UpdateCourseSlotInput!) {
    updateClubCourseSlot(input: $input) {
      id
      venueId
      coachMemberId
      title
      startsAt
      endsAt
      dynamicGroupId
    }
  }
`;
```

- [ ] **Step 2: Type TypeScript**

Dans `types.ts` (près de `CourseSlotsQueryData`) :

```typescript
export type UpdateClubCourseSlotMutationData = {
  updateClubCourseSlot: {
    id: string;
    venueId: string;
    coachMemberId: string;
    title: string;
    startsAt: string;
    endsAt: string;
    dynamicGroupId: string | null;
  };
};
```

- [ ] **Step 3: Vérifier la compilation**

Run: `cd apps/admin && npx tsc -b`
Expected: exit code 0.

- [ ] **Step 4: Commit**

```bash
git add apps/admin/src/lib/documents.ts apps/admin/src/lib/types.ts
git commit -m "feat(admin): mutation GraphQL updateClubCourseSlot"
```

---

### Task 3: Admin — utilitaires calendrier + tests

**Files:**
- Create: `apps/admin/src/lib/planning-calendar.ts`
- Create: `apps/admin/src/lib/planning-calendar.test.ts`

- [ ] **Step 1: Implémenter snap et chevauchements**

```typescript
// apps/admin/src/lib/planning-calendar.ts — extraits minimaux ; compléter avec les helpers dont le grid a besoin.

const MS_15 = 15 * 60 * 1000;

/** Aligne un timestamp (ms) sur le quart d’heure local le plus proche. */
export function snapToLocalQuarterHour(ms: number): number {
  return Math.round(ms / MS_15) * MS_15;
}

export type SlotLike = {
  id: string;
  coachMemberId: string;
  startsAt: string;
  endsAt: string;
};

/** IDs des créneaux impliqués dans au moins un chevauchement de même coach (paires). */
export function coachOverlapIds(slots: SlotLike[]): Set<string> {
  const byCoach = new Map<string, SlotLike[]>();
  for (const s of slots) {
    const list = byCoach.get(s.coachMemberId) ?? [];
    list.push(s);
    byCoach.set(s.coachMemberId, list);
  }
  const out = new Set<string>();
  for (const [, list] of byCoach) {
    const sorted = [...list].sort(
      (a, b) => +new Date(a.startsAt) - +new Date(b.startsAt),
    );
    for (let i = 0; i < sorted.length; i++) {
      for (let j = i + 1; j < sorted.length; j++) {
        const a = sorted[i];
        const b = sorted[j];
        const aEnd = +new Date(a.endsAt);
        const bStart = +new Date(b.startsAt);
        if (bStart >= aEnd) break;
        const aStart = +new Date(a.startsAt);
        const bEnd = +new Date(b.endsAt);
        if (aStart < bEnd && bStart < aEnd) {
          out.add(a.id);
          out.add(b.id);
        }
      }
    }
  }
  return out;
}
```

Ajouter les fonctions `minutesSinceDayStartLocal`, `offsetMsToY`, etc., utilisées par `PlanningTimeGrid` dans le même fichier pour garder une seule source testable.

- [ ] **Step 2: Tests Vitest**

```typescript
// apps/admin/src/lib/planning-calendar.test.ts
import { describe, expect, it } from 'vitest';
import { coachOverlapIds, snapToLocalQuarterHour } from './planning-calendar';

describe('snapToLocalQuarterHour', () => {
  it('arrondit au quart d’heure local', () => {
    const base = new Date('2026-04-04T10:07:00').getTime();
    const s = snapToLocalQuarterHour(base);
    expect(new Date(s).getMinutes() % 15).toBe(0);
  });
});

describe('coachOverlapIds', () => {
  it('détecte deux créneaux qui se chevauchent pour le même coach', () => {
    const ids = coachOverlapIds([
      {
        id: '1',
        coachMemberId: 'c1',
        startsAt: '2026-04-04T10:00:00.000Z',
        endsAt: '2026-04-04T11:00:00.000Z',
      },
      {
        id: '2',
        coachMemberId: 'c1',
        startsAt: '2026-04-04T10:30:00.000Z',
        endsAt: '2026-04-04T11:30:00.000Z',
      },
    ]);
    expect(ids.has('1')).toBe(true);
    expect(ids.has('2')).toBe(true);
  });
});
```

- [ ] **Step 3: Exécuter Vitest**

Run: `cd apps/admin && npm test`
Expected: tous les tests passent.

- [ ] **Step 4: Commit**

```bash
git add apps/admin/src/lib/planning-calendar.ts apps/admin/src/lib/planning-calendar.test.ts
git commit -m "feat(admin): utilitaires snap 15min et chevauchements coach"
```

---

### Task 4: Dépendances admin

**Files:**
- Modify: `apps/admin/package.json` + `package-lock.json`

- [ ] **Step 1: Installer**

Run: `cd apps/admin && npm install date-fns @dnd-kit/core`

- [ ] **Step 2: Commit**

```bash
git add apps/admin/package.json apps/admin/package-lock.json
git commit -m "chore(admin): date-fns et @dnd-kit/core pour planning calendrier"
```

---

### Task 5: Hook URL `view` + `date`

**Files:**
- Create: `apps/admin/src/planning/usePlanningCalendarSearchParams.ts`

- [ ] **Step 1: Implémenter**

Utiliser `useSearchParams` de `react-router-dom`. Valeurs par défaut : `view=week`, `date` = aujourd’hui au format `YYYY-MM-DD` (locale). Valider `view` ∈ `month` | `week` | `day` ; sinon corriger vers `week`.

Expose typique :

```typescript
export type PlanningView = 'month' | 'week' | 'day';

export function usePlanningCalendarSearchParams(): {
  view: PlanningView;
  pivotDate: Date;
  setView: (v: PlanningView) => void;
  setPivotDate: (d: Date) => void;
  goNext: () => void;
  goPrev: () => void;
} {
  // impl: lire searchParams, écrire avec setSearchParams en préservant les autres clés
  throw new Error('implement');
}
```

Utiliser `date-fns` (`parseISO`, `format`, `addWeeks`, `addDays`, `startOfWeek` avec `{ weekStartsOn: 1 }` pour lundi).

- [ ] **Step 2: Commit**

```bash
git add apps/admin/src/planning/usePlanningCalendarSearchParams.ts
git commit -m "feat(admin): synchronisation URL pour vues planning calendrier"
```

---

### Task 6: `PlanningMonthView`

**Files:**
- Create: `apps/admin/src/components/planning/PlanningMonthView.tsx`

- [ ] **Step 1: Rendu**

Props : `month: Date`, `slots: CourseSlotsQueryData['clubCourseSlots']`, `onSelectDay: (d: Date) => void`.

Utiliser `date-fns` : `startOfMonth`, `endOfMonth`, `eachDayOfInterval`, calendrier commençant lundi. Filtrer les créneaux qui intersectent chaque jour (comparer en UTC ou en local de façon cohérente — choisir **local** pour cohérence avec l’UI). Afficher un compteur ou des points par jour.

- [ ] **Step 2: Commit**

```bash
git add apps/admin/src/components/planning/PlanningMonthView.tsx
git commit -m "feat(admin): vue mois planning (aperçu sans DnD)"
```

---

### Task 7: `PlanningTimeGrid` + `CourseSlotBlock`

**Files:**
- Create: `apps/admin/src/components/planning/PlanningTimeGrid.tsx`
- Create: `apps/admin/src/components/planning/CourseSlotBlock.tsx`

- [ ] **Step 1: Constantes**

`PIXELS_PER_HOUR = 96`, `MIN_HOUR = 8`, `MAX_HOUR = 22` (ajuster si besoin ; documenter en tête de fichier).

- [ ] **Step 2: `CourseSlotBlock`**

Position `absolute`, `top` / `height` calculés depuis `planning-calendar.ts` pour le jour de la colonne. Bordure gauche `border-l-4`, classes Tailwind alignées sur `design stitch/code.html` (couleurs via classes existantes du projet ou variables CSS admin). Prop `hasConflict: boolean` pour le style erreur.

- [ ] **Step 3: `PlanningTimeGrid`**

Pour chaque jour colonne, sous-couches : lignes heures (fond), puis couche événements. Intégrer `@dnd-kit/core` : `DndContext`, `useDraggable` sur `CourseSlotBlock` avec `snap` sur le déplacement (modifier `transform` ou recalculer la position dans `onDragEnd` à partir du delta + colonne cible). **Resize** : poignée basse avec `onPointerDown` / mouvement pour ajuster `endsAt` (ou `startsAt` si poignée haute en phase 2 — v1 : poignée basse uniquement).

Au `onDragEnd`, calculer nouveaux `startsAt`/`endsAt` snapped, puis appeler callback `onSlotTimeChange(slotId, { startsAt, endsAt })`.

- [ ] **Step 4: Commit**

```bash
git add apps/admin/src/components/planning/PlanningTimeGrid.tsx apps/admin/src/components/planning/CourseSlotBlock.tsx
git commit -m "feat(admin): grille temps semaine/jour et cartes créneau DnD"
```

---

### Task 8: `PlanningPage` — composition et mutation

**Files:**
- Modify: `apps/admin/src/pages/PlanningPage.tsx`

- [ ] **Step 1: Données**

Conserver `useQuery(CLUB_COURSE_SLOTS)` et les requêtes existantes. Ajouter `useMutation(UPDATE_CLUB_COURSE_SLOT)` avec `refetchQueries: [{ query: CLUB_COURSE_SLOTS }]` ou `awaitRefetchQueries: true`.

- [ ] **Step 2: Optimistic update (optionnel mais spec)**

Utiliser `update` du cache Apollo ou `optimisticResponse` + rollback sur `onError`. Au minimum : `onError` affiche `formError` ou un toast si vous introduisez un système de toast ; sinon réutiliser `formError` en haut de page.

- [ ] **Step 3: Layout**

Toolbar : titre, boutons Précédent / Suivant, sélecteur Mois | Semaine | Jour, bouton « Aujourd’hui ». Zone principale : `PlanningMonthView` si `view===month'`, sinon `PlanningTimeGrid` avec `days` = 7 ou 1 selon la vue. Conserver le **tableau** et le **formulaire** (lieux + créneau) dans un panneau repliable ou sous la grille pour respecter le spec « formulaire conservé ».

- [ ] **Step 4: Vérification manuelle**

Run: `cd apps/admin && npm run dev` — naviguer `/planning`, changer de vue, déplacer un créneau, vérifier refetch et absence d’erreur console.

- [ ] **Step 5: Commit**

```bash
git add apps/admin/src/pages/PlanningPage.tsx
git commit -m "feat(admin): intégration calendrier planning et updateClubCourseSlot"
```

---

### Task 9: Finitions UX et accessibilité

**Files:**
- Modify: `apps/admin/src/components/planning/CourseSlotBlock.tsx` (ou CSS)

- [ ] **Step 1: Poignée resize**

Hauteur minimale de cible 24px (`min-h-[24px]` sur la zone).

- [ ] **Step 2: Focus clavier**

`tabIndex={0}` sur la carte + `onKeyDown` : `Enter` ouvre un dialogue / focus le formulaire avec le créneau sélectionné (implémentation minimale : `window.alert` interdit — préférer état `selectedSlotId` qui pré-remplit un formulaire d’édition existant ou scroll vers `#slot-form`).

- [ ] **Step 3: Commit**

```bash
git commit -am "fix(admin): accessibilité minimale planning calendrier"
```

---

## Self-review (plan vs spec)

| Exigence spec | Tâche |
|---------------|--------|
| 3 vues + URL | Task 5, 6, 7, 8 |
| Mois sans DnD | Task 6 |
| Semaine/jour DnD + 15 min | Task 3, 7, 8 |
| `updateClubCourseSlot` | Task 2, 8 |
| Validation serveur quarts d’heure | Task 1 |
| Optimistic + rollback | Task 8 |
| Conflit coach visuel | Task 3 (`coachOverlapIds`), Task 7 |
| Design stitch | Task 7, 9 |
| Tests unitaires | Task 1, 3 |

**Placeholder scan:** aucun « TBD » ; les `throw new Error('implement')` doivent être remplacés par l’implémentation réelle avant commit Task 5.

**Cohérence types:** `UpdateCourseSlotInput` côté API attend des ISO8601 ; le client envoie `toISOString()` après snap local — vérifier que le snap local produit des instants acceptés par la validation UTC (voir note ci-dessous).

**Note importante — validation UTC vs snap local:** Si le fuseau club fait que des quarts d’heure locaux ne tombent pas sur des quarts d’heure UTC, `assertUtcQuarterHour` échouera. En cas d’échec en dev, assouplir en **première itération** la validation serveur (feature flag) ou n’activer la validation UTC qu’après tests manuels — à trancher lors de l’implémentation Task 1 si des clubs hors Europe sont prévus.

---

## Execution handoff

Plan enregistré sous `docs/superpowers/plans/2026-04-04-planning-calendrier-dnd.md`. Deux modes d’exécution possibles :

**1. Subagent-Driven (recommandé)** — un sous-agent par tâche, relecture entre les tâches, itération rapide.

**2. Inline Execution** — enchaîner les tâches dans cette session avec `executing-plans`, lots avec points de contrôle.

Laquelle préférez-vous ?
