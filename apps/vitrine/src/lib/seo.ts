import 'server-only';
import type { Metadata } from 'next';
import { resolveCurrentClub } from './club-resolution';
import { fetchVitrinePage } from './vitrine-page';

export interface PageSeoOptions {
  pageSlug: string;
  fallbackTitle: string;
  fallbackDescription?: string;
}

/**
 * Helper SEO — lit seoTitle/seoDescription/seoOgImage de la VitrinePage.
 * Retombe sur des valeurs par défaut si la page n'existe pas encore.
 */
export async function buildPageMetadata(
  opts: PageSeoOptions,
): Promise<Metadata> {
  try {
    const club = await resolveCurrentClub();
    const page = await fetchVitrinePage(club.slug, opts.pageSlug);
    const title = page?.seoTitle ?? opts.fallbackTitle;
    const description =
      page?.seoDescription ?? opts.fallbackDescription ?? undefined;
    const ogImage = page?.seoOgImageUrl ?? undefined;
    return {
      title,
      description,
      openGraph: {
        title,
        description,
        images: ogImage ? [{ url: ogImage }] : undefined,
        type: 'website',
        siteName: club.name,
      },
      twitter: {
        card: ogImage ? 'summary_large_image' : 'summary',
        title,
        description,
        images: ogImage ? [ogImage] : undefined,
      },
    };
  } catch {
    return {
      title: opts.fallbackTitle,
      description: opts.fallbackDescription,
    };
  }
}
