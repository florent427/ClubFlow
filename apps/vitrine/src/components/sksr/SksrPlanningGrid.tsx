'use client';

import { useMemo, useState } from 'react';

export type PlanningSlotType =
  | 'mini'
  | 'junior'
  | 'teens'
  | 'adults'
  | 'masters'
  | 'cross'
  | 'athle'
  | 'comp';

export interface PlanningSlot {
  /** 0 = Lundi ... 5 = Samedi */
  day: number;
  /** index dans HOURS */
  hourIdx: number;
  /** durée en pas de 15 minutes */
  span: number;
  /** Type pour classe CSS `slot--${type}` et filtrage. */
  type: string;
  name: string;
  meta: string;
}

const DAYS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
const DAYS_SHORT = ['LUN', 'MAR', 'MER', 'JEU', 'VEN', 'SAM'];

const HOURS: string[] = [
  '8h15',
  '8h30',
  '8h45',
  '9h00',
  '9h15',
  '9h30',
  '···',
  '14h00',
  '14h15',
  '14h30',
  '14h45',
  '15h00',
  '15h15',
  '15h30',
  '15h45',
  '16h00',
  '16h15',
  '16h30',
  '16h45',
  '17h00',
  '17h15',
  '17h30',
  '17h45',
  '18h00',
  '18h15',
  '18h30',
  '18h45',
  '19h00',
  '19h15',
  '19h30',
  '19h45',
  '20h00',
  '20h15',
  '20h30',
];

const FILTERS: Array<{ key: string; label: string }> = [
  { key: 'all', label: 'Tous' },
  { key: 'mini', label: 'Baby 4–5' },
  { key: 'junior', label: 'Enfants' },
  { key: 'teens', label: 'Ados' },
  { key: 'adults', label: 'Adultes' },
  { key: 'masters', label: 'Adultes av.' },
  { key: 'cross', label: 'Cross Training' },
  { key: 'comp', label: 'Compétition' },
];

type TypedSlot = Omit<PlanningSlot, 'type'> & { type: PlanningSlotType };

export const DEFAULT_SKSR_SLOTS: TypedSlot[] = [
  { day: 0, hourIdx: 0, span: 3, type: 'cross', name: 'Cross Training', meta: '8h15 – 9h' },
  { day: 1, hourIdx: 0, span: 3, type: 'cross', name: 'Cross Training', meta: '8h15 – 9h' },
  { day: 2, hourIdx: 0, span: 3, type: 'cross', name: 'Cross Training', meta: '8h15 – 9h' },
  { day: 3, hourIdx: 0, span: 3, type: 'cross', name: 'Cross Training', meta: '8h15 – 9h' },
  { day: 4, hourIdx: 0, span: 3, type: 'cross', name: 'Cross Training', meta: '8h15 – 9h' },
  { day: 5, hourIdx: 0, span: 5, type: 'athle', name: 'Athlétisme', meta: '8h15 – 9h30' },
  { day: 2, hourIdx: 7, span: 8, type: 'comp', name: 'Compétition Kata', meta: '14h – 16h' },
  { day: 5, hourIdx: 7, span: 8, type: 'comp', name: 'Compétition Kata', meta: '14h – 16h' },
  { day: 2, hourIdx: 15, span: 4, type: 'junior', name: 'Enfants interm.', meta: '16h – 17h' },
  { day: 3, hourIdx: 16, span: 3, type: 'mini', name: 'Baby Karaté', meta: '16h15 – 17h · 4–5 ans' },
  { day: 0, hourIdx: 17, span: 4, type: 'junior', name: 'Enfants 6–8 ans', meta: '16h30 – 17h30' },
  { day: 4, hourIdx: 17, span: 4, type: 'junior', name: 'Enfants 6–8 ans', meta: '16h30 – 17h30' },
  { day: 1, hourIdx: 19, span: 4, type: 'teens', name: 'Ados 13–17', meta: '17h – 18h' },
  { day: 3, hourIdx: 19, span: 4, type: 'teens', name: 'Ados 13–17', meta: '17h – 18h' },
  { day: 2, hourIdx: 19, span: 6, type: 'junior', name: 'Enfants avancés', meta: '17h – 18h30 · Vert+' },
  { day: 0, hourIdx: 21, span: 4, type: 'junior', name: 'Enfants interm.', meta: '17h30 – 18h30' },
  { day: 4, hourIdx: 21, span: 4, type: 'junior', name: 'Enfants avancés', meta: '17h30 – 18h30 · Vert+' },
  { day: 0, hourIdx: 21, span: 3, type: 'cross', name: 'Cross Training', meta: '17h30 – 18h15' },
  { day: 2, hourIdx: 21, span: 3, type: 'cross', name: 'Cross Training', meta: '17h30 – 18h15' },
  { day: 4, hourIdx: 21, span: 3, type: 'cross', name: 'Cross Training', meta: '17h30 – 18h15' },
  { day: 1, hourIdx: 23, span: 4, type: 'comp', name: 'Cours Combat', meta: '18h – 19h' },
  { day: 1, hourIdx: 25, span: 1, type: 'cross', name: 'Cross Training', meta: '18h30 – 18h45' },
  { day: 0, hourIdx: 25, span: 4, type: 'adults', name: 'Adultes', meta: '18h30 – 19h30' },
  { day: 2, hourIdx: 25, span: 4, type: 'adults', name: 'Adultes', meta: '18h30 – 19h30' },
  { day: 4, hourIdx: 25, span: 4, type: 'adults', name: 'Adultes', meta: '18h30 – 19h30' },
  { day: 0, hourIdx: 29, span: 4, type: 'masters', name: 'Adultes avancés', meta: '19h30 – 20h30' },
  { day: 2, hourIdx: 29, span: 4, type: 'masters', name: 'Adultes avancés', meta: '19h30 – 20h30' },
  { day: 4, hourIdx: 29, span: 4, type: 'masters', name: 'Adultes avancés', meta: '19h30 – 20h30' },
];

interface Props {
  slots?: PlanningSlot[];
}

/**
 * Grille planning SKSR — port fidèle de `cours.html` :
 *  - 6 jours × 34 sous-cellules horaires (avec gap 9h–14h)
 *  - chaque jour a 2 sous-colonnes : principale + cross (à droite)
 *  - filtres par catégorie, slot.hidden = opacité 0.12
 */
export function SksrPlanningGrid({ slots = DEFAULT_SKSR_SLOTS }: Props) {
  const [filter, setFilter] = useState<string>('all');

  const cells = useMemo(() => {
    const nodes: React.ReactNode[] = [];
    // Coin top-left
    nodes.push(
      <div
        key="corner"
        style={{
          gridColumn: 1,
          gridRow: 1,
          background: 'var(--bg-2)',
          borderRight: '1px solid var(--line)',
          borderBottom: '1px solid var(--line)',
        }}
      />,
    );
    // En-têtes jours
    DAYS.forEach((d, i) => {
      const col = 2 * i + 2;
      nodes.push(
        <div
          key={`hd-${i}`}
          className="planning__header"
          style={{ gridColumn: `${col} / span 2`, gridRow: 1 }}
        >
          {d}
          <small>{DAYS_SHORT[i]}</small>
        </div>,
      );
    });
    // Lignes horaires + fond
    for (let h = 0; h < HOURS.length; h++) {
      const row = h + 2;
      if (HOURS[h] === '···') {
        nodes.push(
          <div
            key={`gap-${h}`}
            className="planning__gap"
            style={{ gridColumn: '1 / -1', gridRow: row }}
          >
            9h – 14h
          </div>,
        );
        continue;
      }
      const isMinor = HOURS[h].endsWith('h15') || HOURS[h].endsWith('h45');
      nodes.push(
        <div
          key={`t-${h}`}
          className={`planning__time${isMinor ? ' planning__time--minor' : ''}`}
          style={{ gridColumn: 1, gridRow: row }}
        >
          {HOURS[h]}
        </div>,
      );
      for (let d = 0; d < DAYS.length; d++) {
        nodes.push(
          <div
            key={`c-${h}-${d}-a`}
            className="planning__cell"
            style={{ gridColumn: 2 * d + 2, gridRow: row }}
          />,
        );
        nodes.push(
          <div
            key={`c-${h}-${d}-b`}
            className="planning__cell planning__cell--cross"
            style={{ gridColumn: 2 * d + 3, gridRow: row }}
          />,
        );
      }
    }
    // Créneaux par-dessus
    slots.forEach((s, idx) => {
      const isCross = s.type === 'cross' || s.type === 'athle';
      const col = isCross ? 2 * s.day + 3 : 2 * s.day + 2;
      const rowStart = s.hourIdx + 2;
      const hidden = filter !== 'all' && s.type !== filter;
      nodes.push(
        <div
          key={`s-${idx}`}
          className="planning__cell"
          style={{
            gridColumn: col,
            gridRow: `${rowStart} / span ${s.span}`,
            padding: 0,
            zIndex: 1,
          }}
        >
          <div className={`slot slot--${s.type}${hidden ? ' hidden' : ''}`} data-type={s.type}>
            <div className="slot__name">{s.name}</div>
            <div className="slot__meta">{s.meta}</div>
          </div>
        </div>,
      );
    });
    return nodes;
  }, [slots, filter]);

  return (
    <>
      <div className="planning__filters reveal d2">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            className={`planning__filter${filter === f.key ? ' active' : ''}`}
            onClick={() => setFilter(f.key)}
          >
            {f.label}
          </button>
        ))}
      </div>
      <div className="planning__grid-wrap reveal d1">
        <div className="planning__grid">{cells}</div>
      </div>
    </>
  );
}
