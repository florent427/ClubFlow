import { useMutation } from '@apollo/client/react';
import { useState } from 'react';
import { VIEWER_PROMOTE_SELF_TO_MEMBER } from '../lib/viewer-documents';
import type { ViewerPromoteSelfToMemberData } from '../lib/viewer-types';

type Civility = 'MR' | 'MME';

/**
 * CTA « M'inscrire comme membre » — ouvre une modale qui laisse le contact
 * compléter civilité + date de naissance, puis déclenche la promotion
 * en fiche adhérent. La formule d'adhésion et la facturation restent gérées
 * par l'admin dans un second temps.
 */
export function PromoteSelfToMemberCta() {
  const [open, setOpen] = useState(false);
  const [civility, setCivility] = useState<Civility>('MR');
  const [birthDate, setBirthDate] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const [promote, { loading }] = useMutation<ViewerPromoteSelfToMemberData>(
    VIEWER_PROMOTE_SELF_TO_MEMBER,
  );

  function resetAndClose() {
    setOpen(false);
    setLocalError(null);
    setSuccess(false);
    setBirthDate('');
    setCivility('MR');
  }

  async function onSubmit() {
    setLocalError(null);
    try {
      const { data } = await promote({
        variables: {
          input: {
            civility,
            birthDate: birthDate || null,
          },
        },
      });
      if (!data?.viewerPromoteSelfToMember?.memberId) {
        setLocalError('Impossible de créer votre fiche adhérent.');
        return;
      }
      setSuccess(true);
      setTimeout(() => {
        window.location.reload();
      }, 1500);
    } catch (err: unknown) {
      setLocalError(
        err instanceof Error
          ? err.message
          : 'Impossible de créer votre fiche adhérent.',
      );
    }
  }

  return (
    <>
      <button
        type="button"
        className="mp-btn mp-btn-primary"
        onClick={() => setOpen(true)}
      >
        <span className="material-symbols-outlined" aria-hidden>
          person_check
        </span>
        M'inscrire comme membre
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
          aria-labelledby="promote-self-title"
        >
          <h2 id="promote-self-title" className="mp-modal-title">
            M'inscrire comme membre du club
          </h2>

          {success ? (
            <p className="mp-success" role="status">
              Fiche adhérent créée. Redirection…
            </p>
          ) : (
            <>
              <p className="mp-hint mp-modal-lede">
                Complétez ces informations pour créer votre fiche adhérent.
                Le club reviendra vers vous pour la formule d'adhésion et la
                facturation.
              </p>

              <fieldset className="mp-fieldset">
                <legend className="mp-legend">Civilité</legend>
                <label className="mp-radio mp-radio--inline">
                  <input
                    type="radio"
                    name="promote-civility"
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
                    name="promote-civility"
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
                  {loading ? 'Inscription…' : 'Créer ma fiche adhérent'}
                </button>
              </div>
            </>
          )}
        </div>
      ) : null}
    </>
  );
}
