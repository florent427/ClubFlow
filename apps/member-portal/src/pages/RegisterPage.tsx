import { type FormEvent, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useMutation } from '@apollo/client/react';
import { REGISTER_CONTACT } from '../lib/documents';
import type { RegisterContactData } from '../lib/auth-types';
import { hasMemberSession } from '../lib/storage';

export function RegisterPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [alreadyExists, setAlreadyExists] = useState(false);
  const [done, setDone] = useState(false);

  const [register, { loading }] = useMutation<RegisterContactData>(
    REGISTER_CONTACT,
  );

  if (hasMemberSession()) {
    return <Navigate to="/" replace />;
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setAlreadyExists(false);
    try {
      await register({
        variables: {
          input: {
            email: email.trim().toLowerCase(),
            password,
            firstName: firstName.trim(),
            lastName: lastName.trim(),
          },
        },
      });
      setDone(true);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '';
      if (msg.includes('USER_ALREADY_EXISTS')) {
        setAlreadyExists(true);
        return;
      }
      setError(err instanceof Error ? err.message : 'Inscription impossible.');
    }
  }

  if (done) {
    return (
      <div className="auth-page">
        <div className="auth-card">
          <header className="auth-header">
            <p className="auth-eyebrow">ClubFlow</p>
            <h1>Vérifiez votre e-mail</h1>
            <p className="auth-sub">
              Un lien de confirmation a été envoyé à{' '}
              <strong>{email.trim()}</strong>. Cliquez dessus pour activer
              votre compte.
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

  if (alreadyExists) {
    return (
      <div className="auth-page">
        <div className="auth-card">
          <header className="auth-header">
            <p className="auth-eyebrow">ClubFlow</p>
            <h1>Compte déjà existant</h1>
            <p className="auth-sub">
              Un compte existe déjà pour <strong>{email.trim()}</strong>.
              Connectez-vous, ou réinitialisez votre mot de passe si
              nécessaire.
            </p>
          </header>
          <p className="auth-footer auth-footer-stack">
            <Link to="/login" className="auth-btn">
              Se connecter
            </Link>
            <Link to="/forgot-password" className="auth-link">
              Mot de passe oublié ?
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
          <h1>Créer un compte</h1>
          <p className="auth-sub">
            Inscription rapide en tant que contact du club. Vous pourrez
            compléter votre dossier plus tard.
          </p>
        </header>
        <form onSubmit={(e) => void onSubmit(e)} className="auth-form">
          <label className="auth-field">
            <span>Prénom</span>
            <input
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              autoComplete="given-name"
              required
            />
          </label>
          <label className="auth-field">
            <span>Nom</span>
            <input
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              autoComplete="family-name"
              required
            />
          </label>
          <label className="auth-field">
            <span>E-mail</span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              required
            />
          </label>
          <label className="auth-field">
            <span>Mot de passe (8 caractères min.)</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
              minLength={8}
              required
            />
          </label>
          {error ? <p className="auth-error">{error}</p> : null}
          <button type="submit" className="auth-btn" disabled={loading}>
            {loading ? 'Envoi…' : 'S’inscrire'}
          </button>
        </form>
        <p className="auth-footer">
          <Link to="/login" className="auth-link">
            Déjà un compte ? Connexion
          </Link>
        </p>
      </div>
    </div>
  );
}
