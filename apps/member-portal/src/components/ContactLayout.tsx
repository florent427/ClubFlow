import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { clearAuth } from '../lib/storage';

function linkClass({ isActive }: { isActive: boolean }): string {
  return `mp-sidebar-link${isActive ? ' mp-sidebar-link-active' : ''}`;
}

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
          <NavLink to="/" end className={linkClass}>
            <span className="mp-ico material-symbols-outlined">home</span>
            Accueil
          </NavLink>
          <NavLink to="/facturation" className={linkClass}>
            <span className="mp-ico material-symbols-outlined">receipt_long</span>
            Mes factures
          </NavLink>
          <NavLink to="/famille" className={linkClass}>
            <span className="mp-ico material-symbols-outlined">groups</span>
            Famille
          </NavLink>
          <NavLink to="/actualites" className={linkClass}>
            <span className="mp-ico material-symbols-outlined">campaign</span>
            Actus & sondages
          </NavLink>
          <NavLink to="/evenements" className={linkClass}>
            <span className="mp-ico material-symbols-outlined">event</span>
            Événements
          </NavLink>
          <NavLink to="/parametres" className={linkClass}>
            <span className="mp-ico material-symbols-outlined">settings</span>
            Paramètres
          </NavLink>
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
