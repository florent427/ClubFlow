import { type FormEvent, useState } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { useMutation } from '@apollo/client/react';
import { RESET_PASSWORD } from '../lib/documents';
import type { ResetPasswordData } from '../lib/auth-types';
import {
  clearClubId,
  hasMemberSession,
  setMemberContactSession,
  setMemberSession,
  setToken,
} from '../lib/storage';

export function ResetPasswordPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const token = params.get('token') ?? '';
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);

  const [runReset, { loading }] = useMutation<ResetPasswordData>(RESET_PASSWORD);

  if (hasMemberSession()) {
    return <Navigate to="/" replace />;
  }
  if (!token.trim()) {
    return (
      <div className="auth-page">
        <div className="auth-card">
          <header className="auth-header">
            <p className="auth-eyebrow">ClubFlow</p>
            <h1>Lien invalide</h1>
            <p className="auth-sub">
              Le lien de réinitialisation est incomplet ou a expiré.
            </p>
          </header>
          <p className="auth-footer">
            <Link to="/forgot-password" className="auth-link">
              Demander un nouveau lien
            </Link>
          </p>
        </div>
      </div>
    );
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 8) {
      setError('Le mot de passe doit contenir au moins 8 caractères.');
      return;
    }
    if (password !== confirm) {
      setError('Les mots de passe ne correspondent pas.');
      return;
    }
    try {
      const { data } = await runReset({
        variables: { input: { token: token.trim(), newPassword: password } },
      });
      const payload = data?.resetPassword;
      if (!payload?.accessToken) {
        setError('Réponse serveur inattendue.');
        return;
      }
      const profiles = payload.viewerProfiles ?? [];
      const cClub = payload.contactClubId ?? null;
      if (profiles.length === 0) {
        if (cClub) {
          setMemberContactSession(payload.accessToken, cClub);
          void navigate('/', { replace: true });
          return;
        }
        setError(
          'Mot de passe mis à jour, mais aucun profil membre ni espace contact pour ce compte. Contactez votre club.',
        );
        return;
      }
      if (profiles.length === 1) {
        setMemberSession(payload.accessToken, profiles[0].clubId);
      } else {
        clearClubId();
        setToken(payload.accessToken);
      }
      void navigate('/', { replace: true });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Réinitialisation impossible.');
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <header className="auth-header">
          <p className="auth-eyebrow">ClubFlow</p>
          <h1>Nouveau mot de passe</h1>
          <p className="auth-sub">
            Choisissez un nouveau mot de passe pour votre compte.
          </p>
        </header>
        <form onSubmit={(e) => void onSubmit(e)} className="auth-form">
          <label className="auth-field">
            <span>Nouveau mot de passe (8 caractères min.)</span>
            <input
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={8}
              required
            />
          </label>
          <label className="auth-field">
            <span>Confirmer</span>
            <input
              type="password"
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              minLength={8}
              required
            />
          </label>
          {error ? <p className="auth-error">{error}</p> : null}
          <button type="submit" className="auth-btn" disabled={loading}>
            {loading ? 'Validation…' : 'Définir le mot de passe'}
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
