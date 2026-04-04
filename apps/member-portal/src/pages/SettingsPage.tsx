import { useNavigate } from 'react-router-dom';
import { clearAuth } from '../lib/storage';

export function SettingsPage() {
  const navigate = useNavigate();

  function logout() {
    clearAuth();
    void navigate('/login', { replace: true });
  }

  return (
    <div className="mp-page">
      <h1 className="mp-page-title">Paramètres</h1>
      <p className="mp-lead">
        Gérez votre session et le changement de profil depuis cette page.
      </p>

      <div className="mp-settings-actions">
        <button
          type="button"
          className="mp-btn mp-btn-secondary"
          onClick={() => void navigate('/select-profile', { replace: true })}
        >
          Choisir un autre profil
        </button>
        <button type="button" className="mp-btn mp-btn-danger" onClick={logout}>
          Se déconnecter
        </button>
      </div>
    </div>
  );
}
