import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useMutation } from '@apollo/client/react';
import { VERIFY_EMAIL } from '../lib/documents';
import type { VerifyEmailData } from '../lib/auth-types';
import {
  clearClubId,
  hasMemberSession,
  setMemberContactSession,
  setMemberSession,
  setToken,
} from '../lib/storage';
import {
  consumeReturnTo,
  rememberReturnTo,
  safeReturnTo,
} from '../lib/return-to';

export function VerifyEmailPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const token = params.get('token') ?? '';
  // returnTo peut venir de l'URL (si le backend a propagé) OU du
  // sessionStorage (si l'user avait cliqué "Créer un compte" depuis une
  // invitation, avant d'arriver ici via email verification).
  const urlReturnTo = safeReturnTo(params.get('returnTo'));
  useEffect(() => {
    if (urlReturnTo) rememberReturnTo(urlReturnTo);
  }, [urlReturnTo]);
  const [error, setError] = useState<string | null>(null);

  const [runVerify, { loading }] = useMutation<VerifyEmailData>(VERIFY_EMAIL);

  useEffect(() => {
    if (!token.trim()) {
      setError('Lien incomplet (token manquant).');
      return;
    }
    if (hasMemberSession()) {
      void navigate(consumeReturnTo() ?? '/', { replace: true });
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const { data } = await runVerify({
          variables: { input: { token: token.trim() } },
        });
        if (cancelled) return;
        const payload = data?.verifyEmail;
        if (!payload?.accessToken) {
          setError('Réponse serveur inattendue.');
          return;
        }
        const profiles = payload.viewerProfiles ?? [];
        const cClub = payload.contactClubId ?? null;
        if (profiles.length === 0 && cClub) {
          setMemberContactSession(payload.accessToken, cClub);
        } else if (profiles.length === 1) {
          setMemberSession(payload.accessToken, profiles[0].clubId);
        } else {
          clearClubId();
          setToken(payload.accessToken);
        }
        void navigate(consumeReturnTo() ?? '/', { replace: true });
      } catch (e) {
        if (!cancelled) {
          setError(
            e instanceof Error ? e.message : 'Lien invalide ou expiré.',
          );
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, runVerify, navigate]);

  return (
    <div className="auth-page">
      <div className="auth-card">
        <header className="auth-header">
          <p className="auth-eyebrow">ClubFlow</p>
          <h1>Confirmation</h1>
          <p className="auth-sub">
            {loading && !error
              ? 'Validation du lien en cours…'
              : error
                ? error
                : 'Presque terminé…'}
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
