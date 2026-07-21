import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { Header } from '@/components/Header';
import { Footer } from '@/components/Footer';
import { resolveCurrentClub } from '@/lib/club-resolution';
import { fetchClubBranding, paletteToCssVars } from '@/lib/club-branding';
import { isEditFlagActive } from '@/lib/edit-mode';
import { EditModeToolbar } from '@/components/edit/EditModeToolbar';
import { JsonLd, buildSportsClubLd } from '@/components/JsonLd';
import { RevealRoot } from '@/components/sksr/RevealRoot';

/**
 * Layout par tenant — porte ce qui vivait dans l'ancien `app/layout.tsx`
 * (résolution club, branding, JSON-LD, Header/Footer, toolbar d'édition),
 * moins `<html>`/`<body>` qui restent dans le true root.
 *
 * `host` et `editFlag` viennent de `params` (posés par `middleware.ts` via
 * rewrite), jamais de `headers()`/`cookies()` — c'est ce qui permet à cette
 * route de rester cacheable par combinaison (host, editFlag) au lieu
 * d'être dynamique sur 100% des requêtes.
 */
interface LayoutParams {
  params: Promise<{ host: string; editFlag: string }>;
}

// Explicite plutôt qu'hérité des `revalidate` posés sur les fetch
// individuels : sans ça, malgré generateStaticParams + le marqueur SSG
// au build, la route restait servie avec Cache-Control: no-store en
// conditions réelles (constaté sur staging).
export const revalidate = 60;

export async function generateMetadata({
  params,
}: LayoutParams): Promise<Metadata> {
  const { host } = await params;
  try {
    const club = await resolveCurrentClub(host);
    return {
      title: {
        default: club.name,
        template: `%s · ${club.name}`,
      },
      description: `${club.name} — le site officiel du club.`,
    };
  } catch {
    return {
      title: {
        default: 'Mon club',
        template: '%s · Mon club',
      },
      description: 'Le site officiel du club.',
    };
  }
}

export default async function SiteLayout({
  children,
  params,
}: LayoutParams & { children: ReactNode }) {
  const { host, editFlag } = await params;
  const editMode = isEditFlagActive(editFlag);

  const club = await resolveCurrentClub(host);
  // On passe le nom réel du club (résolu via le host) pour que le fallback
  // branding neutre affiche le bon nom même sans branding configuré en DB.
  const branding = await fetchClubBranding(club.slug, club.name);

  const proto = process.env.NODE_ENV === 'production' ? 'https' : 'http';
  const baseUrl = `${proto}://${host}`;

  const contact = branding.footer.contact;
  const socialLinks = branding.footer.socialLinks.map((sl) => sl.href);
  const clubLd = buildSportsClubLd({
    name: branding.clubName,
    url: baseUrl,
    description: branding.footer.description,
    address: contact.address,
    phone: contact.phone,
    email: contact.email,
    logoUrl: branding.logoUrl,
    sameAs: socialLinks,
  });

  const paletteCss = paletteToCssVars(branding.palette);
  // Override fonts : si le club a défini des fonts custom, on surcharge les
  // variables CSS --serif/--sans/--jp avec des noms Google Fonts fournis.
  // (Le chargement réel des fonts custom se fait via next/font dans lib/fonts
  // — Phase 2. En Phase 1, on change juste le nom pour aligner les stacks.)
  const fontsCss = branding.fonts
    ? `:root { ${
        branding.fonts.serif
          ? `--serif: "${branding.fonts.serif}", serif;`
          : ''
      } ${
        branding.fonts.sans ? `--sans: "${branding.fonts.sans}", sans-serif;` : ''
      } ${
        branding.fonts.jp
          ? `--jp: "${branding.fonts.jp}", "Noto Serif JP", serif;`
          : ''
      } }`
    : '';

  return (
    <div id="vitrine-shell" data-edit-mode={editMode ? 'true' : 'false'}>
      {paletteCss || fontsCss ? (
        <style
          id="club-branding-overrides"
          dangerouslySetInnerHTML={{ __html: paletteCss + fontsCss }}
        />
      ) : null}
      <JsonLd data={clubLd} />
      <RevealRoot />
      {editMode ? (
        <EditModeToolbar clubName={branding.clubName} />
      ) : null}
      <a className="skip-link" href="#main">
        Aller au contenu
      </a>
      <Header
        clubName={branding.clubName}
        kanjiTagline={branding.kanjiTagline}
        logoUrl={branding.logoUrl}
        clubSlug={club.slug}
      />
      <main id="main">{children}</main>
      <Footer clubName={branding.clubName} content={branding.footer} />
    </div>
  );
}
