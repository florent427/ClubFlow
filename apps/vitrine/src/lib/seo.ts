import 'server-only';
import type { Metadata } from 'next';
import { resolveCurrentClub } from './club-resolution';
import { fetchVitrinePage, type VitrineSection } from './vitrine-page';

const IMAGE_PROP = /image(url)?$/i;

/** Première URL d'image absolue trouvée dans les props des sections. */
function firstSectionImage(sections: VitrineSection[]): string | undefined {
  const visit = (value: unknown, key: string): string | undefined => {
    if (typeof value === 'string') {
      return IMAGE_PROP.test(key) && /^https?:\/\//.test(value)
        ? value
        : undefined;
    }
    if (Array.isArray(value)) {
      for (const v of value) {
        const found = visit(v, key);
        if (found) return found;
      }
      return undefined;
    }
    if (value && typeof value === 'object') {
      for (const [k, v] of Object.entries(value)) {
        const found = visit(v, k);
        if (found) return found;
      }
    }
    return undefined;
  };
  for (const section of sections) {
    const found = visit(section.props, '');
    if (found) return found;
  }
  return undefined;
}

export interface PageSeoOptions {
  host: string;
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
    const club = await resolveCurrentClub(opts.host);
    const page = await fetchVitrinePage(club.slug, opts.pageSlug);
    const title = page?.seoTitle ?? opts.fallbackTitle;
    const description =
      page?.seoDescription ?? opts.fallbackDescription ?? undefined;
    // Sans image dédiée, la première photo de la page sert d'aperçu de
    // partage (Facebook, WhatsApp) plutôt qu'un aperçu vide.
    const ogImage =
      page?.seoOgImageUrl ?? firstSectionImage(page?.sections ?? []);
    return {
      // La home vit dans le même segment que le layout du site : le
      // `title.template` de ce layout ne s'y applique pas (règle Next), et
      // c'est celui du layout racine (« · Mon club ») qui prenait le relais.
      title: opts.pageSlug === 'index' ? { absolute: title } : title,
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
