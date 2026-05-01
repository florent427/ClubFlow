import { useQuery } from '@apollo/client/react';
import {
  createContext,
  useContext,
  useMemo,
  type ReactNode,
} from 'react';
import { gradients as defaultGradients, palette as defaultPalette } from './theme';
import { CLUB_BRANDING } from './viewer-documents';

type ClubBrandingData = {
  clubBranding: {
    id: string;
    name: string;
    logoUrl: string | null;
    tagline: string | null;
    palette: {
      ink: string | null;
      ink2: string | null;
      paper: string | null;
      accent: string | null;
      goldBright: string | null;
      vermillion: string | null;
      line: string | null;
      muted: string | null;
    } | null;
  };
};

/**
 * Theme dynamique = palette par défaut overridée par les couleurs du
 * club courant si dispo. On ne mute PAS les exports `palette`/`gradients`
 * (ils restent les fallbacks par défaut). Les composants qui veulent
 * profiter du branding club appellent `useClubTheme()`.
 *
 * Mapping vitrine → mobile tokens :
 *   - palette.accent      → primary (ou goldBright en fallback)
 *   - palette.goldBright  → accent (couleur d'highlight premium)
 *   - palette.vermillion  → cool (accent secondaire chaud)
 *   - palette.ink         → ink (texte principal)
 *   - palette.muted       → muted
 *   - palette.line        → border
 *   - palette.paper       → bg
 */
export type ClubTheme = {
  palette: typeof defaultPalette;
  gradients: typeof defaultGradients;
  clubName: string | null;
  clubLogoUrl: string | null;
  clubTagline: string | null;
  /** True si la palette du club est appliquée (au moins l'accent défini). */
  isClubBranded: boolean;
};

const defaultClubTheme: ClubTheme = {
  palette: defaultPalette,
  gradients: defaultGradients,
  clubName: null,
  clubLogoUrl: null,
  clubTagline: null,
  isClubBranded: false,
};

const ClubThemeContext = createContext<ClubTheme>(defaultClubTheme);

/** Construit un dégradé linéaire à 2 couleurs avec garde-fous. */
function gradient2(
  from: string,
  to: string,
): { colors: readonly [string, string]; start: { x: number; y: number }; end: { x: number; y: number } } {
  return {
    colors: [from, to] as const,
    start: { x: 0, y: 0 },
    end: { x: 1, y: 1 },
  };
}

function gradient3(
  c1: string,
  c2: string,
  c3: string,
): {
  colors: readonly [string, string, string];
  start: { x: number; y: number };
  end: { x: number; y: number };
} {
  return {
    colors: [c1, c2, c3] as const,
    start: { x: 0, y: 0 },
    end: { x: 1, y: 1 },
  };
}

function buildClubTheme(
  data: ClubBrandingData | undefined,
): ClubTheme {
  if (!data?.clubBranding) return defaultClubTheme;
  const { name, logoUrl, tagline, palette: p } = data.clubBranding;
  if (!p) {
    return {
      ...defaultClubTheme,
      clubName: name,
      clubLogoUrl: logoUrl,
      clubTagline: tagline,
    };
  }

  // Couleur principale : on prend `accent` (CTA), sinon `goldBright`.
  const primary = p.accent ?? p.goldBright ?? defaultPalette.primary;
  const accent = p.goldBright ?? p.vermillion ?? defaultPalette.accent;
  const cool = p.vermillion ?? defaultPalette.cool;

  // Note : `defaultPalette` utilise `as const` qui rend les types des
  // valeurs trop stricts (literal types). On contourne avec `as` pour
  // permettre l'override par des strings dynamiques. Le type final reste
  // structurellement compatible.
  const palette = {
    ...defaultPalette,
    primary,
    accent,
    cool,
    ink: p.ink ?? defaultPalette.ink,
    inkSoft: p.ink2 ?? defaultPalette.inkSoft,
    body: p.ink2 ?? defaultPalette.body,
    muted: p.muted ?? defaultPalette.muted,
    border: p.line ?? defaultPalette.border,
    borderStrong: p.line ?? defaultPalette.borderStrong,
    bg: p.paper ?? defaultPalette.bg,
    gradientFrom: primary,
    gradientVia: accent,
    gradientTo: cool,
  } as typeof defaultPalette;

  const gradients = {
    ...defaultGradients,
    primary: gradient2(primary, accent),
    hero: gradient3(primary, accent, cool),
    cool: gradient2(cool, defaultPalette.coolDark),
    warm: gradient2(accent, cool),
    surface: gradient2(palette.bg, defaultPalette.bgAlt),
  } as typeof defaultGradients;

  return {
    palette,
    gradients,
    clubName: name,
    clubLogoUrl: logoUrl,
    clubTagline: tagline,
    isClubBranded: true,
  };
}

/**
 * Provider qui charge la query CLUB_BRANDING et propage un theme
 * override basé sur les couleurs du club. Si la session mobile n'est
 * pas encore initialisée (token/clubId absents), Apollo ne lance pas
 * la query et le default theme s'applique.
 *
 * **Politique de cache** : `cache-and-network` à chaque mount —
 * affiche immédiatement la dernière valeur connue, puis rafraîchit
 * depuis le serveur. Indispensable pour récupérer un nouveau logo
 * dès que l'admin l'upload, sans devoir kill l'app. La requête est
 * légère (un seul row, quelques champs), donc on peut se permettre de
 * la rejouer à chaque ouverture du provider.
 */
export function ClubThemeProvider({ children }: { children: ReactNode }) {
  const { data } = useQuery<ClubBrandingData>(CLUB_BRANDING, {
    fetchPolicy: 'cache-and-network',
    nextFetchPolicy: 'cache-and-network',
    errorPolicy: 'all',
  });

  const value = useMemo(() => buildClubTheme(data), [data]);

  return (
    <ClubThemeContext.Provider value={value}>
      {children}
    </ClubThemeContext.Provider>
  );
}

/** Hook pour récupérer le theme dynamique du club. */
export function useClubTheme(): ClubTheme {
  return useContext(ClubThemeContext);
}
