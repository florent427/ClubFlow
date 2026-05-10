import { palette as basePalette, type AppPalette } from './tokens';
import { gradients as baseGradients, type AppGradients } from './gradients';

/**
 * Variantes de palette pour les deux apps mobile.
 * - `member` : indigo→violet→pink (par défaut, app membre)
 * - `admin`  : indigo→cuivré, hero sombre, sobre/professionnel
 */
export type ThemeVariant = 'member' | 'admin';

export type VariantTheme = {
  palette: AppPalette;
  gradients: AppGradients;
};

const memberTheme: VariantTheme = {
  palette: basePalette,
  gradients: baseGradients,
};

/**
 * Surcouche admin : palette indigo conservée, accent passé au cuivré
 * (#b45309), hero sombre slate→indigo→cuivré subtle.
 */
const adminTheme: VariantTheme = {
  palette: {
    ...basePalette,
    accent: '#b45309',
    accentDark: '#78350f',
    accentLight: '#fef3c7',
    gradientFrom: '#1e1b4b',
    gradientVia: '#312e81',
    gradientTo: '#b45309',
  } as unknown as AppPalette,
  gradients: {
    ...baseGradients,
    hero: {
      colors: ['#0f172a', '#1e1b4b', '#312e81'] as const,
      start: { x: 0, y: 0 },
      end: { x: 1, y: 1 },
    },
    primary: {
      colors: ['#4f46e5', '#b45309'] as const,
      start: { x: 0, y: 0 },
      end: { x: 1, y: 1 },
    },
  } as unknown as AppGradients,
};

export const variants: Record<ThemeVariant, VariantTheme> = {
  member: memberTheme,
  admin: adminTheme,
};

export function getVariantTheme(variant: ThemeVariant): VariantTheme {
  return variants[variant];
}
