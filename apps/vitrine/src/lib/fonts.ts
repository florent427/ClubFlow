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
export const fontSerif = Cormorant_Garamond({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700'],
  style: ['normal', 'italic'],
  variable: '--font-serif',
  display: 'swap',
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
});

export const fontClassNames = [
  fontSerif.variable,
  fontSans.variable,
  fontJp.variable,
].join(' ');
