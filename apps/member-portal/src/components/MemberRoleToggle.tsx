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
  /**
   * `header` : bouton unique très visible dans la barre du haut.
   * `segment` : duo Admin + Personnel (ex. tableau de bord).
   */
  variant?: 'header' | 'segment';
};

/** Accès back-office depuis le portail membre. */
export function MemberRoleToggle({
  canAccessClubBackOffice,
  adminWorkspaceClubId,
  className = '',
  variant = 'segment',
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

  if (variant === 'header') {
    return (
      <button
        type="button"
        className={`mp-backoffice-header-btn${className ? ` ${className}` : ''}`}
        onClick={() => goAdmin()}
        title="Ouvrir le back-office ClubFlow"
        aria-label="Ouvrir le back-office ClubFlow"
      >
        <span className="material-symbols-outlined" aria-hidden>
          admin_panel_settings
        </span>
        <span>Back-office</span>
      </button>
    );
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
