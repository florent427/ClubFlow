import {
  Cormorant_Garamond,
  Inter,
  Shippori_Mincho,
} from 'next/font/google';

/**
 * Polices chargées via next/font pour optimisation (subsetting, preload,
 * CLS éliminé). Les variables CSS sont référencées dans globals.css :
 *   --font-serif → Cormorant Garamond
 *   --font-sans  → Inter
 *   --font-jp    → Shippori Mincho
 */
// Seul Inter (sans) est preload : c'est la police de chrome (nav, footer,
// corps de texte) présente sur toutes les pages. Cormorant et Shippori sont
// utilisées mais pas garanties above-the-fold sur toutes les pages/clubs ;
// avec display:'swap' elles restent chargées normalement (juste sans le
// <Link rel=preload> haute priorité), ce qui évite de préchoisir ~40 fichiers
// woff2 inutiles sur chaque requête (cf. docs/memory/pitfalls — vitrine lente).
export const fontSerif = Cormorant_Garamond({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700'],
  style: ['normal', 'italic'],
  variable: '--font-serif',
  display: 'swap',
  preload: false,
});

export const fontSans = Inter({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700'],
  variable: '--font-sans',
  display: 'swap',
});

export const fontJp = Shippori_Mincho({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
  variable: '--font-jp',
  display: 'swap',
  preload: false,
});

export const fontClassNames = [
  fontSerif.variable,
  fontSans.variable,
  fontJp.variable,
].join(' ');
