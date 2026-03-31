import { type FormEvent, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useMutation } from '@apollo/client/react';
import { LOGIN_WITH_PROFILES } from '../lib/documents';
import type { LoginWithProfilesData } from '../lib/auth-types';
import {
  clearAuth,
  clearClubId,
  getClubId,
  getToken,
  hasMemberSession,
  setMemberSession,
  setToken,
} from '../lib/storage';

export function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  const [login, { loading }] = useMutation<LoginWithProfilesData>(
    LOGIN_WITH_PROFILES,
  );

  if (hasMemberSession()) {
    return <Navigate to="/" replace />;
  }
  if (getToken() && !getClubId()) {
    return <Navigate to="/select-profile" replace />;
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const { data } = await login({
        variables: {
          input: { email: email.trim(), password },
        },
      });
      const payload = data?.login;
      const token = payload?.accessToken;
      const profiles = payload?.viewerProfiles ?? [];
      if (!token) {
        setError('Réponse inattendue du serveur.');
        return;
      }
      if (profiles.length === 0) {
        setError(
          'Aucun profil membre lié à ce compte. Contactez votre club.',
        );
        return;
      }
      setToken(token);
      if (profiles.length === 1) {
        const p = profiles[0];
        setMemberSession(token, p.clubId);
        void navigate('/', { replace: true });
        return;
      }
      clearClubId();
      void navigate('/select-profile', { replace: true });
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : 'Connexion impossible.';
      setError(msg);
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <header className="auth-header">
          <p className="auth-eyebrow">ClubFlow</p>
          <h1>Espace membre</h1>
          <p className="auth-sub">
            Connectez-vous avec l’e-mail enregistré auprès du club. Le club
            actif sera choisi à l’étape suivante si vous avez plusieurs profils.
          </p>
        </header>
        <form onSubmit={(e) => void onSubmit(e)} className="auth-form">
          <label className="auth-field">
            <span>E-mail</span>
            <input
              type="email"
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </label>
          <label className="auth-field">
            <span>Mot de passe</span>
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </label>
          {error ? <p className="auth-error">{error}</p> : null}
          <button type="submit" className="auth-btn" disabled={loading}>
            {loading ? 'Connexion…' : 'Se connecter'}
          </button>
        </form>
        <p className="auth-footer">
          <button
            type="button"
            className="auth-link"
            onClick={() => clearAuth()}
          >
            Effacer la session locale
          </button>
        </p>
      </div>
    </div>
  );
}
