/**
 * URLs des médias servis par l'API (`/media/<uuid>`).
 *
 * Deux problèmes réglés ici :
 *
 * 1. Des sections enregistrées depuis un poste de dev portent une URL
 *    absolue `http://localhost:3000/media/...`. En prod, le navigateur du
 *    visiteur ne peut pas la charger (image cassée). `normalizeMediaUrl`
 *    la réécrit vers l'API publique, côté serveur uniquement.
 *
 * 2. Les originaux font 2000 px de large et pèsent plusieurs centaines de
 *    Ko. `responsiveImage` passe par l'optimiseur Next (`/_next/image`)
 *    pour servir un `srcset` en WebP/AVIF à la bonne taille, sans changer
 *    le balisage `<img>` ni le CSS existant.
 */

/** Hôtes dont les médias passent par l'optimiseur — miroir de `next.config.mjs`. */
const OPTIMIZABLE_HOSTS = new Set([
  'api.clubflow.topdigital.re',
  'staging.api.clubflow.topdigital.re',
  'localhost:3000',
]);

/** Largeurs servies : toutes présentes dans `deviceSizes`/`imageSizes` par défaut de Next. */
const WIDTHS = [384, 640, 828, 1200, 1920] as const;

const LOCAL_MEDIA_ORIGIN = /^https?:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?(?=\/media\/)/;

function publicApiBase(): string {
  const url =
    process.env.VITRINE_PUBLIC_API_URL ??
    process.env.VITRINE_API_URL ??
    'http://localhost:3000/graphql';
  return url.replace(/\/graphql\/?$/, '');
}

/** URL GraphQL joignable depuis le navigateur du visiteur (jamais l'URL interne). */
export function publicGraphqlUrl(): string {
  return `${publicApiBase()}/graphql`;
}

/** Réécrit une URL de média `localhost` vers l'API publique. Serveur uniquement. */
export function normalizeMediaUrl(url: string): string {
  return url.replace(LOCAL_MEDIA_ORIGIN, publicApiBase());
}

/** Applique `normalizeMediaUrl` à toutes les chaînes d'une valeur JSON. */
export function normalizeMediaUrlsDeep<T>(value: T): T {
  if (typeof value === 'string') return normalizeMediaUrl(value) as T;
  if (Array.isArray(value)) {
    return value.map((v) => normalizeMediaUrlsDeep(v)) as T;
  }
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = normalizeMediaUrlsDeep(v);
    }
    return out as T;
  }
  return value;
}

function isOptimizable(url: string): boolean {
  try {
    const u = new URL(url);
    return (
      (u.protocol === 'https:' || u.protocol === 'http:') &&
      OPTIMIZABLE_HOSTS.has(u.host) &&
      u.pathname.startsWith('/media/')
    );
  } catch {
    return false;
  }
}

function optimizedUrl(url: string, width: number, quality = 75): string {
  return `/_next/image?url=${encodeURIComponent(url)}&w=${width}&q=${quality}`;
}

export interface ResponsiveImage {
  src: string;
  srcSet?: string;
  sizes?: string;
}

/**
 * `src`/`srcSet`/`sizes` pour un `<img>` classique. Les URLs hors API
 * (fichiers statiques, images externes) sont renvoyées telles quelles.
 */
export function responsiveImage(
  url: string,
  sizes = '100vw',
  maxWidth = 1920,
): ResponsiveImage {
  if (!isOptimizable(url)) return { src: url };
  const widths = WIDTHS.filter((w) => w <= maxWidth);
  if (widths.length === 0) widths.push(WIDTHS[0]);
  const fallback = widths.filter((w) => w <= 1200).at(-1) ?? widths[0];
  return {
    src: optimizedUrl(url, fallback),
    srcSet: widths.map((w) => `${optimizedUrl(url, w)} ${w}w`).join(', '),
    sizes,
  };
}
