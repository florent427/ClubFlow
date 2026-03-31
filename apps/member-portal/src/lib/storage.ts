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
