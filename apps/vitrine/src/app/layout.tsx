import '@/styles/globals.css';
import '@/styles/sksr-pages.css';
import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { fontClassNames } from '@/lib/fonts';

/**
 * True root layout — volontairement statique (pas de résolution club, pas
 * de headers()/cookies()) pour rester cacheable. La logique par tenant
 * (branding, JSON-LD, Header/Footer, mode édition) vit dans
 * `app/_sites/[host]/[editFlag]/layout.tsx`, qui peut lire le host/le mode
 * édition via `params` sans désactiver le cache (cf. pitfall vitrine
 * lente : `headers()`/`cookies()` désactivaient le cache sur 100% des
 * requêtes).
 */
export const metadata: Metadata = {
  title: {
    default: 'Mon club',
    template: '%s · Mon club',
  },
  description: 'Le site officiel du club.',
};

export default function RootLayout({
  children,
}: {
  children: ReactNode;
}) {
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
      <body>{children}</body>
    </html>
  );
}
