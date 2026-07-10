import { useEffect, useRef, useState } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery } from '@apollo/client/react';
import {
  SELECT_VIEWER_CONTACT_PROFILE,
  SELECT_VIEWER_PROFILE,
  VIEWER_PROFILES,
} from '../lib/documents';
import type {
  SelectContactProfileData,
  SelectProfileData,
  ViewerProfile,
  ViewerProfilesQueryData,
} from '../lib/auth-types';
import {
  clearAuth,
  getToken,
  hasMemberSession,
  isTokenValid,
  setMemberSession,
} from '../lib/storage';
import {
  consumeReturnTo,
  rememberReturnTo,
  safeReturnTo,
} from '../lib/return-to';

function profileRowKey(p: ViewerProfile): string {
  if (p.memberId) return `m:${p.memberId}`;
  if (p.contactId) return `c:${p.contactId}`;
  return '';
}

/**
 * Recommandation UX #1 — Bypass automatique de la sélection de profil
 * Si l'utilisateur ne possède qu'un seul profil, il est sélectionné
 * automatiquement et redirigé vers le tableau de bord.
 *
 * Recommandation UX #5 — Glossaire UX unifié
 * Les badges "Payeur" et "Payeur (contact)" sont reformulés en
 * "Responsable facturation" et "Espace Contact" pour plus de clarté.
 */
function profileBadge(p: ViewerProfile): string | null {
  if (p.contactId && !p.memberId) return 'Espace Contact';
  if (p.isPrimaryProfile) return 'Responsable facturation';
  return null;
}

function profileSubline(p: ViewerProfile): string | null {
  if (p.contactId && !p.memberId) return 'Accès facturation uniquement';
  return null;
}

export function SelectProfilePage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const urlReturnTo = safeReturnTo(params.get('returnTo'));
  useEffect(() => {
    if (urlReturnTo) rememberReturnTo(urlReturnTo);
  }, [urlReturnTo]);
  const token = getToken();
  const autoPickedRef = useRef(false);

  const { data, loading, error } = useQuery<ViewerProfilesQueryData>(
    VIEWER_PROFILES,
    { skip: !token },
  );

  const [selectProfile, { loading: selectingMember }] =
    useMutation<SelectProfileData>(SELECT_VIEWER_PROFILE);
  const [selectContactProfile, { loading: selectingContact }] =
    useMutation<SelectContactProfileData>(SELECT_VIEWER_CONTACT_PROFILE);

  const selecting = selectingMember || selectingContact;

  const [pickError, setPickError] = useState<string | null>(null);

  async function pick(p: ViewerProfile) {
    setPickError(null);
    try {
      if (p.memberId) {
        const { data: sel } = await selectProfile({
          variables: { memberId: p.memberId },
        });
        const newTok = sel?.selectActiveViewerProfile?.accessToken;
        if (!newTok) {
          throw new Error('Réponse inattendue du serveur.');
        }
        setMemberSession(newTok, p.clubId);
      } else if (p.contactId) {
        const { data: sel } = await selectContactProfile({
          variables: { contactId: p.contactId },
        });
        const newTok = sel?.selectActiveViewerContactProfile?.accessToken;
        if (!newTok) {
          throw new Error('Réponse inattendue du serveur.');
        }
        setMemberSession(newTok, p.clubId);
      } else {
        return;
      }
      void navigate(consumeReturnTo() ?? '/', { replace: true });
    } catch (err) {
      // Réarmer le bypass pour permettre un nouvel essai (bug QA M7 :
      // avant, « Connexion en cours… » restait affiché pour toujours).
      autoPickedRef.current = false;
      const raw = err instanceof Error ? err.message : '';
      setPickError(
        /failed to fetch|networkerror/i.test(raw)
          ? 'Connexion au serveur impossible. Vérifiez votre réseau puis réessayez.'
          : raw || 'Impossible de sélectionner ce profil. Réessayez.',
      );
    }
  }

  const profiles = data?.viewerProfiles ?? [];

  // --- Bypass automatique : un seul profil → sélection directe ---
  useEffect(() => {
    if (loading || autoPickedRef.current || profiles.length !== 1) return;
    if (pickError) return;
    autoPickedRef.current = true;
    void pick(profiles[0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, profiles, pickError]);

  // Token absent OU expiré → retour login (bug QA C2 : un token expiré
  // piégeait l'utilisateur entre /login et /select-profile).
  if (!token || !isTokenValid()) {
    clearAuth();
    return <Navigate to="/login?reason=session-expiree" replace />;
  }
  if (hasMemberSession()) {
    return <Navigate to="/" replace />;
  }

  const queryErrRaw = error?.message ?? null;
  const errMsg =
    pickError ??
    (queryErrRaw
      ? /unauthorized/i.test(queryErrRaw)
        ? 'Votre session a expiré. Reconnectez-vous.'
        : queryErrRaw
      : null);

  function logout() {
    clearAuth();
    void navigate('/login', { replace: true });
  }

  // Pendant le bypass automatique, afficher un loader
  if (!loading && profiles.length === 1 && !errMsg && !pickError) {
    return (
      <div className="auth-page select-profile-page">
        <div className="auth-card auth-card-wide">
          <header className="auth-header">
            <p className="auth-eyebrow">ClubFlow</p>
            <h1>Connexion en cours…</h1>
            <p className="auth-sub">
              Redirection automatique vers votre espace.
            </p>
          </header>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-page select-profile-page">
      <div className="auth-card auth-card-wide">
        <header className="auth-header">
          <p className="auth-eyebrow">ClubFlow</p>
          <h1>Choisir un profil</h1>
          <p className="auth-sub">
            Plusieurs espaces sont liés à votre compte. Sélectionnez celui
            avec lequel vous souhaitez naviguer.
          </p>
        </header>
        {loading ? <p className="auth-hint">Chargement des profils…</p> : null}
        {errMsg ? (
          <div>
            <p className="auth-error">{errMsg}</p>
            <p className="auth-hint">
              <button
                type="button"
                className="auth-link"
                onClick={logout}
                style={{
                  background: 'none',
                  border: 0,
                  padding: 0,
                  cursor: 'pointer',
                  font: 'inherit',
                }}
              >
                Se reconnecter avec un autre compte
              </button>
            </p>
          </div>
        ) : null}
        {!loading && profiles.length === 0 && !errMsg ? (
          <p className="auth-error">Aucun profil disponible.</p>
        ) : null}
        <ul className="profile-grid">
          {profiles.map((p) => {
            const badge = profileBadge(p);
            const subline = profileSubline(p);
            return (
              <li key={profileRowKey(p)}>
                <button
                  type="button"
                  className="profile-tile"
                  disabled={selecting}
                  onClick={() => void pick(p)}
                >
                  <span className="profile-avatar" aria-hidden>
                    {p.firstName.slice(0, 1)}
                    {p.lastName.slice(0, 1)}
                  </span>
                  <span className="profile-name">
                    {p.firstName} {p.lastName}
                  </span>
                  {/* Club rattaché — visible en permanence pour
                      différencier les profils multi-clubs. */}
                  {p.clubName ? (
                    <span className="profile-club">
                      {p.clubLogoUrl ? (
                        <img
                          src={p.clubLogoUrl}
                          alt=""
                          className="profile-club__logo"
                        />
                      ) : null}
                      <span>{p.clubName}</span>
                    </span>
                  ) : null}
                  {badge ? (
                    <span className="profile-badge">{badge}</span>
                  ) : null}
                  {subline ? (
                    <span className="profile-subline">{subline}</span>
                  ) : null}
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
