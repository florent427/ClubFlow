/** Clés distinctes de l’admin pour éviter les collisions sur le même origine. */
const TOKEN_KEY = 'clubflow_member_token';
const CLUB_ID_KEY = 'clubflow_member_club_id';

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
}

/** Session complète : token + club du profil actif. */
export function setMemberSession(token: string, clubId: string): void {
  setToken(token);
  setClubId(clubId);
}

export function hasMemberSession(): boolean {
  return Boolean(getToken() && getClubId());
}
