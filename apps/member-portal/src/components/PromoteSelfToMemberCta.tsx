import { useLazyQuery, useMutation } from '@apollo/client/react';
import { useEffect, useState } from 'react';
import {
  VIEWER_ELIGIBLE_MEMBERSHIP_FORMULAS,
  VIEWER_PROMOTE_SELF_TO_MEMBER,
} from '../lib/viewer-documents';
import type {
  SubscriptionBillingRhythm,
  ViewerEligibleMembershipFormulasData,
  ViewerPromoteSelfToMemberData,
} from '../lib/viewer-types';

type Civility = 'MR' | 'MME';

function formatEuros(cents: number): string {
  return (cents / 100).toLocaleString('fr-FR', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 2,
  });
}

/**
 * CTA « M'inscrire comme membre » — ouvre une modale qui laisse le contact
 * compléter civilité + date de naissance et, optionnellement, choisir une
 * formule d'adhésion. Une facture DRAFT est générée pour validation admin.
 */
export function PromoteSelfToMemberCta() {
  const [open, setOpen] = useState(false);
  const [civility, setCivility] = useState<Civility>('MR');
  const [birthDate, setBirthDate] = useState('');
  const [membershipProductId, setMembershipProductId] = useState('');
  const [billingRhythm, setBillingRhythm] =
    useState<SubscriptionBillingRhythm>('ANNUAL');
  const [localError, setLocalError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const [promote, { loading }] = useMutation<ViewerPromoteSelfToMemberData>(
    VIEWER_PROMOTE_SELF_TO_MEMBER,
  );
  const [fetchFormulas, { data: formulasData, loading: formulasLoading }] =
    useLazyQuery<ViewerEligibleMembershipFormulasData>(
      VIEWER_ELIGIBLE_MEMBERSHIP_FORMULAS,
    );

  useEffect(() => {
    if (open && birthDate) {
      void fetchFormulas({ variables: { birthDate } });
    }
  }, [open, birthDate, fetchFormulas]);

  const formulas = formulasData?.viewerEligibleMembershipFormulas ?? [];
  const selectedFormula = formulas.find((f) => f.id === membershipProductId);

  function resetAndClose() {
    setOpen(false);
    setLocalError(null);
    setSuccess(false);
    setBirthDate('');
    setCivility('MR');
    setMembershipProductId('');
    setBillingRhythm('ANNUAL');
  }

  async function onSubmit() {
    setLocalError(null);
    if (membershipProductId && !birthDate) {
      setLocalError('La date de naissance est requise pour choisir une formule.');
      return;
    }
    try {
      const { data } = await promote({
        variables: {
          input: {
            civility,
            birthDate: birthDate || null,
            membershipProductId: membershipProductId || null,
            billingRhythm: membershipProductId ? billingRhythm : null,
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
                Vous pouvez également choisir une formule d'adhésion :
                une facture brouillon sera générée et validée par le club.
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

              <label className="mp-field">
                <span>Formule d'adhésion (optionnel)</span>
                <select
                  value={membershipProductId}
                  onChange={(e) => setMembershipProductId(e.target.value)}
                  disabled={loading || !birthDate || formulasLoading}
                >
                  <option value="">
                    {birthDate
                      ? formulasLoading
                        ? 'Chargement…'
                        : formulas.length === 0
                          ? 'Aucune formule disponible — le club décidera'
                          : 'Laisser le club décider'
                      : 'Renseignez d\u2019abord votre date de naissance'}
                  </option>
                  {formulas.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.label} — {formatEuros(f.annualAmountCents)} / an
                    </option>
                  ))}
                </select>
              </label>

              {selectedFormula && selectedFormula.monthlyAmountCents > 0 ? (
                <fieldset className="mp-fieldset">
                  <legend className="mp-legend">Rythme de règlement</legend>
                  <label className="mp-radio mp-radio--inline">
                    <input
                      type="radio"
                      name="promote-billing"
                      value="ANNUAL"
                      checked={billingRhythm === 'ANNUAL'}
                      onChange={() => setBillingRhythm('ANNUAL')}
                      disabled={loading}
                    />
                    <span>
                      Annuel ({formatEuros(selectedFormula.annualAmountCents)})
                    </span>
                  </label>
                  <label className="mp-radio mp-radio--inline">
                    <input
                      type="radio"
                      name="promote-billing"
                      value="MONTHLY"
                      checked={billingRhythm === 'MONTHLY'}
                      onChange={() => setBillingRhythm('MONTHLY')}
                      disabled={loading}
                    />
                    <span>
                      Mensuel ({formatEuros(selectedFormula.monthlyAmountCents)}/mois)
                    </span>
                  </label>
                </fieldset>
              ) : null}

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
