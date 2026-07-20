/**
 * Décodage de la charge utile d'un JWT, côté navigateur.
 *
 * Il n'y a PAS de vérification de signature ici, et il ne doit pas y en avoir :
 * le navigateur ne détient aucun secret. Ce module sert uniquement à afficher
 * ce que le serveur a déjà mis dans le jeton (nom, email). Toute décision
 * d'autorisation reste au serveur, qui lui vérifie la signature.
 *
 * DEUX PIÈGES, tous deux rencontrés en production :
 *
 * 1. `atob` rend une chaîne d'OCTETS Latin-1, pas du texte. Un « é », qui vaut
 *    0xC3 0xA9 en UTF-8, en ressort comme les deux caractères « Ã© ». C'est
 *    l'origine du « Admin dÃ©mo » observé dans la barre du haut. Il faut donc
 *    repasser explicitement les octets dans un décodeur UTF-8.
 *
 * 2. Un JWT est encodé en base64**url** : « + » et « / » y sont remplacés par
 *    « - » et « _ », et le rembourrage « = » est retiré. `atob` lève sur ces
 *    caractères. Comme les appelants enveloppent l'appel dans un try/catch, la
 *    panne ne se voyait pas : le nom disparaissait simplement de l'écran.
 */
export function decodeJwtPayload<T = Record<string, unknown>>(
  token: string,
): T | null {
  try {
    const part = token.split('.')[1];
    if (!part) return null;

    // base64url → base64, puis rembourrage à un multiple de 4.
    const base64 = part.replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=');

    // atob → octets → texte UTF-8. Les trois étapes sont nécessaires : sauter
    // la dernière est précisément ce qui produisait le mojibake.
    const binaire = atob(padded);
    const octets = Uint8Array.from(binaire, (c) => c.charCodeAt(0));
    return JSON.parse(new TextDecoder('utf-8').decode(octets)) as T;
  } catch {
    return null;
  }
}

/** Identité affichable portée par le jeton. */
export type JwtIdentity = {
  email: string | null;
  displayName: string | null;
};

export function decodeJwtIdentity(token: string): JwtIdentity {
  const payload = decodeJwtPayload<{ email?: string; displayName?: string }>(
    token,
  );
  return {
    email: payload?.email ?? null,
    displayName: payload?.displayName ?? null,
  };
}
