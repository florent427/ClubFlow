import { type FormEvent, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useMutation } from '@apollo/client/react';
import { REQUEST_PASSWORD_RESET } from '../lib/documents';
import type { RequestPasswordResetData } from '../lib/auth-types';
import { hasMemberSession } from '../lib/storage';

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const [requestReset, { loading }] = useMutation<RequestPasswordResetData>(
    REQUEST_PASSWORD_RESET,
  );

  if (hasMemberSession()) {
    return <Navigate to="/" replace />;
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await requestReset({
        variables: { input: { email: email.trim().toLowerCase() } },
      });
      setDone(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Demande impossible.');
    }
  }

  if (done) {
    return (
      <div className="auth-page">
        <div className="auth-card">
          <header className="auth-header">
            <p className="auth-eyebrow">ClubFlow</p>
            <h1>E-mail envoyé</h1>
            <p className="auth-sub">
              Si un compte existe pour <strong>{email.trim()}</strong>, un
              lien de réinitialisation vient d’être envoyé. Le lien est
              valable 1 heure.
            </p>
          </header>
          <p className="auth-footer">
            <Link to="/login" className="auth-link">
              Retour à la connexion
            </Link>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <header className="auth-header">
          <p className="auth-eyebrow">ClubFlow</p>
          <h1>Mot de passe oublié</h1>
          <p className="auth-sub">
            Saisissez l’e-mail de votre compte. Nous vous enverrons un lien
            de réinitialisation.
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
          {error ? <p className="auth-error">{error}</p> : null}
          <button type="submit" className="auth-btn" disabled={loading}>
            {loading ? 'Envoi…' : 'Envoyer le lien'}
          </button>
        </form>
        <p className="auth-footer">
          <Link to="/login" className="auth-link">
            Retour à la connexion
          </Link>
        </p>
      </div>
    </div>
  );
}
