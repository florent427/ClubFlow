export type Gradient2 = {
  colors: readonly [string, string];
  start: { x: number; y: number };
  end: { x: number; y: number };
};
export type Gradient3 = {
  colors: readonly [string, string, string];
  start: { x: number; y: number };
  end: { x: number; y: number };
};

export const gradients = {
  primary: {
    colors: ['#4f46e5', '#7c3aed'] as const,
    start: { x: 0, y: 0 },
    end: { x: 1, y: 1 },
  } satisfies Gradient2,
  hero: {
    colors: ['#4f46e5', '#7c3aed', '#ec4899'] as const,
    start: { x: 0, y: 0 },
    end: { x: 1, y: 1 },
  } satisfies Gradient3,
  cool: {
    colors: ['#0ea5e9', '#06b6d4'] as const,
    start: { x: 0, y: 0 },
    end: { x: 1, y: 1 },
  } satisfies Gradient2,
  warm: {
    colors: ['#f59e0b', '#ef4444'] as const,
    start: { x: 0, y: 0 },
    end: { x: 1, y: 1 },
  } satisfies Gradient2,
  surface: {
    colors: ['#fafbff', '#eef0f7'] as const,
    start: { x: 0, y: 0 },
    end: { x: 0, y: 1 },
  } satisfies Gradient2,
  glassFromTop: {
    colors: ['rgba(255,255,255,0.85)', 'rgba(255,255,255,0.55)'] as const,
    start: { x: 0, y: 0 },
    end: { x: 0, y: 1 },
  } satisfies Gradient2,
  dark: {
    colors: ['#0f172a', '#1e293b', '#334155'] as const,
    start: { x: 0, y: 0 },
    end: { x: 1, y: 1 },
  } satisfies Gradient3,
} as const;

export type AppGradients = typeof gradients;
