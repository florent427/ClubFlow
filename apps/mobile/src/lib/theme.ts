/**
 * Design tokens centralisés — palette, typo, espacement, ombres.
 *
 * Inspirés de Tailwind/Slate pour la palette neutre, et d'un bleu
 * "club" (#1565c0) comme couleur principale héritée du portail web.
 *
 * Convention : utiliser ces tokens dans les écrans plutôt que des
 * valeurs hardcodées. L'audit a montré que le mélange #b00020 / #c62828
 * (deux rouges différents pour erreur et danger) ou les paddings
 * 12/13/14/17 sans logique pénalisaient la cohérence visuelle.
 */

export const palette = {
  // Couleur primaire — bleu ClubFlow (hérité du portail web).
  primary: '#1565c0',
  primaryDark: '#0d47a1',
  primaryLight: '#dbeafe',
  primaryTint: '#e3f2fd',

  // Couleur d'accentuation pour les badges premium / KPIs payeurs.
  accent: '#7c3aed',

  // Sémantique : succès / warning / erreur / info.
  success: '#16a34a',
  successBg: '#dcfce7',
  successBorder: '#86efac',
  warning: '#f59e0b',
  warningBg: '#fef3c7',
  warningBorder: '#fcd34d',
  danger: '#dc2626',
  dangerBg: '#fee2e2',
  dangerBorder: '#fecaca',
  info: '#0284c7',
  infoBg: '#e0f2fe',

  // Neutres (Slate-ish — bonne lisibilité, contraste WCAG AA garanti).
  ink: '#0f172a', // titres, texte principal
  inkSoft: '#1e293b', // texte secondaire fort
  body: '#334155', // body text
  muted: '#64748b', // hints, placeholders
  mutedSoft: '#94a3b8', // labels secondaires
  border: '#e2e8f0', // bordures par défaut
  borderStrong: '#cbd5e1', // bordures actives / inputs
  surface: '#ffffff', // cartes, panneaux, modales
  bg: '#f8fafc', // fond de page
  bgAlt: '#f1f5f9', // alternance ligne / chip neutre

  // Overlay (modales, backdrop emoji picker).
  overlay: 'rgba(15, 23, 42, 0.5)',
} as const;

/** Espacement basé sur une grille 4 — utiliser ces valeurs partout. */
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
} as const;

/** Rayons. */
export const radius = {
  sm: 6,
  md: 8,
  lg: 12,
  xl: 16,
  pill: 999,
} as const;

/**
 * Typographie — taille / line-height / poids.
 * Les `weight` sont des strings car React Native exige le format `'700'`.
 */
export const typography = {
  // Display — onboarding, hero
  displayXl: { fontSize: 32, lineHeight: 40, fontWeight: '800' as const },
  displayLg: { fontSize: 28, lineHeight: 36, fontWeight: '700' as const },

  // Titres
  h1: { fontSize: 24, lineHeight: 32, fontWeight: '700' as const },
  h2: { fontSize: 20, lineHeight: 28, fontWeight: '700' as const },
  h3: { fontSize: 17, lineHeight: 24, fontWeight: '700' as const },

  // Body
  bodyLg: { fontSize: 16, lineHeight: 24, fontWeight: '400' as const },
  body: { fontSize: 15, lineHeight: 22, fontWeight: '400' as const },
  bodyStrong: { fontSize: 15, lineHeight: 22, fontWeight: '600' as const },
  small: { fontSize: 13, lineHeight: 18, fontWeight: '400' as const },
  smallStrong: { fontSize: 13, lineHeight: 18, fontWeight: '600' as const },
  caption: { fontSize: 11, lineHeight: 14, fontWeight: '500' as const },

  // Eyebrow (label uppercase au-dessus d'un titre)
  eyebrow: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '700' as const,
    letterSpacing: 1.2,
    textTransform: 'uppercase' as const,
  },

  // Numérique (KPIs)
  metric: { fontSize: 22, lineHeight: 28, fontWeight: '700' as const },
} as const;

/** Ombres iOS-friendly (RN ne supporte pas tous les cas Android). */
export const shadow = {
  none: {},
  sm: {
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  md: {
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 3,
  },
  lg: {
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 6,
  },
} as const;

/** Hauteur minimale recommandée pour un tap target (Apple HIG : 44pt, Android : 48dp). */
export const tapTarget = 48;

/** Convention : icônes Material Symbols / Ionicons taille standard. */
export const iconSize = {
  sm: 16,
  md: 20,
  lg: 24,
  xl: 32,
  hero: 56,
} as const;
