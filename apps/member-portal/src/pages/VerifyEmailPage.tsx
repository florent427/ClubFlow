import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useMutation } from '@apollo/client/react';
import { VERIFY_EMAIL } from '../lib/documents';
import type { VerifyEmailData } from '../lib/auth-types';
import {
  clearAuth,
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

type Phase =
  | 'preparing' // initial : on attend que l'effet de verify démarre
  | 'verifying' // mutation runVerify en cours côté serveur
  | 'redirecting' // succès : navigate appelé, transition courte
  | 'error';

export function VerifyEmailPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const token = params.get('token') ?? '';
  const urlReturnTo = safeReturnTo(params.get('returnTo'));
  useEffect(() => {
    if (urlReturnTo) rememberReturnTo(urlReturnTo);
  }, [urlReturnTo]);

  const [phase, setPhase] = useState<Phase>('preparing');
  const [error, setError] = useState<string | null>(null);
  const [redirectTarget, setRedirectTarget] = useState<string | null>(null);

  const [runVerify] = useMutation<VerifyEmailData>(VERIFY_EMAIL);

  // Garde anti double-exécution. React StrictMode invoque useEffect 2x
  // en dev (mount-unmount-mount). On ne veut consommer le token qu'une
  // seule fois, et surtout ne PAS marquer la mutation comme cancelled,
  // sinon les résultats sont ignorés et la page reste figée.
  const verifyAttempted = useRef(false);

  useEffect(() => {
    if (!token.trim()) {
      setError('Lien incomplet (token manquant).');
      setPhase('error');
      return;
    }
    if (verifyAttempted.current) {
      return;
    }
    verifyAttempted.current = true;

    // Si l'utilisateur a déjà une session active (typique : un parent
    // qui clique sur le lien d'activation de son enfant depuis le même
    // navigateur), on déconnecte d'abord pour pouvoir basculer sur le
    // nouveau profil.
    if (hasMemberSession()) {
      clearAuth();
    }

    setPhase('verifying');
    void (async () => {
      try {
        const { data } = await runVerify({
          variables: { input: { token: token.trim() } },
        });
        const payload = data?.verifyEmail;
        if (!payload?.accessToken) {
          setError('Réponse serveur inattendue.');
          setPhase('error');
          return;
        }
        const profiles = payload.viewerProfiles ?? [];
        const cClub = payload.contactClubId ?? null;
        let target: string;
        if (profiles.length === 0 && cClub) {
          setMemberContactSession(payload.accessToken, cClub);
          target = consumeReturnTo() ?? '/';
        } else if (profiles.length === 1) {
          setMemberSession(payload.accessToken, profiles[0].clubId);
          target = consumeReturnTo() ?? '/';
        } else if (profiles.length > 1) {
          clearClubId();
          setToken(payload.accessToken);
          target = '/select-profile';
        } else {
          setError(
            'Compte vérifié, mais aucun profil rattaché à votre adresse e-mail. Contactez votre club pour qu’il vous ajoute.',
          );
          setPhase('error');
          return;
        }
        setRedirectTarget(target);
        setPhase('redirecting');
        // Navigate immédiatement ; en cas de race où le router ne
        // change pas l'URL, l'utilisateur a un bouton de fallback.
        void navigate(target, { replace: true });
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Lien invalide ou expiré.');
        setPhase('error');
      }
    })();
    // ⚠️ Dépendance unique à `token`. Inclure runVerify/navigate ferait
    // re-run l'effet si Apollo ou le router recréent leurs refs (ce qui
    // arrive régulièrement), et même avec verifyAttempted, l'ancien
    // bug du flag `cancelled` revenait.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const subText =
    phase === 'verifying'
      ? 'Validation du lien en cours…'
      : phase === 'redirecting'
        ? 'Compte vérifié — redirection…'
        : phase === 'error'
          ? error
          : 'Préparation…';

  return (
    <div className="auth-page">
      <div className="auth-card">
        <header className="auth-header">
          <p className="auth-eyebrow">ClubFlow</p>
          <h1>Confirmation</h1>
          <p className="auth-sub">{subText}</p>
        </header>
        {phase === 'redirecting' && redirectTarget ? (
          <p className="auth-footer">
            La redirection ne se fait pas ?{' '}
            <Link to={redirectTarget} replace className="auth-link">
              Cliquez ici
            </Link>
            .
          </p>
        ) : null}
        {phase === 'error' ? (
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
