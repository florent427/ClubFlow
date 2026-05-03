import 'server-only';
import { cookies } from 'next/headers';

/**
 * Détection du mode édition admin côté serveur.
 *
 * Le cookie `clubflow_vitrine_edit` contient un JWT émis par l'API quand
 * l'admin clique sur « Modifier le site » depuis le back-office. Le JWT est
 * ensuite re-vérifié côté API à chaque mutation. Ici, on se contente de la
 * présence du cookie pour activer l'UI ; la validation cryptographique
 * complète est faite serveur à l'exécution des mutations.
 *
 * TODO phase ultérieure : vérifier la signature JWT localement avec
 * VITRINE_JWT_SECRET pour éviter un round-trip API au premier render.
 */
export async function isEditModeActive(): Promise<boolean> {
  const cookieName =
    process.env.VITRINE_EDIT_COOKIE_NAME ?? 'clubflow_vitrine_edit';
  const store = await cookies();
  const cookie = store.get(cookieName);
  return Boolean(cookie?.value);
}

export async function getEditJwt(): Promise<string | null> {
  const cookieName =
    process.env.VITRINE_EDIT_COOKIE_NAME ?? 'clubflow_vitrine_edit';
  const store = await cookies();
  const cookie = store.get(cookieName);
  return cookie?.value ?? null;
}
