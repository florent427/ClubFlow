/** Aligné sur `apps/member-portal/src/lib/storage.ts` (pas d’import croisé). */
const MEMBER_TOKEN_KEY = 'clubflow_member_token';
const MEMBER_CLUB_ID_KEY = 'clubflow_member_club_id';

/**
 * Hôte du portail quand l'admin et le portail sont deux sous-domaines du même
 * domaine : `app.example.re` → `portail.example.re`, en gardant le préfixe de
 * l'environnement (`staging.app.…` → `staging.portail.…`).
 *
 * Sans cette déduction, la prod tombait sur `/membre`, qui n'existe pas sur
 * `app.clubflow.topdigital.re` : le bouton « Personnel » ne menait nulle part.
 */
export function memberPortalHostFromAdminHost(host: string): string | null {
  const m = /^(.*\.)?app\.(.+\..+)$/.exec(host);
  if (!m) {
    return null;
  }
  return `${m[1] ?? ''}portail.${m[2]}`;
}

export function memberPortalTargetUrl(): string {
  const v = import.meta.env.VITE_MEMBER_APP_URL;
  if (typeof v === 'string' && v.trim()) {
    return v.trim();
  }
  if (import.meta.env.DEV) {
    return 'http://localhost:5174/';
  }
  const derived =
    typeof window === 'undefined'
      ? null
      : memberPortalHostFromAdminHost(window.location.hostname);
  if (derived) {
    return `${window.location.protocol}//${derived}/`;
  }
  return '/membre';
}

/**
 * Ajoute la session au fragment : `#sso=<jeton>&club=<club>`.
 *
 * C'est le SEUL canal qui traverse deux origines — `app.X` et `portail.X` ont
 * chacune leur `localStorage`. Le fragment n'est pas envoyé au serveur, donc
 * le jeton ne passe pas dans les journaux de Caddy. Le portail le lit au
 * démarrage puis nettoie l'URL. Symétrique de
 * `apps/member-portal/src/lib/admin-switch.ts`.
 */
export function memberPortalSwitchUrl(
  target: string,
  token: string,
  clubId: string,
): string {
  const sep = target.includes('#') ? '&' : '#';
  return `${target}${sep}sso=${encodeURIComponent(token)}&club=${encodeURIComponent(clubId)}`;
}

export function navigateToMemberPortal(token: string, clubId: string): void {
  try {
    // Utile quand les deux apps partagent l'origine (dev, déploiement
    // mono-hôte sous /membre) ; sinon le fragment prend le relais.
    localStorage.setItem(MEMBER_TOKEN_KEY, token);
    localStorage.setItem(MEMBER_CLUB_ID_KEY, clubId);
  } catch {
    /* localStorage indisponible (navigation privée stricte) */
  }
  window.location.assign(
    memberPortalSwitchUrl(memberPortalTargetUrl(), token, clubId),
  );
}
