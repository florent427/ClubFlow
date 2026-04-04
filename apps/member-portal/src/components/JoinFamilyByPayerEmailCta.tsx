import { useMutation, useQuery } from '@apollo/client/react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  VIEWER_FAMILY_BILLING,
  VIEWER_JOIN_FAMILY_BY_PAYER_EMAIL,
  VIEWER_ME,
} from '../lib/viewer-documents';
import type { ViewerJoinFamilyByPayerEmailData, ViewerMeData } from '../lib/viewer-types';

type Props = {
  variant?: 'dashboard' | 'compact';
};

export function JoinFamilyByPayerEmailCta({ variant = 'dashboard' }: Props) {
  const navigate = useNavigate();
  const { data: meData } = useQuery<ViewerMeData>(VIEWER_ME, {
    fetchPolicy: 'cache-first',
  });
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);

  const eligible =
    meData?.viewerMe?.canSelfAttachFamilyViaPayerEmail === true;

  const [joinFamily, { loading }] = useMutation<ViewerJoinFamilyByPayerEmailData>(
    VIEWER_JOIN_FAMILY_BY_PAYER_EMAIL,
    {
      refetchQueries: [{ query: VIEWER_ME }, { query: VIEWER_FAMILY_BILLING }],
    },
  );

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLocalError(null);
    const trimmed = email.trim();
    if (!trimmed) {
      setLocalError('Saisissez l’e-mail du payeur.');
      return;
    }
    try {
      const { data } = await joinFamily({
        variables: { input: { payerEmail: trimmed } },
      });
      const res = data?.viewerJoinFamilyByPayerEmail;
      if (!res?.success) {
        setLocalError(res?.message ?? 'Échec du rattachement.');
        return;
      }
      setOpen(false);
      setEmail('');
      void navigate('/famille');
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : 'Échec du rattachement.';
      setLocalError(msg);
    }
  }

  if (!eligible) {
    return null;
  }

  const compact = variant === 'compact';

  return (
    <>
      <section
        className={compact ? 'mp-join-family-compact' : 'mp-join-family-banner'}
        aria-label="Rattachement à un foyer"
      >
        <div className="mp-join-family-banner__text">
          <h2 className="mp-join-family-banner__title">
            <span
              className="material-symbols-outlined mp-join-family-banner__ico"
              aria-hidden
            >
              link
            </span>
            {compact
              ? 'Rejoindre votre foyer'
              : 'Rattacher ma fiche à un foyer existant'}
          </h2>
          <p className="mp-join-family-banner__lede">
            Saisissez l’<strong>e-mail du payeur</strong> tel qu’enregistré au
            club. Le club crée une <strong>nouvelle résidence</strong> pour votre
            fiche (vous n’êtes pas ajouté au foyer du payeur côté administration).
            Vous partagez la <strong>facturation du groupe</strong> et les{' '}
            <strong>enfants</strong> sur le portail, sans accès à la fiche de
            l’autre parent.
          </p>
        </div>
        <button
          type="button"
          className={
            compact
              ? 'mp-btn mp-btn-primary mp-btn-compact-join'
              : 'mp-btn mp-btn-primary mp-join-family-banner__btn'
          }
          onClick={() => {
            setLocalError(null);
            setOpen(true);
          }}
        >
          Rejoindre un foyer
        </button>
      </section>

      {open ? (
        <div
          className="mp-modal-backdrop"
          role="presentation"
          onClick={() => !loading && setOpen(false)}
        />
      ) : null}
      {open ? (
        <div
          className="mp-modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="join-family-title"
        >
          <h2 id="join-family-title" className="mp-modal-title">
            E-mail du payeur du foyer
          </h2>
          <p className="mp-hint mp-modal-lede">
            L’adresse doit être <strong>exactement</strong> celle du membre
            désigné comme payeur (ou du seul membre du foyer). En cas de doute,
            contactez le secrétariat.
          </p>
          <form className="mp-modal-form" onSubmit={(e) => void onSubmit(e)}>
            <label className="mp-field">
              <span>E-mail du payeur</span>
              <input
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="ex. parent@domaine.fr"
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
                onClick={() => setOpen(false)}
              >
                Annuler
              </button>
              <button type="submit" className="mp-btn mp-btn-primary" disabled={loading}>
                {loading ? 'Rattachement…' : 'Valider le rattachement'}
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </>
  );
}
