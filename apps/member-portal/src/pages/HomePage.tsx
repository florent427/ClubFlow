import { useNavigate } from 'react-router-dom';
import { clearAuth } from '../lib/storage';

/** Placeholder Task 6 — layout complet en Task 7. */
export function HomePage() {
  const navigate = useNavigate();

  function logout() {
    clearAuth();
    void navigate('/login', { replace: true });
  }

  return (
    <main className="home-placeholder">
      <h1>Espace membre</h1>
      <p>Vous êtes connecté. Le tableau de bord Stitch arrive à la prochaine étape.</p>
      <button type="button" className="auth-btn auth-btn-secondary" onClick={logout}>
        Déconnexion
      </button>
    </main>
  );
}
