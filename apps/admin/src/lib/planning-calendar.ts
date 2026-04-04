/** 15 minutes en millisecondes (alignement UTC / timeline). */
export const MS_QUARTER_HOUR = 15 * 60 * 1000;

export const PLANNING_GRID_DEFAULTS = {
  MIN_HOUR: 8,
  MAX_HOUR: 22,
  PIXELS_PER_HOUR: 96,
} as const;

export type SlotLike = {
  id: string;
  coachMemberId: string;
  startsAt: string;
  endsAt: string;
};

/** Aligne un instant sur le multiple de 15 min UTC le plus proche (timeline). */
export function snapInstantToUtcQuarterHour(d: Date): Date {
  const t = d.getTime();
  return new Date(Math.round(t / MS_QUARTER_HOUR) * MS_QUARTER_HOUR);
}

/** Aligne un timestamp (ms) sur le quart d'heure local le plus proche (wall clock). */
export function snapToLocalQuarterHour(ms: number): number {
  return Math.round(ms / MS_QUARTER_HOUR) * MS_QUARTER_HOUR;
}

export function startOfLocalDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export type GridLayoutOpts = {
  minHour: number;
  maxHour: number;
  pixelsPerHour: number;
};

/**
 * Position verticale d'un créneau sur une colonne jour (heures locales).
 * Retourne null si le créneau ne coupe pas la plage affichée.
 */
export function layoutSlotOnDay(
  startsAt: string,
  endsAt: string,
  day: Date,
  opts: GridLayoutOpts,
): { topPx: number; heightPx: number } | null {
  const dayStart = startOfLocalDay(day);
  const dayEnd = new Date(dayStart);
  dayEnd.setDate(dayEnd.getDate() + 1);

  const s = new Date(startsAt);
  const e = new Date(endsAt);

  const visStart = s > dayStart ? s : dayStart;
  const visEnd = e < dayEnd ? e : dayEnd;
  if (visStart >= visEnd) return null;

  const gridStart = new Date(dayStart);
  gridStart.setHours(opts.minHour, 0, 0, 0);
  const gridEnd = new Date(dayStart);
  gridEnd.setHours(opts.maxHour, 0, 0, 0);

  const clipStart = visStart > gridStart ? visStart : gridStart;
  const clipEnd = visEnd < gridEnd ? visEnd : gridEnd;
  if (clipStart >= clipEnd) return null;

  const msPerPx = (60 * 60 * 1000) / opts.pixelsPerHour;
  const topMs = clipStart.getTime() - gridStart.getTime();
  const heightMs = clipEnd.getTime() - clipStart.getTime();
  return {
    topPx: topMs / msPerPx,
    heightPx: heightMs / msPerPx,
  };
}

/** Le créneau intersecte-t-il ce jour civil (local) ? */
export function slotIntersectsLocalDay(
  startsAt: string,
  endsAt: string,
  day: Date,
): boolean {
  const dayStart = startOfLocalDay(day);
  const dayEnd = new Date(dayStart);
  dayEnd.setDate(dayEnd.getDate() + 1);
  const s = new Date(startsAt);
  const e = new Date(endsAt);
  return s < dayEnd && e > dayStart;
}

/** IDs des créneaux en chevauchement pour le même coach (plage triée). */
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

/** Décale start/end en conservant la durée (ms). */
export function shiftInterval(
  startsAt: string,
  endsAt: string,
  deltaMs: number,
): { startsAt: Date; endsAt: Date } {
  const s = new Date(startsAt).getTime() + deltaMs;
  const e = new Date(endsAt).getTime() + deltaMs;
  return { startsAt: new Date(s), endsAt: new Date(e) };
}

/** Ajoute des jours calendaires locaux à une date (midi pour éviter DST edge). */
export function addLocalDays(base: Date, days: number): Date {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return d;
}
