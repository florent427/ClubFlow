import { Navigate, useNavigate } from 'react-router-dom';
import { useMutation, useQuery } from '@apollo/client/react';
import {
  SELECT_VIEWER_PROFILE,
  VIEWER_PROFILES,
} from '../lib/documents';
import type {
  SelectProfileData,
  ViewerProfilesQueryData,
} from '../lib/auth-types';
import { getToken, hasMemberSession, setMemberSession } from '../lib/storage';

export function SelectProfilePage() {
  const navigate = useNavigate();
  const token = getToken();

  const { data, loading, error } = useQuery<ViewerProfilesQueryData>(
    VIEWER_PROFILES,
    { skip: !token },
  );

  const [selectProfile, { loading: selecting }] =
    useMutation<SelectProfileData>(SELECT_VIEWER_PROFILE);

  if (!token) {
    return <Navigate to="/login" replace />;
  }
  if (hasMemberSession()) {
    return <Navigate to="/" replace />;
  }

  async function pick(memberId: string, clubId: string) {
    const { data: sel } = await selectProfile({
      variables: { memberId },
    });
    const newTok = sel?.selectActiveViewerProfile?.accessToken;
    if (!newTok) {
      return;
    }
    setMemberSession(newTok, clubId);
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
            Plusieurs adhérents sont liés à votre compte. Sélectionnez celui
            avec lequel vous naviguez.
          </p>
        </header>
        {loading ? <p className="auth-hint">Chargement des profils…</p> : null}
        {errMsg ? <p className="auth-error">{errMsg}</p> : null}
        {!loading && profiles.length === 0 && !errMsg ? (
          <p className="auth-error">Aucun profil disponible.</p>
        ) : null}
        <ul className="profile-grid">
          {profiles.map((p) => (
            <li key={p.memberId}>
              <button
                type="button"
                className="profile-tile"
                disabled={selecting}
                onClick={() => void pick(p.memberId, p.clubId)}
              >
                <span className="profile-avatar" aria-hidden>
                  {p.firstName.slice(0, 1)}
                  {p.lastName.slice(0, 1)}
                </span>
                <span className="profile-name">
                  {p.firstName} {p.lastName}
                </span>
                {p.isPrimaryProfile ? (
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
