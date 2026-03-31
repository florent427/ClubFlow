/** Aligné sur `apps/member-portal/src/lib/storage.ts` (pas d’import croisé). */
const MEMBER_TOKEN_KEY = 'clubflow_member_token';
const MEMBER_CLUB_ID_KEY = 'clubflow_member_club_id';

export function memberPortalTargetUrl(): string {
  const v = import.meta.env.VITE_MEMBER_APP_URL;
  if (typeof v === 'string' && v.trim()) {
    return v.trim();
  }
  if (import.meta.env.DEV) {
    return 'http://localhost:5174/';
  }
  return '/membre';
}

export function navigateToMemberPortal(token: string, clubId: string): void {
  localStorage.setItem(MEMBER_TOKEN_KEY, token);
  localStorage.setItem(MEMBER_CLUB_ID_KEY, clubId);
  window.location.assign(memberPortalTargetUrl());
}
