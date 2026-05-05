import { type FormEvent, useEffect, useState } from 'react';
import {
  Link,
  Navigate,
  useNavigate,
  useSearchParams,
} from 'react-router-dom';
import { useMutation, useQuery } from '@apollo/client/react';
import { CLUB_BY_SLUG, LOGIN_WITH_PROFILES } from '../lib/documents';
import type { LoginWithProfilesData } from '../lib/auth-types';

type ClubBySlugData = {
  clubBySlug: {
    id: string;
    slug: string;
    name: string;
    logoUrl: string | null;
    customDomain: string | null;
    tagline: string | null;
  } | null;
};
import { getApiBaseUrl } from '../lib/api-base';
import {
  clearAuth,
  clearClubId,
  getClubId,
  getToken,
  hasMemberSession,
  setMemberContactSession,
  setMemberSession,
  setToken,
} from '../lib/storage';
import {
  consumeReturnTo,
  peekReturnTo,
  rememberReturnTo,
  safeReturnTo,
} from '../lib/return-to';

export function LoginPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const urlReturnTo = safeReturnTo(params.get('returnTo'));
  // Mémorise returnTo pour persister à travers le flow (register, verify-email…)
  useEffect(() => {
    if (urlReturnTo) rememberReturnTo(urlReturnTo);
  }, [urlReturnTo]);
  const returnTo = urlReturnTo ?? peekReturnTo();

  // Multi-tenant : `?club=<slug>` brand la page login (logo + nom du
  // club). Optionnel — le login reste possible sans (User est global,
  // SelectProfile filtre après).
  const clubSlug = params.get('club')?.trim().toLowerCase() ?? null;
  const { data: clubData } = useQuery<ClubBySlugData>(CLUB_BY_SLUG, {
    variables: { slug: clubSlug ?? '' },
    skip: !clubSlug,
    fetchPolicy: 'cache-first',
  });
  const club = clubData?.clubBySlug ?? null;

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  const [login, { loading }] = useMutation<LoginWithProfilesData>(
    LOGIN_WITH_PROFILES,
  );

  if (hasMemberSession()) {
    return <Navigate to={returnTo ?? '/'} replace />;
  }
  if (getToken() && !getClubId()) {
    // Transmet returnTo à select-profile pour que le flow continue après
    // choix de profil.
    const target = returnTo
      ? `/select-profile?returnTo=${encodeURIComponent(returnTo)}`
      : '/select-profile';
    return <Navigate to={target} replace />;
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
      const contactClubId = payload?.contactClubId ?? null;
      if (!token) {
        setError('Réponse inattendue du serveur.');
        return;
      }
      if (profiles.length === 0) {
        if (contactClubId) {
          setMemberContactSession(token, contactClubId);
          void navigate(consumeReturnTo() ?? returnTo ?? '/', { replace: true });
          return;
        }
        setError(
          'Aucun profil membre ni espace contact pour ce compte. Contactez votre club.',
        );
        return;
      }
      setToken(token);
      if (profiles.length === 1) {
        const p = profiles[0];
        setMemberSession(token, p.clubId);
        void navigate(consumeReturnTo() ?? returnTo ?? '/', { replace: true });
        return;
      }
      clearClubId();
      const target = returnTo
        ? `/select-profile?returnTo=${encodeURIComponent(returnTo)}`
        : '/select-profile';
      void navigate(target, { replace: true });
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
          {/* En-tête club (si ?club=<slug>) — homogène avec /register.
              Sans param : header générique ClubFlow. Le login lui-même
              fonctionne dans les 2 cas (User identifié par email global,
              le club est résolu après via SelectProfile). */}
          {club ? (
            <div className="auth-club-banner">
              {club.logoUrl ? (
                <img
                  src={club.logoUrl}
                  alt=""
                  className="auth-club-banner__logo"
                />
              ) : (
                <span
                  className="auth-club-banner__logo auth-club-banner__logo--initials"
                  aria-hidden="true"
                >
                  {club.name
                    .split(/\s+/)
                    .map((w) => w[0])
                    .join('')
                    .slice(0, 2)
                    .toUpperCase()}
                </span>
              )}
              <div>
                <p className="auth-club-banner__eyebrow">Connexion</p>
                <h2 className="auth-club-banner__name">{club.name}</h2>
              </div>
            </div>
          ) : (
            <p className="auth-eyebrow">ClubFlow</p>
          )}
          <h1>Espace membre</h1>
          <p className="auth-sub">
            {club
              ? `Connectez-vous à votre espace ${club.name} avec votre e-mail. Si vous êtes membre de plusieurs clubs, vous choisirez à l'étape suivante.`
              : 'Connectez-vous avec l’e-mail enregistré auprès du club. Le club actif sera choisi à l’étape suivante si vous avez plusieurs profils.'}
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
          <p className="auth-forgot">
            <Link to="/forgot-password" className="auth-link">
              Mot de passe oublié ?
            </Link>
          </p>
        </form>
        <p className="auth-footer auth-footer-stack">
          <a
            href={`${getApiBaseUrl()}/auth/google${returnTo ? `?returnTo=${encodeURIComponent(returnTo)}` : ''}`}
            className="auth-btn auth-btn-secondary"
          >
            Continuer avec Google
          </a>
          <Link
            to={(() => {
              // Propage `?club=<slug>` vers /register pour homogénéité
              // (banner club affiché, club bind à l'inscription).
              const qs = new URLSearchParams();
              if (returnTo) qs.set('returnTo', returnTo);
              if (clubSlug) qs.set('club', clubSlug);
              const q = qs.toString();
              return q ? `/register?${q}` : '/register';
            })()}
            className="auth-link"
          >
            Créer un compte contact
          </Link>
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
