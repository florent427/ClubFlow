/**
 * Les deux adresses de désinscription qui voyagent dans `List-Unsubscribe` :
 * celle que la boîte mail appelle toute seule (POST, RFC 8058), et celle que
 * suit un humain (page du portail).
 */

/** Première origine du portail ; la variable peut en lister plusieurs. */
export function memberPortalOrigin(): string {
  const raw = process.env.MEMBER_PORTAL_ORIGIN ?? 'http://localhost:5174';
  return (raw.split(',')[0] ?? '').trim().replace(/\/$/, '') || 'http://localhost:5174';
}

/**
 * Origine publique de l'API. `API_BASE_URL` si elle est posée ; sinon déduite
 * du portail (`portail.X` donne `api.X`, préfixe d'environnement gardé), comme
 * la bascule entre les apps ; sinon le port local de développement.
 */
export function publicApiOrigin(): string {
  // `API_PUBLIC_URL` est celle que posent les serveurs (retour OAuth, médias) ;
  // `API_BASE_URL` sert au rendu des PDF. On accepte les deux.
  const direct =
    process.env.API_PUBLIC_URL?.trim() || process.env.API_BASE_URL?.trim();
  if (direct) {
    return direct.replace(/\/$/, '');
  }
  const portal = memberPortalOrigin();
  try {
    const url = new URL(portal);
    const m = /^(.*\.)?portail\.(.+\..+)$/.exec(url.hostname);
    if (m) {
      return `${url.protocol}//${m[1] ?? ''}api.${m[2]}`;
    }
  } catch {
    /* origine illisible : on retombe sur le développement local */
  }
  return 'http://localhost:3000';
}

/**
 * En-tête `List-Unsubscribe`. L'URL appelée automatiquement vient en premier :
 * c'est celle que Gmail et consorts postent pour « Se désabonner ».
 */
export function listUnsubscribeHeader(token: string): string {
  const q = `token=${encodeURIComponent(token)}`;
  return `<${publicApiOrigin()}/mail/unsubscribe?${q}>, <${memberPortalOrigin()}/desinscription?${q}>`;
}
