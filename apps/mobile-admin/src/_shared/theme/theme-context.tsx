import { useQuery } from '@apollo/client/react';
import { gql } from '@apollo/client';
import {
  createContext,
  useContext,
  useMemo,
  type ReactNode,
} from 'react';
import { palette as basePalette, type AppPalette } from './tokens';
import { gradients as baseGradients, type AppGradients } from './gradients';
import { getVariantTheme, type ThemeVariant } from './variants';

const CLUB_BRANDING = gql`
  query ClubBranding {
    clubBranding {
      id
      name
      logoUrl
      tagline
      palette {
        ink
        ink2
        paper
        accent
        goldBright
        vermillion
        line
        muted
      }
    }
  }
`;

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

export type ClubTheme = {
  palette: AppPalette;
  gradients: AppGradients;
  variant: ThemeVariant;
  clubName: string | null;
  clubLogoUrl: string | null;
  clubTagline: string | null;
  isClubBranded: boolean;
};

function makeDefaultClubTheme(variant: ThemeVariant): ClubTheme {
  const v = getVariantTheme(variant);
  return {
    palette: v.palette,
    gradients: v.gradients,
    variant,
    clubName: null,
    clubLogoUrl: null,
    clubTagline: null,
    isClubBranded: false,
  };
}

const ClubThemeContext = createContext<ClubTheme>(
  makeDefaultClubTheme('member'),
);

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
  variant: ThemeVariant,
  data: ClubBrandingData | undefined,
): ClubTheme {
  const baseTheme = makeDefaultClubTheme(variant);
  if (!data?.clubBranding) return baseTheme;
  const { name, logoUrl, tagline, palette: p } = data.clubBranding;
  if (!p) {
    return {
      ...baseTheme,
      clubName: name,
      clubLogoUrl: logoUrl,
      clubTagline: tagline,
    };
  }

  const primary =
    p.accent ?? p.goldBright ?? baseTheme.palette.primary;
  const accent =
    p.goldBright ?? p.vermillion ?? baseTheme.palette.accent;
  const cool = p.vermillion ?? baseTheme.palette.cool;

  const palette = {
    ...baseTheme.palette,
    primary,
    accent,
    cool,
    ink: p.ink ?? baseTheme.palette.ink,
    inkSoft: p.ink2 ?? baseTheme.palette.inkSoft,
    body: p.ink2 ?? baseTheme.palette.body,
    muted: p.muted ?? baseTheme.palette.muted,
    border: p.line ?? baseTheme.palette.border,
    borderStrong: p.line ?? baseTheme.palette.borderStrong,
    bg: p.paper ?? baseTheme.palette.bg,
    gradientFrom: primary,
    gradientVia: accent,
    gradientTo: cool,
  } as AppPalette;

  const gradients = {
    ...baseTheme.gradients,
    primary: gradient2(primary, accent),
    hero:
      variant === 'admin'
        ? gradient3('#0f172a', primary, accent)
        : gradient3(primary, accent, cool),
    cool: gradient2(cool, baseTheme.palette.coolDark),
    warm: gradient2(accent, cool),
    surface: gradient2(palette.bg, baseTheme.palette.bgAlt),
  } as AppGradients;

  return {
    palette,
    gradients,
    variant,
    clubName: name,
    clubLogoUrl: logoUrl,
    clubTagline: tagline,
    isClubBranded: true,
  };
}

/**
 * Provider qui charge la query CLUB_BRANDING (cache-first) et propage
 * un theme override basé sur les couleurs du club. La variante (member/
 * admin) ne change pas le mécanisme : seules les couleurs de fallback
 * et le hero gradient diffèrent.
 */
export function ClubThemeProvider({
  variant = 'member',
  children,
}: {
  variant?: ThemeVariant;
  children: ReactNode;
}) {
  const { data } = useQuery<ClubBrandingData>(CLUB_BRANDING, {
    fetchPolicy: 'cache-and-network',
    nextFetchPolicy: 'cache-first',
    errorPolicy: 'all',
  });

  const value = useMemo(
    () => buildClubTheme(variant, data),
    [variant, data],
  );

  return (
    <ClubThemeContext.Provider value={value}>
      {children}
    </ClubThemeContext.Provider>
  );
}

export function useClubTheme(): ClubTheme {
  return useContext(ClubThemeContext);
}
