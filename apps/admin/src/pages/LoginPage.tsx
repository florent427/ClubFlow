import { type FormEvent, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useMutation } from '@apollo/client/react';
import { LOGIN } from '../lib/documents';
import type { LoginMutationData } from '../lib/types';
import { isLoggedIn, setSession } from '../lib/storage';

const defaultClubId = import.meta.env.VITE_DEV_CLUB_ID ?? '';

export function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('admin@clubflow.local');
  const [password, setPassword] = useState('ChangeMe!');
  const [clubId, setClubId] = useState(defaultClubId);
  const [error, setError] = useState<string | null>(null);

  const [login, { loading }] = useMutation<LoginMutationData>(LOGIN);

  if (isLoggedIn()) {
    return <Navigate to="/" replace />;
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!clubId.trim()) {
      setError('Indiquez l’identifiant du club (UUID), affiché après npm run db:seed.');
      return;
    }
    try {
      const { data } = await login({
        variables: { input: { email: email.trim(), password } },
      });
      const token = data?.login?.accessToken as string | undefined;
      if (!token) {
        setError('Réponse inattendue du serveur.');
        return;
      }
      setSession(token, clubId.trim());
      void navigate('/', { replace: true });
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : 'Connexion impossible.';
      setError(msg);
    }
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <header className="login-header">
          <p className="login-eyebrow">ClubFlow</p>
          <h1>Back-office</h1>
          <p className="login-sub">
            Connexion réservée aux administrateurs du club (tête de section 3.1
            — conception).
          </p>
        </header>
        <form onSubmit={(e) => void onSubmit(e)} className="login-form">
          <label className="field">
            <span>Email</span>
            <input
              type="email"
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </label>
          <label className="field">
            <span>Mot de passe</span>
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </label>
          <label className="field">
            <span>Identifiant club (X-Club-Id)</span>
            <input
              type="text"
              placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
              value={clubId}
              onChange={(e) => setClubId(e.target.value)}
              required
            />
          </label>
          {error ? <p className="form-error">{error}</p> : null}
          <button type="submit" className="btn btn-primary" disabled={loading}>
            {loading ? 'Connexion…' : 'Se connecter'}
          </button>
        </form>
        <p className="login-hint">
          Astuce : enchaînez <code>npm run db:seed</code> dans{' '}
          <code>apps/api</code> pour afficher l’UUID du club démo.
        </p>
      </div>
    </div>
  );
}
