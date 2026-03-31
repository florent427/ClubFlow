import { navigateToAdminApp } from '../lib/admin-switch';
import { getClubId, getToken } from '../lib/storage';

type Props = {
  /**
   * Droit d’accès à l’app admin (serveur : `ClubMembership` avec rôle
   * club admin, bureau ou trésorerie — aligné sur `ClubAdminRoleGuard`).
   * Ne jamais afficher le bouton sans cette stricte égalité à true.
   */
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

/** Bascule vers l’app d’administration (visible uniquement si le serveur accorde le droit). */
export function MemberRoleToggle({
  canAccessClubBackOffice,
  adminWorkspaceClubId,
  className = '',
  variant = 'segment',
}: Props) {
  if (canAccessClubBackOffice !== true) {
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
        className={`mp-administration-header-btn${className ? ` ${className}` : ''}`}
        onClick={() => goAdmin()}
        title="Ouvrir l’administration ClubFlow"
        aria-label="Ouvrir l’administration ClubFlow (réservé aux gestionnaires du club)"
      >
        <span className="material-symbols-outlined" aria-hidden>
          admin_panel_settings
        </span>
        <span>Administration</span>
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
        Administration
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
