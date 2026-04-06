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

/**
 * Inverse de la position verticale dans la grille : Y (px) depuis le haut de la zone
 * [minHour, maxHour] → instant de début local, puis snap quart d'heure UTC.
 */
export function gridRelativeYToStartDate(
  relY: number,
  day: Date,
  opts: GridLayoutOpts,
): Date {
  const totalPx =
    (opts.maxHour - opts.minHour) * opts.pixelsPerHour;
  const clamped = Math.max(0, Math.min(relY, totalPx));
  const msPerPx = (60 * 60 * 1000) / opts.pixelsPerHour;
  const topMs = clamped * msPerPx;
  const dayStart = startOfLocalDay(day);
  const gridStart = new Date(dayStart);
  gridStart.setHours(opts.minHour, 0, 0, 0);
  const raw = new Date(gridStart.getTime() + topMs);
  return snapInstantToUtcQuarterHour(raw);
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

function intervalsOverlapMs(
  aStart: number,
  aEnd: number,
  bStart: number,
  bEnd: number,
): boolean {
  return aStart < bEnd && bStart < aEnd;
}

/**
 * Pour une journée donnée, répartit la largeur entre créneaux dont les intervalles
 * se chevauchent (clusters connexes). Dans chaque cluster : colonnes gloutonnes,
 * largeur = 100% / nombre de colonnes du cluster.
 */
export function layoutOverlappingSlotsForDay(
  slots: SlotLike[],
  day: Date,
): Map<string, { leftPct: number; widthPct: number }> {
  const daySlots = slots.filter((s) =>
    slotIntersectsLocalDay(s.startsAt, s.endsAt, day),
  );
  const out = new Map<string, { leftPct: number; widthPct: number }>();
  if (daySlots.length === 0) return out;

  const n = daySlots.length;
  const parent = Array.from({ length: n }, (_, i) => i);
  function find(i: number): number {
    if (parent[i] !== i) parent[i] = find(parent[i]);
    return parent[i];
  }
  function union(i: number, j: number): void {
    const ri = find(i);
    const rj = find(j);
    if (ri !== rj) parent[rj] = ri;
  }

  for (let i = 0; i < n; i++) {
    const ai = +new Date(daySlots[i].startsAt);
    const ae = +new Date(daySlots[i].endsAt);
    for (let j = i + 1; j < n; j++) {
      const bi = +new Date(daySlots[j].startsAt);
      const be = +new Date(daySlots[j].endsAt);
      if (intervalsOverlapMs(ai, ae, bi, be)) union(i, j);
    }
  }

  const byRoot = new Map<number, number[]>();
  for (let i = 0; i < n; i++) {
    const r = find(i);
    const list = byRoot.get(r) ?? [];
    list.push(i);
    byRoot.set(r, list);
  }

  for (const indices of byRoot.values()) {
    const cluster = indices.map((i) => daySlots[i]);
    cluster.sort((a, b) => {
      const ds = +new Date(a.startsAt) - +new Date(b.startsAt);
      if (ds !== 0) return ds;
      return +new Date(b.endsAt) - +new Date(a.endsAt);
    });

    const colEnds: number[] = [];
    const colById = new Map<string, number>();

    for (const ev of cluster) {
      const s = +new Date(ev.startsAt);
      const e = +new Date(ev.endsAt);
      let placed = false;
      for (let c = 0; c < colEnds.length; c++) {
        if (colEnds[c] <= s) {
          colEnds[c] = e;
          colById.set(ev.id, c);
          placed = true;
          break;
        }
      }
      if (!placed) {
        colById.set(ev.id, colEnds.length);
        colEnds.push(e);
      }
    }

    const numCols = colEnds.length;
    const w = 100 / numCols;
    // Réordonne les colonnes gauche → droite par min(id) sur la piste, pas par heure de début.
    // Le coloriage reste optimal (tri par startsAt) ; seul l’affichage horizontal change.
    // Ainsi une carte « à droite » (id plus petit) peut commencer plus haut qu’une « à gauche ».
    const minIdByCol = new Map<number, string>();
    for (const ev of cluster) {
      const c = colById.get(ev.id) ?? 0;
      const prev = minIdByCol.get(c);
      if (prev === undefined || ev.id < prev) minIdByCol.set(c, ev.id);
    }
    const colOrder = [...minIdByCol.keys()].sort((a, b) => {
      const cmp = minIdByCol.get(a)!.localeCompare(minIdByCol.get(b)!);
      return cmp !== 0 ? cmp : a - b;
    });
    const colToRank = new Map<number, number>();
    colOrder.forEach((c, rank) => colToRank.set(c, rank));

    for (const ev of cluster) {
      const col = colById.get(ev.id) ?? 0;
      const rank = colToRank.get(col) ?? 0;
      out.set(ev.id, { leftPct: rank * w, widthPct: w });
    }
  }

  return out;
}
