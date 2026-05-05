import { type FormEvent, useEffect, useState } from 'react';
import { Link, Navigate, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery } from '@apollo/client/react';
import { CLUB_BY_SLUG, REGISTER_CONTACT } from '../lib/documents';
import type { RegisterContactData } from '../lib/auth-types';
import { hasMemberSession } from '../lib/storage';
import {
  consumeReturnTo,
  peekReturnTo,
  rememberReturnTo,
  safeReturnTo,
} from '../lib/return-to';

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

export function RegisterPage() {
  const [params] = useSearchParams();
  const urlReturnTo = safeReturnTo(params.get('returnTo'));
  // Mémorise returnTo pour qu'il survive à l'étape email-verification.
  useEffect(() => {
    if (urlReturnTo) rememberReturnTo(urlReturnTo);
  }, [urlReturnTo]);
  const returnTo = urlReturnTo ?? peekReturnTo();
  const loginLink = returnTo
    ? `/login?returnTo=${encodeURIComponent(returnTo)}`
    : '/login';

  // Multi-tenant : `?club=<slug>` détermine le club d'inscription.
  // Si absent, on tombe sur le fallback `CLUB_ID` env (compat SKSR
  // historique mono-tenant) — comportement transparent pour le user.
  const clubSlug = params.get('club')?.trim().toLowerCase() ?? null;
  const { data: clubData, loading: clubLoading } = useQuery<ClubBySlugData>(
    CLUB_BY_SLUG,
    {
      variables: { slug: clubSlug ?? '' },
      skip: !clubSlug,
      fetchPolicy: 'cache-first',
    },
  );
  const club = clubData?.clubBySlug ?? null;
  const clubSlugInvalid = clubSlug != null && !clubLoading && club == null;

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
    return <Navigate to={consumeReturnTo() ?? '/'} replace />;
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
            // Si présent, on rejoint ce club explicitement. Sinon backend
            // tombe sur le fallback CLUB_ID env (mono-tenant SKSR).
            clubSlug: clubSlug ?? undefined,
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
            <Link to={loginLink} className="auth-link">
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
            <Link to={loginLink} className="auth-btn">
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

  // Slug fourni mais club introuvable → on bloque l'inscription pour
  // éviter une création silencieuse sur le mauvais club (env fallback).
  if (clubSlugInvalid) {
    return (
      <div className="auth-page">
        <div className="auth-card">
          <header className="auth-header">
            <p className="auth-eyebrow">ClubFlow</p>
            <h1>Club introuvable</h1>
            <p className="auth-sub">
              Le club « <strong>{clubSlug}</strong> » n'existe pas ou n'est
              plus disponible. Vérifiez le lien que vous a envoyé votre
              club, ou demandez-lui de vous renvoyer une invitation.
            </p>
          </header>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <header className="auth-header">
          {/* En-tête club : si l'utilisateur arrive avec ?club=<slug>,
              on lui montre clairement à quel club il s'inscrit (logo +
              nom). Évite les inscriptions accidentelles sur le mauvais
              tenant. */}
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
                <p className="auth-club-banner__eyebrow">Vous rejoignez</p>
                <h2 className="auth-club-banner__name">{club.name}</h2>
              </div>
            </div>
          ) : (
            <p className="auth-eyebrow">ClubFlow</p>
          )}
          <h1>Créer un compte</h1>
          <p className="auth-sub">
            {club
              ? `Inscription rapide comme contact de ${club.name}. Vous pourrez compléter votre dossier ensuite.`
              : 'Inscription rapide en tant que contact du club. Vous pourrez compléter votre dossier plus tard.'}
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
          <Link to={loginLink} className="auth-link">
            Déjà un compte ? Connexion
          </Link>
        </p>
      </div>
    </div>
  );
}
