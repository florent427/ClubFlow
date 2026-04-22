import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  clearClubId,
  hasMemberSession,
  setMemberContactSession,
  setToken,
} from '../lib/storage';
import { consumeReturnTo } from '../lib/return-to';

/** Fragment #access_token=…&contact_club_id=… renvoyé par l’API après Google OAuth. */
export function OAuthCallbackPage() {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (hasMemberSession()) {
      void navigate(consumeReturnTo() ?? '/', { replace: true });
      return;
    }
    const h = window.location.hash.replace(/^#/, '');
    const p = new URLSearchParams(h);
    const accessToken = p.get('access_token');
    const contactClubId = p.get('contact_club_id');

    if (!accessToken?.trim()) {
      setError('Réponse Google incomplète. Réessayez depuis la connexion.');
      return;
    }

    window.history.replaceState(null, '', window.location.pathname);

    if (contactClubId?.trim()) {
      setMemberContactSession(accessToken.trim(), contactClubId.trim());
    } else {
      setToken(accessToken.trim());
      clearClubId();
    }

    // Priorité au returnTo mémorisé (ex. /rejoindre?code=XXX venant d'une
    // invitation familiale acceptée par Google).
    const returnTo = consumeReturnTo();
    if (returnTo) {
      void navigate(returnTo, { replace: true });
      return;
    }
    void navigate(
      contactClubId?.trim() ? '/' : '/select-profile',
      { replace: true },
    );
  }, [navigate]);

  return (
    <div className="auth-page">
      <div className="auth-card">
        <header className="auth-header">
          <p className="auth-eyebrow">ClubFlow</p>
          <h1>Connexion</h1>
          <p className="auth-sub">
            {error ?? 'Finalisation de la connexion…'}
          </p>
        </header>
        {error ? (
          <p className="auth-footer">
            <Link to="/login" className="auth-link">
              Retour à la connexion
            </Link>
          </p>
        ) : null}
      </div>
    </div>
  );
}
