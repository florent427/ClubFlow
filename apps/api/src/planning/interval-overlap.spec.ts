import { intervalsOverlap } from './interval-overlap';

describe('intervalsOverlap', () => {
  it('détecte un chevauchement partiel', () => {
    const a0 = new Date('2026-04-01T10:00:00.000Z');
    const a1 = new Date('2026-04-01T11:00:00.000Z');
    const b0 = new Date('2026-04-01T10:30:00.000Z');
    const b1 = new Date('2026-04-01T11:30:00.000Z');
    expect(intervalsOverlap(a0, a1, b0, b1)).toBe(true);
  });

  it('rejette des créneaux adjacents sans intersection', () => {
    const a0 = new Date('2026-04-01T10:00:00.000Z');
    const a1 = new Date('2026-04-01T11:00:00.000Z');
    const b0 = new Date('2026-04-01T11:00:00.000Z');
    const b1 = new Date('2026-04-01T12:00:00.000Z');
    expect(intervalsOverlap(a0, a1, b0, b1)).toBe(false);
  });

  it('inclut l’emboîtement total', () => {
    const outer0 = new Date('2026-04-01T09:00:00.000Z');
    const outer1 = new Date('2026-04-01T12:00:00.000Z');
    const inner0 = new Date('2026-04-01T10:00:00.000Z');
    const inner1 = new Date('2026-04-01T10:30:00.000Z');
    expect(intervalsOverlap(outer0, outer1, inner0, inner1)).toBe(true);
  });
});
