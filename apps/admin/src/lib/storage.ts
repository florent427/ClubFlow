const TOKEN = 'clubflow_admin_token';
const CLUB = 'clubflow_admin_club_id';
const CLUB_SLUG = 'clubflow_admin_club_slug';

export function getToken(): string | null {
  return localStorage.getItem(TOKEN);
}

export function getClubId(): string | null {
  return localStorage.getItem(CLUB);
}

export function getClubSlug(): string | null {
  return localStorage.getItem(CLUB_SLUG);
}

/** Stocke uniquement le token (sans clubId — la sélection de club est différée). */
export function setToken(token: string): void {
  localStorage.setItem(TOKEN, token);
}

/** Sélectionne le club actif (par UUID). Optionnellement avec son slug pour affichage. */
export function setActiveClub(clubId: string, clubSlug?: string): void {
  localStorage.setItem(CLUB, clubId);
  if (clubSlug) localStorage.setItem(CLUB_SLUG, clubSlug);
}

/** @deprecated utiliser setToken() + setActiveClub(). Conservé pour compat backward. */
export function setSession(token: string, clubId: string, clubSlug?: string): void {
  setToken(token);
  setActiveClub(clubId, clubSlug);
}

/** Efface le club actif sans déconnecter (pour basculer vers /select-club). */
export function clearActiveClub(): void {
  localStorage.removeItem(CLUB);
  localStorage.removeItem(CLUB_SLUG);
}

export function clearSession(): void {
  localStorage.removeItem(TOKEN);
  localStorage.removeItem(CLUB);
  localStorage.removeItem(CLUB_SLUG);
}

/** Authentifié = token présent. La sélection d'un club est requise séparément. */
export function isLoggedIn(): boolean {
  return Boolean(getToken());
}

/** Authentifié ET un club est sélectionné (prêt pour les pages admin). */
export function hasActiveClub(): boolean {
  return Boolean(getToken() && getClubId());
}
