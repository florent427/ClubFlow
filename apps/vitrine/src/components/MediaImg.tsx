import type { ImgHTMLAttributes } from 'react';
import { responsiveImage } from '@/lib/media-url';

type Props = Omit<ImgHTMLAttributes<HTMLImageElement>, 'src' | 'srcSet'> & {
  src: string;
  alt: string;
  /** Attribut `sizes` : largeur affichée de l'image selon le viewport. */
  sizes?: string;
  /** Largeur maximale utile (évite de servir du 1920 pour une vignette). */
  maxWidth?: number;
  /** Image au-dessus de la ligne de flottaison : chargement immédiat. */
  priority?: boolean;
};

/**
 * `<img>` responsive pour les médias de l'API. Garde le balisage et le CSS
 * des blocs tels quels (pas de wrapper comme `next/image`), mais sert un
 * `srcset` optimisé et charge en différé tout ce qui n'est pas prioritaire.
 * Utilisable en Server comme en Client Component.
 */
export function MediaImg({
  src,
  alt,
  sizes,
  maxWidth,
  priority = false,
  ...rest
}: Props) {
  const img = responsiveImage(src, sizes, maxWidth);
  return (
    <img
      {...rest}
      src={img.src}
      srcSet={img.srcSet}
      sizes={img.sizes}
      alt={alt}
      loading={priority ? 'eager' : 'lazy'}
      decoding="async"
      fetchPriority={priority ? 'high' : undefined}
    />
  );
}
