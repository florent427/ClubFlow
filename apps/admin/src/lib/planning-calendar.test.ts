import { describe, expect, it } from 'vitest';
import {
  coachOverlapIds,
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
