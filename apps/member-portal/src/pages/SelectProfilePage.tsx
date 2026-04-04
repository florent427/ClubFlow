import { Navigate, useNavigate } from 'react-router-dom';
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

function profileRowKey(p: ViewerProfile): string {
  if (p.memberId) return `m:${p.memberId}`;
  if (p.contactId) return `c:${p.contactId}`;
  return '';
}

export function SelectProfilePage() {
  const navigate = useNavigate();
  const token = getToken();

  const { data, loading, error } = useQuery<ViewerProfilesQueryData>(
    VIEWER_PROFILES,
    { skip: !token },
  );

  const [selectProfile, { loading: selectingMember }] =
    useMutation<SelectProfileData>(SELECT_VIEWER_PROFILE);
  const [selectContactProfile, { loading: selectingContact }] =
    useMutation<SelectContactProfileData>(SELECT_VIEWER_CONTACT_PROFILE);

  const selecting = selectingMember || selectingContact;

  if (!token) {
    return <Navigate to="/login" replace />;
  }
  if (hasMemberSession()) {
    return <Navigate to="/" replace />;
  }

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
    void navigate('/', { replace: true });
  }

  const profiles = data?.viewerProfiles ?? [];
  const errMsg = error?.message ?? null;

  return (
    <div className="auth-page select-profile-page">
      <div className="auth-card auth-card-wide">
        <header className="auth-header">
          <p className="auth-eyebrow">ClubFlow</p>
          <h1>Choisir un profil</h1>
          <p className="auth-sub">
            Plusieurs espaces sont liés à votre compte (adhérent ou payeur
            contact). Sélectionnez celui avec lequel vous naviguez.
          </p>
        </header>
        {loading ? <p className="auth-hint">Chargement des profils…</p> : null}
        {errMsg ? <p className="auth-error">{errMsg}</p> : null}
        {!loading && profiles.length === 0 && !errMsg ? (
          <p className="auth-error">Aucun profil disponible.</p>
        ) : null}
        <ul className="profile-grid">
          {profiles.map((p) => (
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
                {p.contactId && !p.memberId ? (
                  <span className="profile-badge">Payeur (contact)</span>
                ) : p.isPrimaryProfile ? (
                  <span className="profile-badge">Payeur</span>
                ) : null}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
