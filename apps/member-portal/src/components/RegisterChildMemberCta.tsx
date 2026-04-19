import { useLazyQuery, useMutation } from '@apollo/client/react';
import { useEffect, useState } from 'react';
import {
  VIEWER_ELIGIBLE_MEMBERSHIP_FORMULAS,
  VIEWER_REGISTER_CHILD_MEMBER,
} from '../lib/viewer-documents';
import type {
  SubscriptionBillingRhythm,
  ViewerEligibleMembershipFormulasData,
  ViewerRegisterChildMemberData,
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
 * CTA « Inscrire un enfant » — disponible pour un payeur de foyer
 * (contact ou membre). Ouvre une modale qui crée une fiche adhérent
 * mineure rattachée au foyer du viewer et, si une formule est choisie,
 * génère une facture DRAFT pour validation admin.
 */
export function RegisterChildMemberCta() {
  const [open, setOpen] = useState(false);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [civility, setCivility] = useState<Civility>('MR');
  const [birthDate, setBirthDate] = useState('');
  const [membershipProductId, setMembershipProductId] = useState('');
  const [billingRhythm, setBillingRhythm] =
    useState<SubscriptionBillingRhythm>('ANNUAL');
  const [localError, setLocalError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [registerChild, { loading }] = useMutation<ViewerRegisterChildMemberData>(
    VIEWER_REGISTER_CHILD_MEMBER,
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
    setSuccess(null);
    setFirstName('');
    setLastName('');
    setBirthDate('');
    setCivility('MR');
    setMembershipProductId('');
    setBillingRhythm('ANNUAL');
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
            membershipProductId: membershipProductId || null,
            billingRhythm: membershipProductId ? billingRhythm : null,
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
                L'enfant est rattaché à votre foyer. Vous pouvez choisir une
                formule d'adhésion : une facture brouillon sera générée et
                validée par le club.
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
                      : 'Renseignez d\u2019abord la date de naissance'}
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
                      name="child-billing"
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
                      name="child-billing"
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
