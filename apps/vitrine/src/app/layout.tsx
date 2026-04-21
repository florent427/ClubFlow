import '@/styles/globals.css';
import '@/styles/sksr-pages.css';
import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { headers } from 'next/headers';
import { Header } from '@/components/Header';
import { Footer } from '@/components/Footer';
import { fontClassNames } from '@/lib/fonts';
import { resolveCurrentClub } from '@/lib/club-resolution';
import { fetchClubBranding, paletteToCssVars } from '@/lib/club-branding';
import { isEditModeActive } from '@/lib/edit-mode';
import { EditModeToolbar } from '@/components/edit/EditModeToolbar';
import { JsonLd, buildSportsClubLd } from '@/components/JsonLd';
import { RevealRoot } from '@/components/sksr/RevealRoot';

export const metadata: Metadata = {
  title: {
    default: 'SKSR — Shotokan Karaté Sud Réunion',
    template: '%s · SKSR',
  },
  description:
    "SKSR — Shotokan Karaté Sud Réunion. Club de karaté Shotokan à L'Étang-Salé (974) depuis 2009.",
};

export default async function RootLayout({
  children,
}: {
  children: ReactNode;
}) {
  const club = await resolveCurrentClub();
  const branding = await fetchClubBranding(club.slug);
  const editMode = await isEditModeActive();

  const hdrs = await headers();
  const host = hdrs.get('host') ?? 'localhost:5175';
  const proto =
    process.env.NODE_ENV === 'production'
      ? 'https'
      : hdrs.get('x-forwarded-proto') ?? 'http';
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
    <html
      lang="fr"
      className={fontClassNames}
      data-hero="full"
      data-palette="gold"
      data-type="serif"
      data-density="normal"
      data-mode="dark"
    >
      <body data-edit-mode={editMode ? 'true' : 'false'}>
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
        />
        <main id="main">{children}</main>
        <Footer clubName={branding.clubName} content={branding.footer} />
      </body>
    </html>
  );
}
