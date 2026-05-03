import { useLazyQuery, useMutation } from '@apollo/client/react';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  VIEWER_ELIGIBLE_MEMBERSHIP_FORMULAS,
  VIEWER_REGISTER_CHILD_MEMBER,
} from '../lib/viewer-documents';
import {
  VIEWER_ACTIVE_CART,
  VIEWER_MEMBERSHIP_CARTS,
} from '../lib/cart-documents';
import type {
  SubscriptionBillingRhythm,
  ViewerEligibleMembershipFormulasData,
  ViewerRegisterChildMemberData,
} from '../lib/viewer-types';
import { useToast } from './ToastProvider';

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
 * (contact ou membre). Ouvre une modale qui crée une **inscription en
 * attente** dans le panier d'adhésion (le Member réel sera créé à la
 * validation du panier + choix du paiement). À la confirmation, on
 * redirige vers `/adhesion` pour que l'utilisateur voie son panier.
 */
export function RegisterChildMemberCta() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [open, setOpen] = useState(false);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [civility, setCivility] = useState<Civility>('MR');
  const [birthDate, setBirthDate] = useState('');
  const [membershipProductId, setMembershipProductId] = useState('');
  const [billingRhythm, setBillingRhythm] =
    useState<SubscriptionBillingRhythm>('ANNUAL');
  const [localError, setLocalError] = useState<string | null>(null);

  const [registerChild, { loading }] = useMutation<ViewerRegisterChildMemberData>(
    VIEWER_REGISTER_CHILD_MEMBER,
    {
      // On rafraîchit le panier actif pour que le badge du header se
      // mette à jour immédiatement après l'inscription.
      refetchQueries: [
        { query: VIEWER_ACTIVE_CART },
        { query: VIEWER_MEMBERSHIP_CARTS },
      ],
      awaitRefetchQueries: true,
    },
  );
  const [fetchFormulas, { data: formulasData, loading: formulasLoading }] =
    useLazyQuery<ViewerEligibleMembershipFormulasData>(
      VIEWER_ELIGIBLE_MEMBERSHIP_FORMULAS,
    );

  useEffect(() => {
    // On ne fetch que si on a l'identité complète : sinon le backend ne
    // peut pas annoter `alreadyTakenInSeason` correctement.
    if (open && birthDate && firstName.trim() && lastName.trim()) {
      void fetchFormulas({
        variables: {
          birthDate,
          identityFirstName: firstName.trim(),
          identityLastName: lastName.trim(),
        },
      });
    }
  }, [open, birthDate, firstName, lastName, fetchFormulas]);

  const formulas = formulasData?.viewerEligibleMembershipFormulas ?? [];
  const availableFormulas = formulas.filter((f) => !f.alreadyTakenInSeason);
  const allTaken = formulas.length > 0 && availableFormulas.length === 0;
  const selectedFormula = formulas.find((f) => f.id === membershipProductId);

  // Pré-sélection automatique : dès que les formules sont chargées et
  // qu'aucune n'est sélectionnée, on sélectionne la première DISPONIBLE
  // (non déjà prise). L'utilisateur reste libre de choisir une autre
  // formule dans le menu déroulant.
  useEffect(() => {
    if (availableFormulas.length > 0 && !membershipProductId) {
      setMembershipProductId(availableFormulas[0].id);
    }
  }, [availableFormulas, membershipProductId]);

  function resetAndClose() {
    setOpen(false);
    setLocalError(null);
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
    if (!membershipProductId) {
      setLocalError('Sélectionnez une formule d’adhésion.');
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
            membershipProductIds: [membershipProductId],
            billingRhythm,
          },
        },
      });
      const res = data?.viewerRegisterChildMember;
      if (!res?.pendingItemId) {
        setLocalError('Impossible d’inscrire l’enfant.');
        return;
      }
      // Pas de popup intermédiaire : on ferme la modale, on toast et on
      // redirige immédiatement vers le panier d'adhésion. L'utilisateur
      // peut y ajouter d'autres enfants, valider ou modifier.
      resetAndClose();
      showToast(
        `${res.firstName} ${res.lastName} ajouté au panier d’adhésion.`,
        'success',
      );
      void navigate('/adhesion');
    } catch (err: unknown) {
      setLocalError(
        err instanceof Error ? err.message : 'Impossible d’inscrire l’enfant.',
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
          onClick={() => !loading && resetAndClose()}
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

          <p className="mp-hint mp-modal-lede">
            L’enfant sera ajouté à votre panier d’adhésion. Vous validerez et
            choisirez votre mode de règlement (carte, chèque, espèces ou
            virement) à l’étape suivante.
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
            <span>Formule d’adhésion</span>
            {!birthDate || !firstName.trim() || !lastName.trim() ? (
              <p className="mp-hint" style={{ fontSize: '0.85rem' }}>
                Renseignez prénom, nom et date de naissance pour voir
                les formules disponibles.
              </p>
            ) : formulasLoading ? (
              <p className="mp-hint" style={{ fontSize: '0.85rem' }}>
                Chargement des formules…
              </p>
            ) : formulas.length === 0 ? (
              <p
                className="mp-hint mp-hint--warn"
                style={{ fontSize: '0.85rem' }}
              >
                Aucune formule disponible pour cette date de naissance.
                Contactez le club.
              </p>
            ) : allTaken ? (
              <p
                className="mp-hint mp-hint--warn"
                style={{ fontSize: '0.85rem' }}
              >
                Toutes les formules compatibles ont déjà été prises pour
                cette saison par {firstName} {lastName}. Plus aucune
                adhésion supplémentaire n’est possible pour cet enfant.
              </p>
            ) : (
              <select
                value={membershipProductId}
                onChange={(e) => setMembershipProductId(e.target.value)}
                disabled={loading}
              >
                {formulas.map((f) => (
                  <option
                    key={f.id}
                    value={f.id}
                    disabled={f.alreadyTakenInSeason}
                  >
                    {f.label} — {formatEuros(f.annualAmountCents)} / an
                    {f.monthlyAmountCents > 0
                      ? ` ou ${formatEuros(f.monthlyAmountCents)} / mois`
                      : ''}
                    {f.alreadyTakenInSeason ? ' (déjà prise)' : ''}
                  </option>
                ))}
              </select>
            )}
          </label>

          {selectedFormula ? (
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
              {selectedFormula.monthlyAmountCents > 0 ? (
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
                    Mensuel (
                    {formatEuros(selectedFormula.monthlyAmountCents)}/mois)
                  </span>
                </label>
              ) : null}
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
              {loading ? 'Inscription…' : 'Inscrire l’enfant'}
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}
