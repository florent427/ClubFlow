/**
 * Design tokens premium — palette riche, gradients, typo Inter,
 * ombres profondes pour un rendu "wow".
 *
 * Variantes : `member` (default, indigo→violet) et `admin` (sobre, indigo + accent cuivré).
 */

export const palette = {
  primary: '#4f46e5',
  primaryDark: '#3730a3',
  primaryLight: '#e0e7ff',
  primaryTint: '#eef2ff',

  accent: '#a855f7',
  accentDark: '#7e22ce',
  accentLight: '#f3e8ff',

  cool: '#06b6d4',
  coolDark: '#0e7490',
  coolLight: '#cffafe',

  success: '#10b981',
  successBg: '#d1fae5',
  successBorder: '#6ee7b7',
  successText: '#047857',
  warning: '#f59e0b',
  warningBg: '#fef3c7',
  warningBorder: '#fcd34d',
  warningText: '#92400e',
  danger: '#ef4444',
  dangerBg: '#fee2e2',
  dangerBorder: '#fca5a5',
  dangerText: '#991b1b',
  info: '#0ea5e9',
  infoBg: '#e0f2fe',
  infoText: '#075985',

  ink: '#0f172a',
  inkSoft: '#1e293b',
  body: '#334155',
  muted: '#64748b',
  mutedSoft: '#94a3b8',
  mutedExtra: '#cbd5e1',
  border: '#e2e8f0',
  borderStrong: '#cbd5e1',
  surface: '#ffffff',
  surfaceAlt: '#fafbff',
  bg: '#f5f6fb',
  bgAlt: '#eef0f7',

  glass: 'rgba(255, 255, 255, 0.7)',
  glassDark: 'rgba(15, 23, 42, 0.6)',

  overlay: 'rgba(15, 23, 42, 0.55)',

  gradientFrom: '#4f46e5',
  gradientVia: '#7c3aed',
  gradientTo: '#ec4899',
} as const;

export type AppPalette = typeof palette;

export const spacing = {
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
  huge: 48,
  giant: 64,
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 28,
  pill: 999,
} as const;

export const shadow = {
  none: {},
  sm: {
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 2,
    elevation: 1,
  },
  md: {
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4,
  },
  lg: {
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.15,
    shadowRadius: 24,
    elevation: 12,
  },
  glowPrimary: {
    shadowColor: '#4f46e5',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35,
    shadowRadius: 16,
    elevation: 8,
  },
  glowAccent: {
    shadowColor: '#a855f7',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35,
    shadowRadius: 16,
    elevation: 8,
  },
  glowAdmin: {
    shadowColor: '#b45309',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.32,
    shadowRadius: 16,
    elevation: 8,
  },
} as const;

export const tapTarget = 48;

export const iconSize = {
  sm: 16,
  md: 20,
  lg: 24,
  xl: 32,
  hero: 56,
} as const;

export const motion = {
  fast: 150,
  normal: 220,
  slow: 320,
} as const;
