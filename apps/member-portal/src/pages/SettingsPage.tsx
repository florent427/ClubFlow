import { useMutation, useQuery } from '@apollo/client/react';
import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
} from 'react';
import { useNavigate } from 'react-router-dom';
import { getApiBaseUrl } from '../lib/api-base';
import { clearAuth, clearClubId, getClubId, getToken } from '../lib/storage';
import {
  VIEWER_ME,
  VIEWER_UPDATE_MY_PROFILE,
  VIEWER_SET_PAYER_SPACE_PIN,
  VIEWER_CLEAR_PAYER_SPACE_PIN,
} from '../lib/viewer-documents';
import type { ViewerMeData } from '../lib/viewer-types';
import { useToast } from '../components/ToastProvider';

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
  const { showToast } = useToast();
  const { data, loading } = useQuery<ViewerMeData>(VIEWER_ME);
  const me = data?.viewerMe;
  const isContact = me?.isContactProfile ?? false;

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [photoUrl, setPhotoUrl] = useState('');
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
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
      onCompleted: () => {
        const msg = 'Profil mis à jour.';
        setStatus({ tone: 'ok', msg });
        showToast(msg, 'success');
      },
      onError: (e) => {
        setStatus({ tone: 'error', msg: e.message });
        showToast(e.message, 'error');
      },
    },
  );

  async function handlePhotoSelect(
    e: ChangeEvent<HTMLInputElement>,
  ): Promise<void> {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      showToast('Format invalide — choisis une image (JPG, PNG, WebP).', 'error');
      e.target.value = '';
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      showToast('Image trop lourde (max 10 Mo).', 'error');
      e.target.value = '';
      return;
    }
    const token = getToken();
    const clubId = getClubId();
    if (!token || !clubId) {
      showToast('Session expirée — reconnecte-toi.', 'error');
      return;
    }
    setUploadingPhoto(true);
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await fetch(
        `${getApiBaseUrl()}/media/upload?kind=image`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'X-Club-Id': clubId,
          },
          body: form,
        },
      );
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(
          `Upload échoué (HTTP ${res.status}). ${text || 'Vérifie taille / format.'}`,
        );
      }
      const data = (await res.json()) as { publicUrl: string };
      setPhotoUrl(data.publicUrl);
      // Auto-save : on persiste le nouveau photoUrl tout de suite pour
      // que l'utilisateur n'ait pas à cliquer "Enregistrer" ensuite.
      // Les autres champs (firstName, lastName, etc.) restent éditables
      // et seront enregistrés au submit du formulaire comme avant.
      void updateProfile({
        variables: {
          input: {
            firstName: firstName.trim(),
            lastName: lastName.trim(),
            email: email.trim() || null,
            phone: phone.trim(),
            photoUrl: data.publicUrl,
          },
        },
      });
      showToast('Photo de profil mise à jour.', 'success');
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : 'Upload échoué.',
        'error',
      );
    } finally {
      setUploadingPhoto(false);
      e.target.value = '';
    }
  }

  function handleRemovePhoto(): void {
    setPhotoUrl('');
    void updateProfile({
      variables: {
        input: {
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          email: email.trim() || null,
          phone: phone.trim(),
          photoUrl: '',
        },
      },
    });
    showToast('Photo de profil retirée.', 'success');
  }

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
          ) : (
            <p className="mp-hint">
              Vous pouvez saisir votre propre e-mail si vous en avez un.
              Les e-mails du club concernant votre fiche y seront envoyés —
              une copie sera toujours adressée au(x) payeur(s) de votre
              foyer.
            </p>
          )}
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
            <div className="mp-field mp-field-wide">
              <span>Photo de profil</span>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 16,
                  marginTop: 6,
                }}
              >
                {photoUrl ? (
                  <img
                    src={photoUrl}
                    alt="Photo de profil"
                    style={{
                      width: 64,
                      height: 64,
                      borderRadius: '50%',
                      objectFit: 'cover',
                      border: '1px solid #cbd5e1',
                    }}
                  />
                ) : (
                  <div
                    aria-hidden="true"
                    style={{
                      width: 64,
                      height: 64,
                      borderRadius: '50%',
                      background: '#e2e8f0',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: '#64748b',
                      fontSize: '1.5rem',
                      fontWeight: 600,
                    }}
                  >
                    {(firstName[0] ?? '').toUpperCase()}
                    {(lastName[0] ?? '').toUpperCase()}
                  </div>
                )}
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 6,
                  }}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={(e) => void handlePhotoSelect(e)}
                    style={{ display: 'none' }}
                  />
                  <button
                    type="button"
                    className="mp-btn mp-btn-outline mp-btn-compact"
                    disabled={uploadingPhoto}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <span
                      className="material-symbols-outlined"
                      aria-hidden="true"
                      style={{ fontSize: '1.05rem' }}
                    >
                      upload
                    </span>{' '}
                    {uploadingPhoto
                      ? 'Envoi…'
                      : photoUrl
                        ? 'Changer la photo'
                        : 'Choisir une photo'}
                  </button>
                  {photoUrl ? (
                    <button
                      type="button"
                      className="mp-btn mp-btn-outline mp-btn-compact"
                      disabled={uploadingPhoto}
                      onClick={handleRemovePhoto}
                      style={{
                        color: '#b91c1c',
                        borderColor: 'rgba(185, 28, 28, 0.3)',
                      }}
                    >
                      Retirer
                    </button>
                  ) : null}
                  <small
                    className="mp-hint"
                    style={{ fontSize: '0.75rem', marginTop: 4 }}
                  >
                    JPG, PNG, WebP — max 10 Mo. La photo est sauvegardée
                    automatiquement après l’envoi.
                  </small>
                </div>
              </div>
            </div>
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
          onClick={() => {
            // Vide le clubId pour que SelectProfilePage n'auto-redirige
            // pas vers /. Sans ça, hasMemberSession() reste true et la
            // page envoie immédiatement vers le tableau de bord.
            clearClubId();
            void navigate('/select-profile', { replace: true });
          }}
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
  const { showToast } = useToast();
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
      const successMsg = pinSet
        ? 'Code PIN modifié.'
        : 'Code PIN activé. Vos pages /factures et /famille sont désormais protégées.';
      setStatus({ tone: 'ok', msg: successMsg });
      showToast(successMsg, 'success');
      // Invalide aussi l'unlock session (forcer une nouvelle saisie)
      try {
        sessionStorage.removeItem('mp:payer-space-unlocked-at');
      } catch {
        /* ignore */
      }
      reset();
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : 'Échec de l’activation.';
      setStatus({ tone: 'error', msg: errMsg });
      showToast(errMsg, 'error');
    }
  }

  async function handleClear(): Promise<void> {
    setStatus(null);
    try {
      await clearPin({ variables: { currentPin } });
      const msg = 'Code PIN désactivé.';
      setStatus({ tone: 'ok', msg });
      showToast(msg, 'success');
      try {
        sessionStorage.removeItem('mp:payer-space-unlocked-at');
      } catch {
        /* ignore */
      }
      reset();
    } catch (e) {
      const errMsg =
        e instanceof Error ? e.message : 'Échec de la désactivation.';
      setStatus({ tone: 'error', msg: errMsg });
      showToast(errMsg, 'error');
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
