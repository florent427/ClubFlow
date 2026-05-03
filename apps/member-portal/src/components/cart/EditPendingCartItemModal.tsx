import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery } from '@apollo/client/react';
import {
  VIEWER_ACTIVE_CART,
  VIEWER_MEMBERSHIP_CARTS,
  VIEWER_UPDATE_CART_PENDING_ITEM,
  type CartPendingItem,
} from '../../lib/cart-documents';
import { VIEWER_ELIGIBLE_MEMBERSHIP_FORMULAS } from '../../lib/viewer-documents';
import { formatEuroCents } from '../../lib/format';
import { useToast } from '../ToastProvider';

type BillingRhythm = 'ANNUAL' | 'MONTHLY';

interface Props {
  /** Le pending item dont on veut modifier les formules / le rythme. */
  pending: CartPendingItem;
  onClose: () => void;
}

export function EditPendingCartItemModal({ pending, onClose }: Props) {
  const { showToast } = useToast();
  const [selectedProductIds, setSelectedProductIds] = useState<string[]>(
    pending.membershipProductIds,
  );
  const [billingRhythm, setBillingRhythm] = useState<BillingRhythm>(
    pending.billingRhythm,
  );
  const [localError, setLocalError] = useState<string | null>(null);

  // Charge les formules éligibles selon la date de naissance du
  // pending + l'identité (firstName + lastName) pour annoter
  // `alreadyTakenInSeason`. On exclut le pending courant via
  // `excludePendingItemId` pour ne pas se "voler" ses propres formules.
  const { data: formulasData, loading: formulasLoading } = useQuery<{
    viewerEligibleMembershipFormulas: Array<{
      id: string;
      label: string;
      annualAmountCents: number;
      monthlyAmountCents: number;
      alreadyTakenInSeason: boolean;
    }>;
  }>(VIEWER_ELIGIBLE_MEMBERSHIP_FORMULAS, {
    variables: {
      birthDate: pending.birthDate,
      identityFirstName: pending.firstName,
      identityLastName: pending.lastName,
      excludePendingItemId: pending.id,
    },
    fetchPolicy: 'cache-and-network',
  });
  const formulas = formulasData?.viewerEligibleMembershipFormulas ?? [];
  const availableFormulas = formulas.filter(
    (f) => !f.alreadyTakenInSeason || pending.membershipProductIds.includes(f.id),
  );
  const allTaken = formulas.length > 0 && availableFormulas.length === 0;

  const [updatePending, { loading }] = useMutation(
    VIEWER_UPDATE_CART_PENDING_ITEM,
    {
      refetchQueries: [
        { query: VIEWER_ACTIVE_CART },
        { query: VIEWER_MEMBERSHIP_CARTS },
      ],
      awaitRefetchQueries: true,
    },
  );

  // Sécurité : si l'utilisateur a coché une formule sans tarif mensuel
  // mais que le rythme courant est MONTHLY, on retombe en ANNUAL.
  const selectedFormulas = useMemo(
    () => formulas.filter((f) => selectedProductIds.includes(f.id)),
    [formulas, selectedProductIds],
  );
  const monthlyAvailable =
    selectedFormulas.length > 0 &&
    selectedFormulas.every((f) => f.monthlyAmountCents > 0);
  useEffect(() => {
    if (!monthlyAvailable && billingRhythm === 'MONTHLY') {
      setBillingRhythm('ANNUAL');
    }
  }, [monthlyAvailable, billingRhythm]);

  const totalAnnualCents = selectedFormulas.reduce(
    (s, f) => s + f.annualAmountCents,
    0,
  );
  const totalMonthlyCents = selectedFormulas.reduce(
    (s, f) => s + f.monthlyAmountCents,
    0,
  );

  function toggleProduct(productId: string) {
    setSelectedProductIds((prev) =>
      prev.includes(productId)
        ? prev.filter((id) => id !== productId)
        : [...prev, productId],
    );
  }

  async function handleSubmit(): Promise<void> {
    setLocalError(null);
    if (selectedProductIds.length === 0) {
      setLocalError('Sélectionnez au moins une formule d’adhésion.');
      return;
    }
    try {
      await updatePending({
        variables: {
          input: {
            pendingItemId: pending.id,
            membershipProductIds: selectedProductIds,
            billingRhythm,
          },
        },
      });
      showToast(
        `Inscription mise à jour (${selectedProductIds.length} formule${selectedProductIds.length > 1 ? 's' : ''}, ${billingRhythm === 'ANNUAL' ? 'annuel' : 'mensuel'}).`,
        'success',
      );
      onClose();
    } catch (e) {
      setLocalError(
        e instanceof Error ? e.message : 'Mise à jour impossible.',
      );
    }
  }

  const fullName = `${pending.firstName} ${pending.lastName}`;

  return (
    <>
      <div
        className="mp-modal-backdrop"
        role="presentation"
        onClick={loading ? undefined : onClose}
      />
      <div
        className="mp-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="edit-pending-title"
      >
        <h2 id="edit-pending-title" className="mp-modal-title">
          Modifier l’inscription de {fullName}
        </h2>
        <p className="mp-hint mp-modal-lede">
          Ajustez les formules choisies et le rythme de règlement.
          L’identité (prénom, nom, date de naissance, civilité) ne peut pas
          être modifiée — pour la corriger, retirez l’inscription et
          ajoutez-la à nouveau.
        </p>

        <fieldset className="mp-fieldset">
          <legend className="mp-legend">
            Formules d’adhésion
            {selectedProductIds.length > 0
              ? ` (${selectedProductIds.length} sélectionnée${selectedProductIds.length > 1 ? 's' : ''})`
              : ''}
          </legend>
          {formulasLoading ? (
            <p className="mp-hint">Chargement…</p>
          ) : formulas.length === 0 ? (
            <p className="mp-hint mp-hint--warn">
              Aucune formule disponible pour cette date de naissance —
              contactez le club.
            </p>
          ) : allTaken ? (
            <p className="mp-hint mp-hint--warn">
              Toutes les autres formules compatibles ont déjà été prises
              cette saison. Vous pouvez seulement conserver les formules
              déjà sélectionnées sur cette inscription.
            </p>
          ) : (
            formulas.map((f) => {
              const checked = selectedProductIds.includes(f.id);
              // On ne grise PAS les formules déjà cochées sur ce
              // pending — sinon impossible de les conserver lors de
              // l'édition. On grise uniquement celles prises ailleurs.
              const taken =
                f.alreadyTakenInSeason &&
                !pending.membershipProductIds.includes(f.id);
              return (
                <label
                  key={f.id}
                  className="mp-checkbox"
                  title={
                    taken
                      ? 'Formule déjà prise cette saison pour cette identité.'
                      : undefined
                  }
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 8,
                    padding: '8px 12px',
                    marginBottom: 6,
                    border: taken
                      ? '1px dashed #cbd5e1'
                      : checked
                        ? '2px solid #2563eb'
                        : '1px solid #e5e7eb',
                    borderRadius: 6,
                    cursor: taken ? 'not-allowed' : 'pointer',
                    background: taken
                      ? '#f8fafc'
                      : checked
                        ? 'rgba(37, 99, 235, 0.05)'
                        : 'white',
                    opacity: taken ? 0.6 : 1,
                  }}
                >
                  <input
                    type="checkbox"
                    checked={checked && !taken}
                    onChange={() => {
                      if (!taken) toggleProduct(f.id);
                    }}
                    disabled={loading || taken}
                    style={{ marginTop: 3 }}
                  />
                  <span style={{ flex: 1 }}>
                    <strong>{f.label}</strong>
                    {taken ? (
                      <span
                        style={{
                          marginLeft: 8,
                          padding: '2px 8px',
                          background: '#e2e8f0',
                          color: '#475569',
                          borderRadius: 12,
                          fontSize: '0.7rem',
                          fontWeight: 600,
                        }}
                      >
                        déjà prise
                      </span>
                    ) : null}
                    <br />
                    <small className="mp-hint">
                      {formatEuroCents(f.annualAmountCents)} / an
                      {f.monthlyAmountCents > 0
                        ? ` ou ${formatEuroCents(f.monthlyAmountCents)} / mois`
                        : ''}
                    </small>
                  </span>
                </label>
              );
            })
          )}
        </fieldset>

        {selectedFormulas.length > 0 ? (
          <fieldset className="mp-fieldset">
            <legend className="mp-legend">Rythme de règlement</legend>
            <label className="mp-radio mp-radio--inline">
              <input
                type="radio"
                name="edit-pending-billing"
                value="ANNUAL"
                checked={billingRhythm === 'ANNUAL'}
                onChange={() => setBillingRhythm('ANNUAL')}
                disabled={loading}
              />
              <span>Annuel ({formatEuroCents(totalAnnualCents)})</span>
            </label>
            <label
              className="mp-radio mp-radio--inline"
              style={{ opacity: monthlyAvailable ? 1 : 0.5 }}
              title={
                monthlyAvailable
                  ? undefined
                  : 'Une des formules sélectionnées n’est pas disponible en mensuel.'
              }
            >
              <input
                type="radio"
                name="edit-pending-billing"
                value="MONTHLY"
                checked={billingRhythm === 'MONTHLY'}
                onChange={() => setBillingRhythm('MONTHLY')}
                disabled={loading || !monthlyAvailable}
              />
              <span>
                Mensuel ({formatEuroCents(totalMonthlyCents)} / mois)
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
            onClick={onClose}
          >
            Annuler
          </button>
          <button
            type="button"
            className="mp-btn mp-btn-primary"
            disabled={loading}
            onClick={() => void handleSubmit()}
          >
            {loading ? 'Enregistrement…' : 'Enregistrer'}
          </button>
        </div>
      </div>
    </>
  );
}
