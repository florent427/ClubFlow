import { useMutation, useQuery } from '@apollo/client/react';
import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { clearAuth } from '../lib/storage';
import {
  VIEWER_ME,
  VIEWER_UPDATE_MY_PROFILE,
  VIEWER_SET_PAYER_SPACE_PIN,
  VIEWER_CLEAR_PAYER_SPACE_PIN,
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
      ) : (
        <form className="mp-form-card" onSubmit={onSubmit}>
          <h2 className="mp-section-title">
            {isContact ? 'Mon compte' : 'Mon profil'}
          </h2>
          {isContact ? (
            <p className="mp-hint">
              Vos coordonnées de contact. L'e-mail sert à vous connecter et
              n'est pas modifiable ici ; pour le changer, utilisez la
              procédure de changement d'e-mail dédiée.
            </p>
          ) : null}
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
              <span>E-mail{isContact ? ' (compte)' : ''}</span>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                readOnly={isContact}
                disabled={isContact}
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

      {me?.canManageMembershipCart ? (
        <PayerSpacePinCard pinSet={me.payerSpacePinSet} />
      ) : null}

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

interface PinResultData {
  ok: boolean;
}

function PayerSpacePinCard({ pinSet }: { pinSet: boolean }) {
  const [mode, setMode] = useState<'idle' | 'set' | 'clear'>('idle');
  const [currentPin, setCurrentPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [status, setStatus] = useState<null | {
    tone: 'ok' | 'error';
    msg: string;
  }>(null);

  const [setPin, { loading: settingPin }] = useMutation<{
    viewerSetPayerSpacePin: PinResultData;
  }>(VIEWER_SET_PAYER_SPACE_PIN, {
    refetchQueries: [{ query: VIEWER_ME }],
  });
  const [clearPin, { loading: clearingPin }] = useMutation<{
    viewerClearPayerSpacePin: PinResultData;
  }>(VIEWER_CLEAR_PAYER_SPACE_PIN, {
    refetchQueries: [{ query: VIEWER_ME }],
  });

  function reset(): void {
    setMode('idle');
    setCurrentPin('');
    setNewPin('');
    setConfirmPin('');
    setStatus(null);
  }

  async function handleSet(): Promise<void> {
    setStatus(null);
    if (!/^[0-9]{4}$/.test(newPin)) {
      setStatus({
        tone: 'error',
        msg: 'Le code doit contenir 4 chiffres.',
      });
      return;
    }
    if (newPin !== confirmPin) {
      setStatus({
        tone: 'error',
        msg: 'Les deux codes ne correspondent pas.',
      });
      return;
    }
    try {
      await setPin({
        variables: {
          newPin,
          currentPin: pinSet ? currentPin : null,
        },
      });
      setStatus({
        tone: 'ok',
        msg: pinSet
          ? 'Code PIN modifié.'
          : 'Code PIN activé. Vos pages /factures et /famille sont désormais protégées.',
      });
      // Invalide aussi l'unlock session (forcer une nouvelle saisie)
      try {
        sessionStorage.removeItem('mp:payer-space-unlocked-at');
      } catch {
        /* ignore */
      }
      reset();
    } catch (e) {
      setStatus({
        tone: 'error',
        msg: e instanceof Error ? e.message : 'Échec de l’activation.',
      });
    }
  }

  async function handleClear(): Promise<void> {
    setStatus(null);
    try {
      await clearPin({ variables: { currentPin } });
      setStatus({ tone: 'ok', msg: 'Code PIN désactivé.' });
      try {
        sessionStorage.removeItem('mp:payer-space-unlocked-at');
      } catch {
        /* ignore */
      }
      reset();
    } catch (e) {
      setStatus({
        tone: 'error',
        msg: e instanceof Error ? e.message : 'Échec de la désactivation.',
      });
    }
  }

  return (
    <section
      className="mp-form-card"
      style={{ marginTop: 24 }}
      aria-labelledby="pin-section-title"
    >
      <h2 id="pin-section-title" className="mp-section-title">
        Code PIN — espace facturation
      </h2>
      <p className="mp-hint" style={{ marginBottom: 12 }}>
        Protégez l’accès à <strong>Mes factures</strong> et{' '}
        <strong>Famille &amp; partage</strong> par un code à 4 chiffres.
        Une fois saisi, le code est mémorisé pendant 30 minutes pour cette
        session de navigateur.
      </p>

      <p className="mp-hint" style={{ marginBottom: 16, fontSize: '0.85rem' }}>
        Statut actuel :{' '}
        <strong style={{ color: pinSet ? '#15803d' : '#475569' }}>
          {pinSet ? 'Activé' : 'Désactivé'}
        </strong>
      </p>

      {mode === 'idle' ? (
        <div className="mp-form-actions">
          <button
            type="button"
            className="mp-btn mp-btn-primary"
            onClick={() => setMode('set')}
          >
            {pinSet ? 'Modifier le code' : 'Activer un code PIN'}
          </button>
          {pinSet ? (
            <button
              type="button"
              className="mp-btn mp-btn-outline"
              onClick={() => setMode('clear')}
            >
              Désactiver
            </button>
          ) : null}
        </div>
      ) : null}

      {mode === 'set' ? (
        <>
          {pinSet ? (
            <label className="mp-field">
              <span>Code PIN actuel</span>
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={4}
                value={currentPin}
                onChange={(e) =>
                  setCurrentPin(
                    e.target.value.replace(/[^0-9]/g, '').slice(0, 4),
                  )
                }
              />
            </label>
          ) : null}
          <label className="mp-field">
            <span>Nouveau code PIN</span>
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={4}
              value={newPin}
              onChange={(e) =>
                setNewPin(e.target.value.replace(/[^0-9]/g, '').slice(0, 4))
              }
              placeholder="0000"
            />
          </label>
          <label className="mp-field">
            <span>Confirmer le code</span>
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={4}
              value={confirmPin}
              onChange={(e) =>
                setConfirmPin(
                  e.target.value.replace(/[^0-9]/g, '').slice(0, 4),
                )
              }
              placeholder="0000"
            />
          </label>
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
              type="button"
              className="mp-btn mp-btn-outline"
              disabled={settingPin}
              onClick={reset}
            >
              Annuler
            </button>
            <button
              type="button"
              className="mp-btn mp-btn-primary"
              disabled={settingPin}
              onClick={() => void handleSet()}
            >
              {settingPin
                ? 'Enregistrement…'
                : pinSet
                  ? 'Modifier le code'
                  : 'Activer'}
            </button>
          </div>
        </>
      ) : null}

      {mode === 'clear' ? (
        <>
          <label className="mp-field">
            <span>Code PIN actuel</span>
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={4}
              value={currentPin}
              onChange={(e) =>
                setCurrentPin(
                  e.target.value.replace(/[^0-9]/g, '').slice(0, 4),
                )
              }
            />
          </label>
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
              type="button"
              className="mp-btn mp-btn-outline"
              disabled={clearingPin}
              onClick={reset}
            >
              Annuler
            </button>
            <button
              type="button"
              className="mp-btn mp-btn-danger"
              disabled={clearingPin}
              onClick={() => void handleClear()}
            >
              {clearingPin ? 'Désactivation…' : 'Confirmer la désactivation'}
            </button>
          </div>
        </>
      ) : null}

      {mode === 'idle' && status ? (
        <p
          className={`mp-hint ${
            status.tone === 'error' ? 'mp-hint-error' : 'mp-hint-ok'
          }`}
          style={{ marginTop: 12 }}
        >
          {status.msg}
        </p>
      ) : null}
    </section>
  );
}
