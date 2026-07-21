import 'server-only';
import { cookies } from 'next/headers';

/**
 * Détection du mode édition admin.
 *
 * `middleware.ts` lit le cookie `clubflow_vitrine_edit` (JWT émis par
 * l'API quand l'admin clique sur « Modifier le site ») et l'encode en
 * `params.editFlag` ('1'/'0') plutôt que de le laisser lu via `cookies()`
 * dans un Server Component — `cookies()` désactiverait le cache
 * statique/ISR de toute route qui l'appelle, y compris pour les visiteurs
 * anonymes sans le cookie (cf. pitfall vitrine lente). `isEditFlagActive`
 * est la seule chose que les pages/layouts doivent consulter pour savoir
 * si l'UI d'édition doit s'afficher.
 */
export function isEditFlagActive(editFlag: string): boolean {
  return editFlag === '1';
}

/**
 * Lit le JWT d'édition depuis le cookie httpOnly. Appelé uniquement quand
 * `isEditFlagActive(editFlag)` est vrai — donc jamais sur le chemin
 * visiteur anonyme. Le JWT n'est pas vérifié localement ici ; la
 * validation cryptographique complète est faite côté API à chaque
 * mutation (cookie envoyé via Authorization header).
 */
export async function getEditJwt(): Promise<string | null> {
  const cookieName =
    process.env.VITRINE_EDIT_COOKIE_NAME ?? 'clubflow_vitrine_edit';
  const store = await cookies();
  const cookie = store.get(cookieName);
  return cookie?.value ?? null;
}
