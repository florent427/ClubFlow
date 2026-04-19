import { useMutation } from '@apollo/client/react';
import { useState } from 'react';
import { VIEWER_REGISTER_CHILD_MEMBER } from '../lib/viewer-documents';
import type { ViewerRegisterChildMemberData } from '../lib/viewer-types';

type Civility = 'MR' | 'MME';

/**
 * CTA « Inscrire un enfant » — disponible pour un payeur de foyer
 * (contact ou membre). Ouvre une modale qui crée une fiche adhérent
 * mineure rattachée au foyer du viewer.
 */
export function RegisterChildMemberCta() {
  const [open, setOpen] = useState(false);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [civility, setCivility] = useState<Civility>('MR');
  const [birthDate, setBirthDate] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [registerChild, { loading }] = useMutation<ViewerRegisterChildMemberData>(
    VIEWER_REGISTER_CHILD_MEMBER,
  );

  function resetAndClose() {
    setOpen(false);
    setLocalError(null);
    setSuccess(null);
    setFirstName('');
    setLastName('');
    setBirthDate('');
    setCivility('MR');
  }

  async function onSubmit() {
    setLocalError(null);
    if (!firstName.trim() || !lastName.trim() || !birthDate) {
      setLocalError('Prénom, nom et date de naissance sont obligatoires.');
      return;
    }
    try {
      const { data } = await registerChild({
        variables: {
          input: {
            firstName: firstName.trim(),
            lastName: lastName.trim(),
            civility,
            birthDate,
          },
        },
      });
      const res = data?.viewerRegisterChildMember;
      if (!res?.memberId) {
        setLocalError('Impossible d\u2019inscrire l\u2019enfant.');
        return;
      }
      setSuccess(
        `Fiche créée pour ${res.firstName} ${res.lastName}. Le club revient vers vous pour la formule d'adhésion.`,
      );
      setTimeout(() => {
        window.location.reload();
      }, 1800);
    } catch (err: unknown) {
      setLocalError(
        err instanceof Error
          ? err.message
          : 'Impossible d\u2019inscrire l\u2019enfant.',
      );
    }
  }

  return (
    <>
      <button
        type="button"
        className="mp-btn mp-btn-outline"
        onClick={() => setOpen(true)}
      >
        <span className="material-symbols-outlined" aria-hidden>
          child_care
        </span>
        Inscrire un enfant
      </button>

      {open ? (
        <div
          className="mp-modal-backdrop"
          role="presentation"
          onClick={() => !loading && !success && resetAndClose()}
        />
      ) : null}
      {open ? (
        <div
          className="mp-modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="register-child-title"
        >
          <h2 id="register-child-title" className="mp-modal-title">
            Inscrire un enfant dans votre foyer
          </h2>

          {success ? (
            <p className="mp-success" role="status">
              {success}
            </p>
          ) : (
            <>
              <p className="mp-hint mp-modal-lede">
                L'enfant est rattaché à votre foyer. Le club précisera ensuite
                la formule d'adhésion et la facturation.
              </p>

              <label className="mp-field">
                <span>Prénom</span>
                <input
                  type="text"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  disabled={loading}
                  autoComplete="off"
                />
              </label>
              <label className="mp-field">
                <span>Nom</span>
                <input
                  type="text"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  disabled={loading}
                  autoComplete="off"
                />
              </label>

              <fieldset className="mp-fieldset">
                <legend className="mp-legend">Civilité</legend>
                <label className="mp-radio mp-radio--inline">
                  <input
                    type="radio"
                    name="child-civility"
                    value="MR"
                    checked={civility === 'MR'}
                    onChange={() => setCivility('MR')}
                    disabled={loading}
                  />
                  <span>Monsieur</span>
                </label>
                <label className="mp-radio mp-radio--inline">
                  <input
                    type="radio"
                    name="child-civility"
                    value="MME"
                    checked={civility === 'MME'}
                    onChange={() => setCivility('MME')}
                    disabled={loading}
                  />
                  <span>Madame</span>
                </label>
              </fieldset>

              <label className="mp-field">
                <span>Date de naissance</span>
                <input
                  type="date"
                  value={birthDate}
                  onChange={(e) => setBirthDate(e.target.value)}
                  disabled={loading}
                />
              </label>

              {localError ? (
                <p className="mp-form-error" role="alert">
                  {localError}
                </p>
              ) : null}

              <div className="mp-modal-actions">
                <button
                  type="button"
                  className="mp-btn mp-btn-outline"
                  disabled={loading}
                  onClick={resetAndClose}
                >
                  Annuler
                </button>
                <button
                  type="button"
                  className="mp-btn mp-btn-primary"
                  disabled={loading}
                  onClick={() => void onSubmit()}
                >
                  {loading ? 'Inscription…' : 'Inscrire l\u2019enfant'}
                </button>
              </div>
            </>
          )}
        </div>
      ) : null}
    </>
  );
}
