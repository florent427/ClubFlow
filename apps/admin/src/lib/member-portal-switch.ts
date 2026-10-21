import { decodeJwtPayload } from './jwt';

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

/** Ce que la bascule a besoin de savoir d'un profil du compte. */
export type PortalProfileCandidate = {
  memberId: string | null;
  clubId: string;
  isPrimaryProfile: boolean;
};

/**
 * Profil membre à activer pour ouvrir le portail depuis le club `clubId`.
 *
 * Le jeton de l'admin porte le profil actif choisi À LA CONNEXION : le profil
 * principal, tous clubs confondus. Changer de club dans l'admin ne le change
 * pas. Le transmettre tel quel au portail avec `x-club-id = clubId` faisait
 * refuser toutes les requêtes `viewer…` (`ViewerActiveProfileGuard` exige que
 * le profil actif soit du club de l'en-tête) : accueil vide, et
 * `/select-profile` renvoyait à l'accueil puisqu'un profil actif existait.
 *
 * Règle : un profil du club courant ; à défaut (le compte n'est membre que
 * d'autres clubs), un profil d'un autre club, et c'est alors CE club qu'ouvre
 * le portail. Dans le groupe retenu, on garde le profil déjà actif s'il en
 * fait partie, sinon le profil principal, sinon le premier.
 */
export function pickMemberPortalProfile(
  profiles: readonly PortalProfileCandidate[],
  clubId: string,
  activeMemberId: string | null,
): { memberId: string; clubId: string } | null {
  const members = profiles.filter(
    (p): p is PortalProfileCandidate & { memberId: string } =>
      Boolean(p.memberId),
  );
  const inClub = members.filter((p) => p.clubId === clubId);
  const pool = inClub.length > 0 ? inClub : members;
  const picked =
    pool.find((p) => p.memberId === activeMemberId) ??
    pool.find((p) => p.isPrimaryProfile) ??
    pool[0];
  return picked ? { memberId: picked.memberId, clubId: picked.clubId } : null;
}

/**
 * Session à transmettre au portail : un jeton dont le profil actif appartient
 * au club transmis. Le jeton courant est réutilisé quand son profil actif est
 * déjà le bon ; sinon `selectProfile` (la mutation
 * `selectActiveViewerProfile`) en émet un nouveau. Le jeton de l'admin, lui,
 * reste inchangé.
 */
export async function resolveMemberPortalSession(
  token: string,
  clubId: string,
  profiles: readonly PortalProfileCandidate[],
  selectProfile: (memberId: string) => Promise<string>,
): Promise<{ token: string; clubId: string } | null> {
  const activeMemberId =
    decodeJwtPayload<{ activeProfileMemberId?: string }>(token)
      ?.activeProfileMemberId ?? null;
  const picked = pickMemberPortalProfile(profiles, clubId, activeMemberId);
  if (!picked) {
    return null;
  }
  if (picked.memberId === activeMemberId) {
    return { token, clubId: picked.clubId };
  }
  return { token: await selectProfile(picked.memberId), clubId: picked.clubId };
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
