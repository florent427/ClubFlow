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

/**
 * Recommandation UX #8 — Reformulation du texte de rattachement familial
 * Vocabulaire orienté bénéfice utilisateur plutôt que modèle de données.
 *
 * Recommandation UX #9 — Schéma visuel pour les foyers partagés
 * Ajout d'une illustration iconographique du partage familial.
 */
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
      setLocalError('Saisissez l\u2019e-mail du responsable facturation.');
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
        aria-label="Rattachement à un espace familial"
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
              ? 'Rejoindre votre espace familial'
              : 'Rattacher ma fiche à un espace familial existant'}
          </h2>
          <p className="mp-join-family-banner__lede">
            Vous partagez les <strong>mêmes factures</strong> et voyez les{' '}
            <strong>mêmes enfants</strong> sur le portail. Chaque parent garde
            son <strong>espace personnel privé</strong>.
          </p>

          {/* Recommandation #9 — Schéma visuel */}
          {!compact ? (
            <div className="mp-family-visual" aria-hidden>
              <div className="mp-family-visual__house">
                <span className="material-symbols-outlined">home</span>
                <span className="mp-family-visual__label">Votre espace</span>
              </div>
              <div className="mp-family-visual__link">
                <span className="material-symbols-outlined">receipt_long</span>
                <span className="mp-family-visual__label">Factures partagées</span>
              </div>
              <div className="mp-family-visual__house">
                <span className="material-symbols-outlined">home</span>
                <span className="mp-family-visual__label">Autre parent</span>
              </div>
            </div>
          ) : null}
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
          Rejoindre un espace familial
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
            E-mail du responsable facturation
          </h2>
          <p className="mp-hint mp-modal-lede">
            Saisissez l'adresse e-mail <strong>exacte</strong> du parent
            responsable de la facturation, telle qu'enregistrée au club.
            En cas de doute, contactez le secrétariat.
          </p>
          <form className="mp-modal-form" onSubmit={(e) => void onSubmit(e)}>
            <label className="mp-field">
              <span>E-mail du responsable</span>
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
