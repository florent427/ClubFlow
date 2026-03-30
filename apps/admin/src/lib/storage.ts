const TOKEN = 'clubflow_admin_token';
const CLUB = 'clubflow_admin_club_id';

export function getToken(): string | null {
  return localStorage.getItem(TOKEN);
}

export function getClubId(): string | null {
  return localStorage.getItem(CLUB);
}

export function setSession(token: string, clubId: string): void {
  localStorage.setItem(TOKEN, token);
  localStorage.setItem(CLUB, clubId);
}

export function clearSession(): void {
  localStorage.removeItem(TOKEN);
  localStorage.removeItem(CLUB);
}

export function isLoggedIn(): boolean {
  return Boolean(getToken() && getClubId());
}
