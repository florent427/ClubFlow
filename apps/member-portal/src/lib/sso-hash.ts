/**
 * Session transmise par l'administration dans le fragment de l'URL :
 * `#sso=<jeton>&club=<club>`.
 *
 * `app.X` et `portail.X` sont deux origines : leur `localStorage` est isolé.
 * Le fragment est le seul canal qui passe, et il n'est pas envoyé au serveur,
 * donc le jeton ne finit pas dans les journaux. Symétrique de
 * `apps/admin/src/main.tsx`, qui lit le même fragment dans l'autre sens.
 */
export type SsoHandoff = { token: string; clubId: string };

export function parseSsoHash(hash: string): SsoHandoff | null {
  if (!hash) {
    return null;
  }
  const params = new URLSearchParams(hash.replace(/^#/, ''));
  const token = params.get('sso');
  const clubId = params.get('club');
  if (!token || !clubId) {
    return null;
  }
  return { token, clubId };
}
