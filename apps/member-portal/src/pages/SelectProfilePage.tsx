import { useEffect, useRef } from 'react';
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
import { getToken, hasMemberSession, setMemberSession } from '../lib/storage';
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

  async function pick(p: ViewerProfile) {
    if (p.memberId) {
      const { data: sel } = await selectProfile({
        variables: { memberId: p.memberId },
      });
      const newTok = sel?.selectActiveViewerProfile?.accessToken;
      if (!newTok) {
        return;
      }
      setMemberSession(newTok, p.clubId);
    } else if (p.contactId) {
      const { data: sel } = await selectContactProfile({
        variables: { contactId: p.contactId },
      });
      const newTok = sel?.selectActiveViewerContactProfile?.accessToken;
      if (!newTok) {
        return;
      }
      setMemberSession(newTok, p.clubId);
    } else {
      return;
    }
    void navigate(consumeReturnTo() ?? '/', { replace: true });
  }

  const profiles = data?.viewerProfiles ?? [];

  // --- Bypass automatique : un seul profil → sélection directe ---
  useEffect(() => {
    if (loading || autoPickedRef.current || profiles.length !== 1) return;
    autoPickedRef.current = true;
    void pick(profiles[0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, profiles]);

  if (!token) {
    return <Navigate to="/login" replace />;
  }
  if (hasMemberSession()) {
    return <Navigate to="/" replace />;
  }

  const errMsg = error?.message ?? null;

  // Pendant le bypass automatique, afficher un loader
  if (!loading && profiles.length === 1 && !errMsg) {
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
        {errMsg ? <p className="auth-error">{errMsg}</p> : null}
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
