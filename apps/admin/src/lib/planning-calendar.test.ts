import { describe, expect, it } from 'vitest';
import {
  coachOverlapIds,
  gridRelativeYToStartDate,
  layoutOverlappingSlotsForDay,
  layoutSlotOnDay,
  PLANNING_GRID_DEFAULTS,
  snapInstantToUtcQuarterHour,
  snapToLocalQuarterHour,
} from './planning-calendar';

describe('snapToLocalQuarterHour', () => {
  it('arrondit au quart d’heure local', () => {
    const base = new Date(2026, 3, 4, 10, 7, 0).getTime();
    const s = snapToLocalQuarterHour(base);
    expect(new Date(s).getMinutes() % 15).toBe(0);
  });
});

describe('snapInstantToUtcQuarterHour', () => {
  it('produit un instant acceptable par assertUtcQuarterHour côté API', () => {
    const d = snapInstantToUtcQuarterHour(new Date('2026-04-04T09:07:22.100Z'));
    expect(d.getUTCMilliseconds()).toBe(0);
    expect(d.getUTCSeconds()).toBe(0);
    expect(d.getUTCMinutes() % 15).toBe(0);
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

describe('layoutOverlappingSlotsForDay', () => {
  const day = new Date('2026-04-04T12:00:00');

  it('répartit la largeur sur 2 colonnes si deux créneaux se chevauchent', () => {
    const m = layoutOverlappingSlotsForDay(
      [
        {
          id: 'a',
          coachMemberId: 'c1',
          startsAt: '2026-04-04T10:00:00.000Z',
          endsAt: '2026-04-04T11:00:00.000Z',
        },
        {
          id: 'b',
          coachMemberId: 'c2',
          startsAt: '2026-04-04T10:30:00.000Z',
          endsAt: '2026-04-04T11:30:00.000Z',
        },
      ],
      day,
    );
    expect(m.get('a')?.widthPct).toBe(50);
    expect(m.get('b')?.widthPct).toBe(50);
    expect(m.get('a')?.leftPct).not.toBe(m.get('b')?.leftPct);
  });

  it('un créneau isolé occupe toute la largeur', () => {
    const m = layoutOverlappingSlotsForDay(
      [
        {
          id: 'a',
          coachMemberId: 'c1',
          startsAt: '2026-04-04T14:00:00.000Z',
          endsAt: '2026-04-04T15:00:00.000Z',
        },
      ],
      day,
    );
    expect(m.get('a')).toEqual({ leftPct: 0, widthPct: 100 });
  });

  it('réordonne les colonnes par id de piste : la carte avec l’id le plus petit est à gauche même si elle commence plus tard', () => {
    const m = layoutOverlappingSlotsForDay(
      [
        {
          id: 'z-later-left-col0-greedy',
          coachMemberId: 'c1',
          startsAt: '2026-04-04T10:15:00.000Z',
          endsAt: '2026-04-04T11:15:00.000Z',
        },
        {
          id: 'a-earlier-right-col1-greedy',
          coachMemberId: 'c2',
          startsAt: '2026-04-04T10:30:00.000Z',
          endsAt: '2026-04-04T11:30:00.000Z',
        },
      ],
      day,
    );
    expect(m.get('a-earlier-right-col1-greedy')?.leftPct).toBe(0);
    expect(m.get('z-later-left-col0-greedy')?.leftPct).toBe(50);
  });
});

describe('gridRelativeYToStartDate', () => {
  const opts = {
    minHour: PLANNING_GRID_DEFAULTS.MIN_HOUR,
    maxHour: PLANNING_GRID_DEFAULTS.MAX_HOUR,
    pixelsPerHour: PLANNING_GRID_DEFAULTS.PIXELS_PER_HOUR,
  };

  it('mappe le haut de la grille (Y=0) au minHour', () => {
    const day = new Date(2026, 3, 4);
    const d = gridRelativeYToStartDate(0, day, opts);
    expect(d.getHours()).toBe(opts.minHour);
    expect(d.getMinutes()).toBe(0);
  });

  it('mappe une position intermédiaire vers un quart d’heure', () => {
    const day = new Date(2026, 3, 4);
    const totalPx = (opts.maxHour - opts.minHour) * opts.pixelsPerHour;
    const half = totalPx / 2;
    const d = gridRelativeYToStartDate(half, day, opts);
    expect(d.getMinutes() % 15).toBe(0);
  });
});

describe('layoutSlotOnDay', () => {
  const opts = {
    minHour: PLANNING_GRID_DEFAULTS.MIN_HOUR,
    maxHour: PLANNING_GRID_DEFAULTS.MAX_HOUR,
    pixelsPerHour: PLANNING_GRID_DEFAULTS.PIXELS_PER_HOUR,
  };

  it('retourne une position pour un créneau le même jour', () => {
    const day = new Date(2026, 3, 4);
    const layout = layoutSlotOnDay(
      '2026-04-04T08:00:00.000Z',
      '2026-04-04T09:00:00.000Z',
      day,
      opts,
    );
    expect(layout).not.toBeNull();
    expect(layout!.heightPx).toBeGreaterThan(0);
  });
});
