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

/**
 * Bascule vers l'app d'administration en passant la session via deux
 * canaux :
 *
 *  1. **localStorage local** : utile si portail+admin partagent le même
 *     domaine (déploiement mono-host `/admin` ou local dev même origin).
 *  2. **URL hash `#sso=<token>&club=<clubId>`** : SEUL canal qui marche
 *     en cross-domain (portail.X ↔ app.X — localStorage isolé par
 *     origin). L'admin lit le hash au boot, stocke en localStorage local,
 *     puis nettoie le hash de l'URL via `history.replaceState`.
 *
 * Les 2 mécanismes coexistent par robustesse — si l'un fail (ex: hash
 * stripé par un proxy), l'autre prend le relais.
 */
export function navigateToAdminApp(token: string, clubId: string): void {
  try {
    localStorage.setItem(ADMIN_TOKEN_KEY, token);
    localStorage.setItem(ADMIN_CLUB_ID_KEY, clubId);
  } catch {
    /* localStorage indisponible (mode privé strict) — on tombe sur le hash */
  }
  const target = adminAppTargetUrl();
  // URL fragment — n'est PAS envoyé au serveur, donc ne fuit pas le
  // token dans les logs Caddy/CDN. Lu uniquement par le JS de l'admin.
  const sep = target.includes('#') ? '&' : '#';
  const url =
    target +
    sep +
    `sso=${encodeURIComponent(token)}&club=${encodeURIComponent(clubId)}`;
  window.location.assign(url);
}
