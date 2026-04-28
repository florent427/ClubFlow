/**
 * Design tokens premium — palette riche, gradients, typo Inter,
 * ombres profondes pour un rendu "wow".
 *
 * Inspiré des UI fintech / sport modernes (Strava, Nike Training,
 * Linear Mobile) : indigo profond avec accents cyan/violet,
 * typographie Inter à letter-spacing serré, ombres généreuses.
 */

export const palette = {
  // === Primaire : indigo profond, plus vibrant que le navy classique ===
  primary: '#4f46e5', // indigo-600
  primaryDark: '#3730a3', // indigo-800
  primaryLight: '#e0e7ff', // indigo-100
  primaryTint: '#eef2ff', // indigo-50

  // === Accent : violet / fuchsia pour le wow-factor ===
  accent: '#a855f7', // purple-500
  accentDark: '#7e22ce', // purple-700
  accentLight: '#f3e8ff', // purple-100

  // === Tertiaire cyan / teal pour graphes et KPIs frais ===
  cool: '#06b6d4', // cyan-500
  coolDark: '#0e7490', // cyan-700
  coolLight: '#cffafe', // cyan-100

  // === Sémantique ===
  success: '#10b981', // emerald-500
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

  // === Neutres (Slate) ===
  ink: '#0f172a',
  inkSoft: '#1e293b',
  body: '#334155',
  muted: '#64748b',
  mutedSoft: '#94a3b8',
  mutedExtra: '#cbd5e1',
  border: '#e2e8f0',
  borderStrong: '#cbd5e1',
  surface: '#ffffff',
  surfaceAlt: '#fafbff', // surface très légèrement teintée indigo
  bg: '#f5f6fb', // fond global avec un soupçon de bleu
  bgAlt: '#eef0f7',

  // Surface verre (glassmorphism)
  glass: 'rgba(255, 255, 255, 0.7)',
  glassDark: 'rgba(15, 23, 42, 0.6)',

  overlay: 'rgba(15, 23, 42, 0.55)',

  // === Couleurs spécifiques pour gradients ===
  gradientFrom: '#4f46e5', // indigo
  gradientVia: '#7c3aed', // violet
  gradientTo: '#ec4899', // pink — pour effets premium "rainbow"
} as const;

/**
 * Gradients prêts à l'emploi pour LinearGradient.
 * Utiliser : `colors={gradients.primary.colors}` + `start/end`.
 */
export const gradients = {
  primary: {
    colors: ['#4f46e5', '#7c3aed'] as readonly [string, string],
    start: { x: 0, y: 0 },
    end: { x: 1, y: 1 },
  },
  /** Hero "wow" : indigo → violet → pink. */
  hero: {
    colors: ['#4f46e5', '#7c3aed', '#ec4899'] as readonly [
      string,
      string,
      string,
    ],
    start: { x: 0, y: 0 },
    end: { x: 1, y: 1 },
  },
  cool: {
    colors: ['#0ea5e9', '#06b6d4'] as readonly [string, string],
    start: { x: 0, y: 0 },
    end: { x: 1, y: 1 },
  },
  warm: {
    colors: ['#f59e0b', '#ef4444'] as readonly [string, string],
    start: { x: 0, y: 0 },
    end: { x: 1, y: 1 },
  },
  /** Subtle wash pour surfaces légères. */
  surface: {
    colors: ['#fafbff', '#eef0f7'] as readonly [string, string],
    start: { x: 0, y: 0 },
    end: { x: 0, y: 1 },
  },
  /** Card glass pour overlays sur photo/gradient. */
  glassFromTop: {
    colors: [
      'rgba(255,255,255,0.85)',
      'rgba(255,255,255,0.55)',
    ] as readonly [string, string],
    start: { x: 0, y: 0 },
    end: { x: 0, y: 1 },
  },
  /** Dark hero alternatif. */
  dark: {
    colors: ['#0f172a', '#1e293b', '#334155'] as readonly [
      string,
      string,
      string,
    ],
    start: { x: 0, y: 0 },
    end: { x: 1, y: 1 },
  },
} as const;

/** Espacement basé sur grille 4. */
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

/** Rayons. */
export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 28,
  pill: 999,
} as const;

/**
 * Familles de polices Inter (chargée via @expo-google-fonts/inter au
 * boot dans App.tsx). Si la police n'est pas chargée, RN tombe sur
 * la system font — pas de crash, juste un visuel un peu moins premium.
 */
export const fontFamily = {
  regular: 'Inter_400Regular',
  medium: 'Inter_500Medium',
  semibold: 'Inter_600SemiBold',
  bold: 'Inter_700Bold',
  extrabold: 'Inter_800ExtraBold',
  black: 'Inter_900Black',
} as const;

/**
 * Typographie premium — letter-spacing serré sur les titres pour effet
 * "compact tight" type Linear / Stripe.
 */
export const typography = {
  displayXl: {
    fontSize: 36,
    lineHeight: 42,
    fontFamily: fontFamily.extrabold,
    letterSpacing: -1.2,
  },
  displayLg: {
    fontSize: 30,
    lineHeight: 36,
    fontFamily: fontFamily.bold,
    letterSpacing: -0.8,
  },
  h1: {
    fontSize: 24,
    lineHeight: 30,
    fontFamily: fontFamily.bold,
    letterSpacing: -0.5,
  },
  h2: {
    fontSize: 20,
    lineHeight: 26,
    fontFamily: fontFamily.bold,
    letterSpacing: -0.3,
  },
  h3: {
    fontSize: 17,
    lineHeight: 22,
    fontFamily: fontFamily.semibold,
    letterSpacing: -0.2,
  },
  bodyLg: {
    fontSize: 16,
    lineHeight: 24,
    fontFamily: fontFamily.regular,
  },
  body: {
    fontSize: 15,
    lineHeight: 22,
    fontFamily: fontFamily.regular,
  },
  bodyStrong: {
    fontSize: 15,
    lineHeight: 22,
    fontFamily: fontFamily.semibold,
  },
  small: {
    fontSize: 13,
    lineHeight: 18,
    fontFamily: fontFamily.regular,
  },
  smallStrong: {
    fontSize: 13,
    lineHeight: 18,
    fontFamily: fontFamily.semibold,
  },
  caption: {
    fontSize: 11,
    lineHeight: 14,
    fontFamily: fontFamily.medium,
  },
  eyebrow: {
    fontSize: 11,
    lineHeight: 14,
    fontFamily: fontFamily.bold,
    letterSpacing: 1.5,
    textTransform: 'uppercase' as const,
  },
  metric: {
    fontSize: 26,
    lineHeight: 30,
    fontFamily: fontFamily.extrabold,
    letterSpacing: -0.8,
  },
  metricLg: {
    fontSize: 36,
    lineHeight: 40,
    fontFamily: fontFamily.extrabold,
    letterSpacing: -1.2,
  },
} as const;

/** Ombres profondes — premium feel. */
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
  /** Ombre indigo glow — pour boutons primaires premium. */
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
} as const;

export const tapTarget = 48;

export const iconSize = {
  sm: 16,
  md: 20,
  lg: 24,
  xl: 32,
  hero: 56,
} as const;

/** Durées d'animation alignées sur Apple HIG. */
export const motion = {
  fast: 150,
  normal: 220,
  slow: 320,
} as const;
