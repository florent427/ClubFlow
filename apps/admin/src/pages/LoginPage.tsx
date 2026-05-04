import { type FormEvent, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useMutation, useApolloClient } from '@apollo/client/react';
import { LOGIN, MY_ADMIN_CLUBS } from '../lib/documents';
import type { LoginMutationData, MyAdminClubsQueryData } from '../lib/types';
import { hasActiveClub, setActiveClub, setToken } from '../lib/storage';

/**
 * Login admin — Phase 2 (post multi-tenant).
 *
 * Plus de champ "Identifiant club" : on demande seulement email + password.
 * Après auth réussie :
 *  - 0 club accessible → message d'erreur (compte sans accès)
 *  - 1 club → setActiveClub + redirect /
 *  - N clubs → redirect /select-club
 */
export function LoginPage() {
  const navigate = useNavigate();
  const apollo = useApolloClient();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const [login] = useMutation<LoginMutationData>(LOGIN);

  if (hasActiveClub()) {
    return <Navigate to="/" replace />;
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setPending(true);
    try {
      const { data } = await login({
        variables: { input: { email: email.trim(), password } },
      });
      const token = data?.login?.accessToken as string | undefined;
      if (!token) {
        setError('Réponse inattendue du serveur.');
        return;
      }
      // 1) Stocker le token (sans clubId encore)
      setToken(token);

      // 2) Charger la liste des clubs accessibles
      const result = await apollo.query<MyAdminClubsQueryData>({
        query: MY_ADMIN_CLUBS,
        fetchPolicy: 'network-only',
      });
      const clubs = result.data?.myAdminClubs ?? [];

      if (clubs.length === 0) {
        setError(
          "Votre compte n'a accès à aucun club. Vérifiez votre email de confirmation ou contactez l'administrateur.",
        );
        return;
      }

      if (clubs.length === 1) {
        const c = clubs[0];
        setActiveClub(c.id, c.slug);
        void navigate('/', { replace: true });
        return;
      }

      // N clubs → page de sélection
      void navigate('/select-club', { replace: true });
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : 'Connexion impossible.';
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
          <h1>Connexion</h1>
          <p className="login-sub">
            Espace administrateur de club. Pas de compte ?{' '}
            <a href="https://clubflow.topdigital.re/signup">Créer mon club</a>
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
              autoFocus
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
          {error ? <p className="form-error">{error}</p> : null}
          <button type="submit" className="btn btn-primary" disabled={pending}>
            {pending ? 'Connexion…' : 'Se connecter'}
          </button>
        </form>
      </div>
    </div>
  );
}
