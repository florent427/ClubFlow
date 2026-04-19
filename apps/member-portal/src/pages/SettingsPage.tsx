import { useMutation, useQuery } from '@apollo/client/react';
import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { clearAuth } from '../lib/storage';
import {
  VIEWER_ME,
  VIEWER_UPDATE_MY_PROFILE,
} from '../lib/viewer-documents';
import type { ViewerMeData } from '../lib/viewer-types';

type UpdateProfileData = {
  viewerUpdateMyProfile: {
    id: string;
    firstName: string;
    lastName: string;
    email: string | null;
    phone: string | null;
    photoUrl: string | null;
  };
};

export function SettingsPage() {
  const navigate = useNavigate();
  const { data, loading } = useQuery<ViewerMeData>(VIEWER_ME);
  const me = data?.viewerMe;
  const isContact = me?.isContactProfile ?? false;

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [photoUrl, setPhotoUrl] = useState('');
  const [status, setStatus] = useState<null | {
    tone: 'ok' | 'error';
    msg: string;
  }>(null);

  useEffect(() => {
    if (!me) return;
    setFirstName(me.firstName ?? '');
    setLastName(me.lastName ?? '');
    setEmail(me.email ?? '');
    setPhone(me.phone ?? '');
    setPhotoUrl(me.photoUrl ?? '');
  }, [me]);

  const [updateProfile, { loading: saving }] = useMutation<UpdateProfileData>(
    VIEWER_UPDATE_MY_PROFILE,
    {
      refetchQueries: [{ query: VIEWER_ME }],
      onCompleted: () =>
        setStatus({ tone: 'ok', msg: 'Profil mis à jour.' }),
      onError: (e) => setStatus({ tone: 'error', msg: e.message }),
    },
  );

  function onSubmit(e: FormEvent): void {
    e.preventDefault();
    setStatus(null);
    void updateProfile({
      variables: {
        input: {
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          email: email.trim() || null,
          phone: phone.trim(),
          photoUrl: photoUrl.trim(),
        },
      },
    });
  }

  function logout() {
    clearAuth();
    void navigate('/login', { replace: true });
  }

  return (
    <div className="mp-page">
      <h1 className="mp-page-title">Paramètres</h1>
      <p className="mp-lead">
        Mettez à jour votre profil, gérez votre session et changez de compte.
      </p>

      {loading ? (
        <p className="mp-hint">Chargement…</p>
      ) : isContact ? (
        <div className="mp-form-card">
          <h2 className="mp-section-title">Mon compte</h2>
          <p className="mp-hint">
            Vous utilisez un compte contact (sans fiche adhérent). Pour modifier
            votre prénom, nom, e-mail ou téléphone, contactez le club : ces
            informations sont synchronisées avec votre rôle de payeur pour
            éviter toute divergence sur les factures.
          </p>
          <p className="mp-hint">
            Dès que le club vous aura rattaché à une fiche adhérent, vous
            pourrez éditer votre profil directement ici.
          </p>
        </div>
      ) : (
        <form className="mp-form-card" onSubmit={onSubmit}>
          <h2 className="mp-section-title">Mon profil</h2>
          <div className="mp-form-grid">
            <label className="mp-field">
              <span>Prénom</span>
              <input
                type="text"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                required
              />
            </label>
            <label className="mp-field">
              <span>Nom</span>
              <input
                type="text"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                required
              />
            </label>
            <label className="mp-field">
              <span>E-mail</span>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </label>
            <label className="mp-field">
              <span>Téléphone</span>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
            </label>
            <label className="mp-field mp-field-wide">
              <span>URL de photo (avatar)</span>
              <input
                type="url"
                value={photoUrl}
                onChange={(e) => setPhotoUrl(e.target.value)}
                placeholder="https://…"
              />
            </label>
          </div>
          {status ? (
            <p
              className={`mp-hint ${
                status.tone === 'error' ? 'mp-hint-error' : 'mp-hint-ok'
              }`}
            >
              {status.msg}
            </p>
          ) : null}
          <div className="mp-form-actions">
            <button
              type="submit"
              className="mp-btn mp-btn-primary"
              disabled={saving}
            >
              {saving ? 'Enregistrement…' : 'Enregistrer'}
            </button>
          </div>
        </form>
      )}

      <div className="mp-settings-actions">
        <button
          type="button"
          className="mp-btn mp-btn-secondary"
          onClick={() => void navigate('/select-profile', { replace: true })}
        >
          Choisir un autre profil
        </button>
        <button type="button" className="mp-btn mp-btn-danger" onClick={logout}>
          Se déconnecter
        </button>
      </div>
    </div>
  );
}
