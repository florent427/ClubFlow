/**
 * Helpers pour propager un `returnTo` (destination post-login) à travers
 * tout le flow d'authentification, y compris quand il y a une étape
 * email-verification qui rompt la chaîne de paramètres URL.
 *
 * Stratégie :
 * 1. `rememberReturnTo(raw)` — appelé au mount d'une page auth (Login,
 *    Register, SelectProfile, VerifyEmail) avec `searchParams.get('returnTo')`.
 *    Si valide (chemin interne), on le persiste en sessionStorage.
 * 2. `consumeReturnTo()` — appelé après succès (login, verify, pick profile).
 *    Retourne le returnTo stocké ET l'efface du storage pour ne pas
 *    persister entre 2 sessions.
 *
 * Sécurité : `safeReturnTo` rejette les URL externes et `//` (open redirect).
 */

const STORAGE_KEY = 'mp:pendingReturnTo';

/**
 * Normalise + valide : n'accepte que des chemins internes commençant par `/`.
 * Rejette `//` (qui aurait été interprété comme une URL externe par
 * `window.location.assign` dans certains navigateurs).
 */
export function safeReturnTo(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const t = raw.trim();
  if (!t.startsWith('/')) return null;
  if (t.startsWith('//')) return null;
  if (t.length > 500) return null; // ceinture
  return t;
}

/** Enregistre la destination post-login en sessionStorage (si valide). */
export function rememberReturnTo(raw: string | null | undefined): void {
  const safe = safeReturnTo(raw);
  if (!safe) return;
  try {
    sessionStorage.setItem(STORAGE_KEY, safe);
  } catch {
    /* sessionStorage peut être indispo en mode privé — ignorer */
  }
}

/**
 * Récupère et efface la destination stockée. À appeler juste avant
 * `navigate(...)` après une auth réussie.
 */
export function consumeReturnTo(): string | null {
  try {
    const v = sessionStorage.getItem(STORAGE_KEY);
    if (v) sessionStorage.removeItem(STORAGE_KEY);
    return safeReturnTo(v);
  } catch {
    return null;
  }
}

/** Lit sans effacer (debug ou affichage). */
export function peekReturnTo(): string | null {
  try {
    return safeReturnTo(sessionStorage.getItem(STORAGE_KEY));
  } catch {
    return null;
  }
}
