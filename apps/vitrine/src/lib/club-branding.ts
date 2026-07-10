import 'server-only';
import { fetchGraphQL } from './graphql-client';

/**
 * Branding global du club (logo, descriptions, nav/footer content).
 *
 * Les données viennent de `publicClubBranding` côté API. Si le club n'a
 * pas encore configuré son branding, on sert un fallback NEUTRE (aucun
 * contenu spécifique à un club — pas de fuite de marque inter-tenant).
 */

export interface ClubPalette {
  ink?: string;
  ink2?: string;
  paper?: string;
  accent?: string;
  goldBright?: string;
  vermillion?: string;
  line?: string;
  muted?: string;
  bg?: string;
  bg2?: string;
  fg?: string;
}

export interface ClubFonts {
  /** Nom Google Fonts (ex. "Cormorant Garamond"). */
  serif?: string;
  /** Nom Google Fonts (ex. "Inter"). */
  sans?: string;
  /** Nom Google Fonts (ex. "Shippori Mincho"). */
  jp?: string;
}

export interface ClubBranding {
  clubName: string;
  kanjiTagline: string;
  logoUrl: string | null;
  palette: ClubPalette | null;
  fonts: ClubFonts | null;
  footer: {
    tagline: string;
    brandLine: string;
    description: string;
    socialLinks: Array<{ href: string; label: string; icon: string }>;
    columns: Array<{
      title: string;
      links: Array<{ href: string; label: string; external?: boolean }>;
    }>;
    contact: { address: string; phone: string; email: string };
    legalBottomRight: string;
  };
}

/**
 * Fallback NEUTRE — servi à tout club sans branding configuré.
 * Aucune référence à un club spécifique (liens sociaux vides, pas de
 * tagline, coordonnées vides) : seul le nom réel du club est injecté
 * quand il est connu.
 */
function neutralFallbackBranding(clubName = 'Mon club'): ClubBranding {
  return {
    clubName,
    kanjiTagline: '',
    logoUrl: null,
    palette: null,
    fonts: null,
    footer: {
      tagline: '',
      brandLine: clubName,
      description: 'Site propulsé par ClubFlow.',
      socialLinks: [],
      columns: [
        {
          title: 'Navigation',
          links: [
            { href: '/', label: 'Accueil' },
            { href: '/club', label: 'Le Club' },
            { href: '/cours', label: 'Cours' },
            { href: '/equipe', label: 'Équipe' },
            { href: '/dojo', label: 'Dojo' },
          ],
        },
        {
          title: 'Infos',
          links: [
            { href: '/tarifs', label: 'Tarifs' },
            { href: '/galerie', label: 'Galerie' },
            { href: '/actualites', label: 'Actualités' },
            { href: '/blog', label: 'Blog' },
            { href: '/competitions', label: 'Compétitions' },
            { href: '/contact', label: 'Contact' },
          ],
        },
      ],
      contact: { address: '', phone: '', email: '' },
      legalBottomRight: '',
    },
  };
}

interface PublicClubBrandingQueryData {
  publicClubBranding: {
    clubId: string;
    clubName: string;
    kanjiTagline: string | null;
    logoUrl: string | null;
    footerContent: string | null;
    paletteJson: string | null;
    fontsJson: string | null;
  } | null;
}

const PUBLIC_CLUB_BRANDING = /* GraphQL */ `
  query PublicClubBranding($slug: String!) {
    publicClubBranding(slug: $slug) {
      clubId
      clubName
      kanjiTagline
      logoUrl
      footerContent
      paletteJson
      fontsJson
    }
  }
`;

export async function fetchClubBranding(
  slug: string,
  clubName?: string,
): Promise<ClubBranding> {
  try {
    const data = await fetchGraphQL<PublicClubBrandingQueryData>(
      PUBLIC_CLUB_BRANDING,
      { slug },
      { revalidate: 300 },
    );
    const b = data.publicClubBranding;
    if (!b) return neutralFallbackBranding(clubName);
    const fallback = neutralFallbackBranding(b.clubName);
    // Merge tolérant : un footerContent partiel (contact/columns absents ou
    // null) ne doit jamais faire crasher le layout SSR.
    let footer = fallback.footer;
    if (b.footerContent) {
      const parsed = JSON.parse(b.footerContent) as Partial<
        ClubBranding['footer']
      >;
      footer = {
        ...fallback.footer,
        ...parsed,
        socialLinks: parsed.socialLinks ?? fallback.footer.socialLinks,
        columns: parsed.columns ?? fallback.footer.columns,
        contact: parsed.contact ?? fallback.footer.contact,
      };
    }
    const palette = b.paletteJson
      ? (JSON.parse(b.paletteJson) as ClubPalette)
      : null;
    const fonts = b.fontsJson
      ? (JSON.parse(b.fontsJson) as ClubFonts)
      : null;
    return {
      clubName: b.clubName,
      kanjiTagline: b.kanjiTagline ?? '',
      logoUrl: b.logoUrl,
      palette,
      fonts,
      footer,
    };
  } catch {
    return neutralFallbackBranding(clubName);
  }
}

/**
 * Convertit une palette custom en bloc CSS vars à injecter dans `<style>`
 * racine (scope `:root`). Chaque clé devient `--<kebab-case>`.
 */
export function paletteToCssVars(palette: ClubPalette | null): string {
  if (!palette) return '';
  const mapping: Record<keyof ClubPalette, string> = {
    ink: '--ink',
    ink2: '--ink-2',
    paper: '--paper',
    accent: '--accent',
    goldBright: '--gold-bright',
    vermillion: '--vermillion',
    line: '--line',
    muted: '--muted',
    bg: '--bg',
    bg2: '--bg-2',
    fg: '--fg',
  };
  const entries = Object.entries(palette)
    .filter(([, v]) => typeof v === 'string' && v.length > 0)
    .map(([k, v]) => `${mapping[k as keyof ClubPalette]}: ${v};`)
    .join(' ');
  return entries ? `:root { ${entries} }` : '';
}
