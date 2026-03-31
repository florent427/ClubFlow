/** Litéraux alignés sur `apps/admin/src/lib/storage.ts` (pas d’import croisé entre apps). */
const ADMIN_TOKEN_KEY = 'clubflow_admin_token';
const ADMIN_CLUB_ID_KEY = 'clubflow_admin_club_id';

export function adminAppTargetUrl(): string {
  const v = import.meta.env.VITE_ADMIN_APP_URL;
  if (typeof v === 'string' && v.trim()) {
    return v.trim();
  }
  if (import.meta.env.DEV) {
    return 'http://localhost:5173/';
  }
  return '/admin';
}

/** Copie la session membre vers les clés admin puis navigation pleine page. */
export function navigateToAdminApp(token: string, clubId: string): void {
  localStorage.setItem(ADMIN_TOKEN_KEY, token);
  localStorage.setItem(ADMIN_CLUB_ID_KEY, clubId);
  window.location.assign(adminAppTargetUrl());
}
