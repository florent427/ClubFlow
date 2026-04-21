import 'server-only';
import { fetchGraphQL } from './graphql-client';

/**
 * Branding global du club (logo, descriptions, nav/footer content).
 *
 * En Phase 1 on hardcode un fallback SKSR pour avoir un site démonstrable
 * immédiatement. Dès que `publicClubBranding` est ajouté côté API, on
 * passera sur le backend.
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

const FB_ICON = `<svg viewBox="0 0 24 24"><path d="M13.4 21v-7.9h2.7l.4-3.1h-3.1V8c0-.9.2-1.5 1.5-1.5h1.6V3.7c-.3 0-1.2-.1-2.3-.1-2.3 0-3.9 1.4-3.9 4v2.3H7.6v3.1h2.7V21h3.1z"/></svg>`;
const IG_ICON = `<svg viewBox="0 0 24 24"><path d="M12 2.2c3.2 0 3.6 0 4.9.1 1.2.1 1.8.3 2.2.4.6.2 1 .5 1.4.9.4.4.7.8.9 1.4.2.4.4 1 .4 2.2.1 1.3.1 1.6.1 4.9s0 3.6-.1 4.9c-.1 1.2-.3 1.8-.4 2.2-.2.6-.5 1-.9 1.4-.4.4-.8.7-1.4.9-.4.2-1 .4-2.2.4-1.3.1-1.6.1-4.9.1s-3.6 0-4.9-.1c-1.2-.1-1.8-.3-2.2-.4-.6-.2-1-.5-1.4-.9-.4-.4-.7-.8-.9-1.4-.2-.4-.4-1-.4-2.2-.1-1.3-.1-1.6-.1-4.9s0-3.6.1-4.9c.1-1.2.3-1.8.4-2.2.2-.6.5-1 .9-1.4.4-.4.8-.7 1.4-.9.4-.2 1-.4 2.2-.4 1.3-.1 1.6-.1 4.9-.1M12 0C8.7 0 8.3 0 7.1.1 5.8.1 4.9.3 4.2.6c-.8.3-1.5.7-2.1 1.4-.7.6-1.1 1.3-1.4 2.1-.3.7-.5 1.6-.5 2.9C.1 8.3 0 8.7 0 12s0 3.7.1 4.9c.1 1.3.2 2.2.5 2.9.3.8.7 1.5 1.4 2.1.6.7 1.3 1.1 2.1 1.4.7.3 1.6.5 2.9.5C8.3 23.9 8.7 24 12 24s3.7 0 4.9-.1c1.3-.1 2.2-.2 2.9-.5.8-.3 1.5-.7 2.1-1.4.7-.6 1.1-1.3 1.4-2.1.3-.7.5-1.6.5-2.9.1-1.3.1-1.7.1-5s0-3.7-.1-4.9c-.1-1.3-.2-2.2-.5-2.9-.3-.8-.7-1.5-1.4-2.1-.6-.7-1.3-1.1-2.1-1.4-.7-.3-1.6-.5-2.9-.5C15.7.1 15.3 0 12 0zm0 5.8C8.6 5.8 5.8 8.6 5.8 12s2.8 6.2 6.2 6.2 6.2-2.8 6.2-6.2S15.4 5.8 12 5.8zm0 10.2c-2.2 0-4-1.8-4-4s1.8-4 4-4 4 1.8 4 4-1.8 4-4 4zm6.4-11.8c-.8 0-1.4.6-1.4 1.4s.6 1.4 1.4 1.4 1.4-.6 1.4-1.4-.6-1.4-1.4-1.4z"/></svg>`;

const FALLBACK_BRANDING: ClubBranding = {
  clubName: 'Shotokan Karaté',
  kanjiTagline: '空手道 · Sud Réunion',
  logoUrl: null,
  palette: null,
  fonts: null,
  footer: {
    tagline: '空手に先手なし',
    brandLine: 'Shotokan\nKaraté Sud\nRéunion',
    description:
      "L'école de karaté traditionnel Shotokan du sud de La Réunion. Depuis 2009.",
    socialLinks: [
      {
        href: 'https://www.facebook.com/sksr974',
        label: 'Facebook',
        icon: FB_ICON,
      },
      {
        href: 'https://www.instagram.com/sksr.974/',
        label: 'Instagram',
        icon: IG_ICON,
      },
    ],
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
          { href: '/competitions', label: 'Compétitions' },
          { href: '/contact', label: 'Contact' },
          {
            href: 'https://www.helloasso.com/associations/shotokan-karate-sud-reunion',
            label: 'Adhérer via HelloAsso ↗',
            external: true,
          },
        ],
      },
    ],
    contact: {
      address: '13 bis rue du stade\n97427 L’Étang-Salé\nLa Réunion',
      phone: '0692 93 42 46',
      email: 'sksr.club@yahoo.fr',
    },
    legalBottomRight: 'Affilié FFKDA · Ligue de Karaté de La Réunion',
  },
};

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

export async function fetchClubBranding(slug: string): Promise<ClubBranding> {
  try {
    const data = await fetchGraphQL<PublicClubBrandingQueryData>(
      PUBLIC_CLUB_BRANDING,
      { slug },
      { revalidate: 300 },
    );
    const b = data.publicClubBranding;
    if (!b) return FALLBACK_BRANDING;
    const footer = b.footerContent
      ? (JSON.parse(b.footerContent) as ClubBranding['footer'])
      : FALLBACK_BRANDING.footer;
    const palette = b.paletteJson
      ? (JSON.parse(b.paletteJson) as ClubPalette)
      : null;
    const fonts = b.fontsJson
      ? (JSON.parse(b.fontsJson) as ClubFonts)
      : null;
    return {
      clubName: b.clubName,
      kanjiTagline: b.kanjiTagline ?? FALLBACK_BRANDING.kanjiTagline,
      logoUrl: b.logoUrl,
      palette,
      fonts,
      footer,
    };
  } catch {
    return FALLBACK_BRANDING;
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
