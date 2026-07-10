/** Clés distinctes de l’admin pour éviter les collisions sur le même origine. */
const TOKEN_KEY = 'clubflow_member_token';
const CLUB_ID_KEY = 'clubflow_member_club_id';
const CONTACT_ONLY_KEY = 'clubflow_member_contact_only';

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function getClubId(): string | null {
  return localStorage.getItem(CLUB_ID_KEY);
}

export function setClubId(clubId: string): void {
  localStorage.setItem(CLUB_ID_KEY, clubId);
}

export function clearClubId(): void {
  localStorage.removeItem(CLUB_ID_KEY);
}

export function clearAuth(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(CLUB_ID_KEY);
  localStorage.removeItem(CONTACT_ONLY_KEY);
}

/** Session complète : token + club du profil actif. */
export function setMemberSession(token: string, clubId: string): void {
  setToken(token);
  setClubId(clubId);
  localStorage.removeItem(CONTACT_ONLY_KEY);
}

/** Portail « contact » sans profil membre (inscription rapide). */
export function setMemberContactSession(token: string, clubId: string): void {
  setToken(token);
  setClubId(clubId);
  localStorage.setItem(CONTACT_ONLY_KEY, '1');
}

export function isContactOnlySession(): boolean {
  return localStorage.getItem(CONTACT_ONLY_KEY) === '1';
}

export function hasMemberSession(): boolean {
  return Boolean(getToken() && getClubId());
}

/**
 * Vérifie que le token stocké n'est pas expiré (décodage local du claim
 * `exp`, marge de 30 s). Un token illisible est considéré invalide.
 *
 * Cf. bug QA C2 : un token expiré présent en localStorage redirigeait
 * /login vers un dashboard fantôme — reconnexion impossible sans vider
 * le localStorage à la main.
 */
export function isTokenValid(): boolean {
  const token = getToken();
  if (!token) return false;
  try {
    const payload = JSON.parse(atob(token.split('.')[1])) as { exp?: number };
    if (typeof payload.exp !== 'number') return true;
    return payload.exp * 1000 > Date.now() + 30_000;
  } catch {
    return false;
  }
}
