import { Outlet, useNavigate } from 'react-router-dom';
import { clearAuth } from '../lib/storage';

/** Navigation minimale pour un compte « contact » sans fiche membre. */
export function ContactLayout() {
  const navigate = useNavigate();

  function logout(): void {
    clearAuth();
    void navigate('/login', { replace: true });
  }

  return (
    <div className="mp-shell">
      <aside className="mp-sidebar" aria-label="Navigation contact">
        <div className="mp-sidebar-brand">
          <span className="mp-logo">ClubFlow</span>
        </div>
        <nav className="mp-sidebar-nav">
          <span className="mp-sidebar-link mp-sidebar-link-active">
            <span className="mp-ico material-symbols-outlined">person</span>
            Espace contact
          </span>
        </nav>
        <button type="button" className="mp-cta-sidebar" onClick={logout}>
          Déconnexion
        </button>
      </aside>
      <div className="mp-main-wrap">
        <header className="mp-topbar">
          <div className="mp-breadcrumb">
            <span className="mp-bc-muted">Espace contact</span>
          </div>
        </header>
        <main className="mp-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
