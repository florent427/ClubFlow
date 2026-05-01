/**
 * Helpers de construction d'URL pour les médias servis par l'API.
 *
 * L'API expose `GET /media/:id` (route REST côté MediaController). On
 * construit l'URL absolue en gardant l'auth via header (le composant
 * appelant doit passer Authorization + X-Club-Id).
 *
 * Pour les images affichées via `<Image source={{ uri, headers }}>`, RN
 * supporte les headers custom (Android via OkHttp, iOS via NSURLRequest).
 */

import { storage } from './storage';

function getApiBaseUrl(): string {
  const explicit = process.env.EXPO_PUBLIC_API_BASE;
  if (explicit) return explicit.replace(/\/$/, '');
  const graphql =
    process.env.EXPO_PUBLIC_GRAPHQL_HTTP ?? 'http://localhost:3000/graphql';
  return graphql.replace(/\/graphql\/?$/, '') || 'http://localhost:3000';
}

/** URL absolue d'un média — sans auth (à utiliser avec headers). */
export function getMediaUrl(mediaAssetId: string): string {
  return `${getApiBaseUrl()}/media/${mediaAssetId}`;
}

/**
 * Réécrit une URL retournée par l'API (qui peut pointer vers
 * `localhost:3000` côté serveur dev) en une URL accessible depuis le
 * device mobile (sur le LAN, donc IP IPv4 de la machine dev).
 *
 * Sans cette réécriture, `Linking.openURL("http://localhost:3000/...")`
 * sur le téléphone échoue silencieusement (écran blanc) : `localhost`
 * sur le device = device, pas la machine dev.
 */
export function rewriteToLanUrl(serverUrl: string): string {
  const apiBase = getApiBaseUrl(); // ex http://192.168.1.24:3000
  // Match localhost/127.0.0.1 avec ou sans port
  return serverUrl.replace(
    /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?/,
    apiBase,
  );
}

/**
 * Construit la prop `source` d'un `<Image>` RN avec auth headers.
 * Utilisation :
 *   <Image source={await getAuthedImageSource(mediaAssetId)} />
 */
export async function getAuthedImageSource(
  mediaAssetId: string,
): Promise<{ uri: string; headers: Record<string, string> }> {
  const token = await storage.getToken();
  const clubId = await storage.getClubId();
  return {
    uri: getMediaUrl(mediaAssetId),
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(clubId ? { 'X-Club-Id': clubId } : {}),
    },
  };
}
