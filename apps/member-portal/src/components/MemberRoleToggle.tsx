import { navigateToAdminApp } from '../lib/admin-switch';
import { getClubId, getToken } from '../lib/storage';

type Props = {
  /** Utilisateur autorisé à ouvrir le back-office (rôle club admin / bureau / trésorerie). */
  canAccessClubBackOffice: boolean;
  /**
   * Club cible pour `X-Club-Id` côté admin (peut différer du club du profil membre actif).
   */
  adminWorkspaceClubId?: string | null;
  className?: string;
};

/** Admin | Personnel — même comportement que le header ; Personnel = vue portail courante. */
export function MemberRoleToggle({
  canAccessClubBackOffice,
  adminWorkspaceClubId,
  className = '',
}: Props) {
  if (!canAccessClubBackOffice) {
    return null;
  }

  function goAdmin() {
    const tok = getToken();
    const cid = adminWorkspaceClubId ?? getClubId();
    if (!tok || !cid) return;
    navigateToAdminApp(tok, cid);
  }

  return (
    <div
      className={`mp-role-toggle${className ? ` ${className}` : ''}`}
      role="group"
      aria-label="Changer d’espace"
    >
      <button type="button" className="mp-role-toggle__btn" onClick={() => goAdmin()}>
        Admin
      </button>
      <button
        type="button"
        className="mp-role-toggle__btn mp-role-toggle__btn--on"
        aria-current="page"
        disabled
      >
        Personnel
      </button>
    </div>
  );
}
