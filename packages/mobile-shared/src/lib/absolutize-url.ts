/**
 * Helpers de réécriture d'URLs pour les médias servis par l'API.
 *
 * Pourquoi ce module existe-t-il ?
 *
 * Le backend stocke dans `MediaAsset.publicUrl` une URL absolue construite
 * au moment de l'upload :
 *   `${process.env.API_PUBLIC_URL ?? 'http://localhost:3000'}/media/<uuid>`
 *
 * Quand l'API démarre sans `API_PUBLIC_URL` (cas dev typique), l'URL
 * stockée pointe sur **localhost**. Or un téléphone physique connecté
 * en Wi-Fi local **ne peut pas résoudre `localhost`** (ce serait son
 * propre device, pas le PC qui héberge l'API). Résultat côté Expo
 * Go / build natif : "Site inaccessible".
 *
 * Solution : on **réécrit** systématiquement l'host des URLs vers la
 * variable `EXPO_PUBLIC_API_BASE` côté mobile, qui doit pointer sur l'IP
 * LAN du serveur dev.
 *
 * Couvre 3 cas :
 *  1. URL nulle / vide      → null
 *  2. URL relative (`/m/x`)  → préfixe avec EXPO_PUBLIC_API_BASE
 *  3. URL absolue           → si l'host est `localhost`/`127.0.0.1`/`0.0.0.0`,
 *                             on swap pour l'host de EXPO_PUBLIC_API_BASE.
 *                             Sinon (CDN, prod), on laisse tel quel.
 */

const LOCAL_HOST_PATTERN = /^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0)(:\d+)?/i;

function getApiBase(): string {
  const raw = process.env.EXPO_PUBLIC_API_BASE ?? 'http://localhost:3000';
  return raw.replace(/\/+$/, '');
}

/**
 * Retourne une URL utilisable côté téléphone, en réécrivant si besoin
 * l'host `localhost` vers la base API mobile. Retourne null si l'URL
 * d'entrée est nulle/vide.
 */
export function absolutizeMediaUrl(
  url: string | null | undefined,
): string | null {
  if (!url) return null;
  const base = getApiBase();

  // Cas 1 : URL relative — on préfixe.
  if (!/^https?:\/\//i.test(url)) {
    return `${base}${url.startsWith('/') ? url : `/${url}`}`;
  }

  // Cas 2 : URL absolue avec host local — on swap l'host.
  if (LOCAL_HOST_PATTERN.test(url)) {
    return url.replace(LOCAL_HOST_PATTERN, base);
  }

  // Cas 3 : URL absolue distante (CDN, prod) — on laisse tel quel.
  return url;
}
