/**
 * Décodage de la charge utile d'un JWT, côté navigateur.
 *
 * Aucune vérification de signature ici, et il ne doit pas y en avoir : le
 * navigateur ne détient aucun secret. Seul le serveur autorise.
 *
 * DUPLIQUÉ depuis apps/admin/src/lib/jwt.ts — il n'y a pas de workspaces npm
 * dans ce dépôt (ADR-0004), donc pas de paquet partagé à importer. Toute
 * correction ici doit être reportée là-bas, et réciproquement.
 *
 * Un JWT est encodé en base64**url** : « + » et « / » y deviennent « - » et
 * « _ », et le rembourrage « = » est retiré. `atob` LÈVE sur ces caractères.
 * Ici, la panne coûtait cher : l'appelant interprétait l'exception comme un
 * jeton invalide et DÉCONNECTAIT un membre dont la session était parfaitement
 * valide — de façon intermittente, puisque cela dépend des octets du jeton.
 *
 * Le passage par TextDecoder est conservé par symétrie avec l'admin : ce
 * module ne lit aujourd'hui que `exp`, mais quiconque y lira demain un nom
 * doit obtenir « démo » et non « dÃ©mo ».
 */
export function decodeJwtPayload<T = Record<string, unknown>>(
  token: string,
): T | null {
  try {
    const part = token.split('.')[1];
    if (!part) return null;

    const base64 = part.replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=');

    const binaire = atob(padded);
    const octets = Uint8Array.from(binaire, (c) => c.charCodeAt(0));
    return JSON.parse(new TextDecoder('utf-8').decode(octets)) as T;
  } catch {
    return null;
  }
}
