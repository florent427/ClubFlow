import { type FormEvent, useState, useMemo } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useMutation, useApolloClient } from '@apollo/client/react';
import { RESET_PASSWORD, MY_ADMIN_CLUBS } from '../lib/documents';
import type {
  ResetPasswordData,
  MyAdminClubsQueryData,
} from '../lib/types';
import { setActiveClub, setToken } from '../lib/storage';
import { PasswordInput } from '../components/PasswordInput';

/**
 * Page de reset password.
 *
 * Lue depuis le lien envoyé par email, format :
 *   https://app.clubflow.topdigital.re/reset-password?token=<token>
 *
 * Après soumission :
 * - resetPassword(token, newPassword) → renvoie un accessToken (login auto)
 * - Charge la liste des clubs accessibles → redirect smart (1/N/0)
 *
 * Pas de field clubId : on suit la même logique que LoginPage post-Phase1.
 */
export function ResetPasswordPage() {
  const navigate = useNavigate();
  const apollo = useApolloClient();
  const [searchParams] = useSearchParams();
  const token = useMemo(() => searchParams.get('token') ?? '', [searchParams]);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [reset] = useMutation<ResetPasswordData>(RESET_PASSWORD);

  if (!token) {
    return (
      <div className="login-page">
        <div className="login-card">
          <header className="login-header">
            <p className="login-eyebrow">ClubFlow</p>
            <h1>Lien invalide</h1>
            <p className="login-sub">
              Aucun token de réinitialisation n'a été fourni.
            </p>
          </header>
          <p>
            <Link to="/forgot-password" className="btn btn-primary">
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
      setError('Le mot de passe doit faire au moins 8 caractères.');
      return;
    }
    if (password !== confirm) {
      setError('Les deux mots de passe ne correspondent pas.');
      return;
    }
    setPending(true);
    try {
      const { data } = await reset({
        variables: { input: { token, newPassword: password } },
      });
      const accessToken = data?.resetPassword?.accessToken;
      if (!accessToken) {
        setError('Réponse inattendue du serveur.');
        return;
      }
      // 1) Stocker le token (sans clubId encore)
      setToken(accessToken);
      // 2) Charger les clubs accessibles → redirect smart
      const result = await apollo.query<MyAdminClubsQueryData>({
        query: MY_ADMIN_CLUBS,
        fetchPolicy: 'network-only',
      });
      const clubs = result.data?.myAdminClubs ?? [];
      if (clubs.length === 0) {
        // Pas d'accès admin → l'utilisateur est probablement membre uniquement
        // (account portail). On pourrait rediriger vers le portail, mais
        // pour l'admin on log in vers /select-club qui affichera "0 club".
        void navigate('/select-club', { replace: true });
        return;
      }
      if (clubs.length === 1) {
        const c = clubs[0];
        setActiveClub(c.id, c.slug);
        void navigate('/', { replace: true });
        return;
      }
      void navigate('/select-club', { replace: true });
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : 'Réinitialisation impossible.';
      setError(msg);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <header className="login-header">
          <p className="login-eyebrow">ClubFlow</p>
          <h1>Nouveau mot de passe</h1>
          <p className="login-sub">
            Choisissez un nouveau mot de passe (8 caractères minimum).
          </p>
        </header>
        <form onSubmit={(e) => void onSubmit(e)} className="login-form">
          <label className="field">
            <span>Nouveau mot de passe</span>
            <PasswordInput
              value={password}
              onChange={setPassword}
              autoComplete="new-password"
              required
              minLength={8}
              autoFocus
            />
          </label>
          <label className="field">
            <span>Confirmer le mot de passe</span>
            <PasswordInput
              value={confirm}
              onChange={setConfirm}
              autoComplete="new-password"
              required
              minLength={8}
            />
          </label>
          {error ? <p className="form-error">{error}</p> : null}
          <button type="submit" className="btn btn-primary" disabled={pending}>
            {pending ? 'Réinitialisation…' : 'Définir le nouveau mot de passe'}
          </button>
        </form>
      </div>
    </div>
  );
}
