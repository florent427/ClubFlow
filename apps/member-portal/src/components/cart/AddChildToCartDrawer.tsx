import { useMutation, useQuery } from '@apollo/client/react';
import { useState } from 'react';
import {
  VIEWER_ACTIVE_CART,
  VIEWER_REGISTER_CHILD_FOR_CART,
} from '../../lib/cart-documents';
import { VIEWER_ELIGIBLE_MEMBERSHIP_FORMULAS } from '../../lib/viewer-documents';
import { useToast } from '../ToastProvider';
import { formatEuroCents } from '../../lib/format';

type Civility = 'MR' | 'MME';

interface Props {
  open: boolean;
  onClose: () => void;
}

interface RegisterChildPendingResponse {
  viewerRegisterChildMember: {
    pendingItemId: string;
    cartId: string;
    firstName: string;
    lastName: string;
  };
}

export function AddChildToCartDrawer({ open, onClose }: Props) {
  const { showToast } = useToast();
  const [firstName, setFirstName] = useState<string>('');
  const [lastName, setLastName] = useState<string>('');
  const [civility, setCivility] = useState<Civility>('MR');
  const [birthDate, setBirthDate] = useState<string>('');
  const [selectedProductIds, setSelectedProductIds] = useState<string[]>([]);
  const [localError, setLocalError] = useState<string | null>(null);

  const [registerChild, { loading }] =
    useMutation<RegisterChildPendingResponse>(VIEWER_REGISTER_CHILD_FOR_CART, {
      refetchQueries: [{ query: VIEWER_ACTIVE_CART }],
    });

  // Charge les formules éligibles selon l'âge.
  const { data: formulasData, loading: formulasLoading } = useQuery<{
    viewerEligibleMembershipFormulas: Array<{
      id: string;
      label: string;
      annualAmountCents: number;
      monthlyAmountCents: number;
    }>;
  }>(VIEWER_ELIGIBLE_MEMBERSHIP_FORMULAS, {
    variables: { birthDate },
    skip: !birthDate,
    fetchPolicy: 'cache-and-network',
  });
  const formulas = formulasData?.viewerEligibleMembershipFormulas ?? [];

  function toggleProduct(productId: string) {
    setSelectedProductIds((prev) =>
      prev.includes(productId)
        ? prev.filter((id) => id !== productId)
        : [...prev, productId],
    );
  }

  function reset(): void {
    setFirstName('');
    setLastName('');
    setCivility('MR');
    setBirthDate('');
    setSelectedProductIds([]);
    setLocalError(null);
  }

  function handleClose(): void {
    if (loading) return;
    reset();
    onClose();
  }

  async function handleSubmit(): Promise<void> {
    setLocalError(null);
    if (!firstName.trim() || !lastName.trim() || !birthDate) {
      setLocalError('Prénom, nom et date de naissance sont obligatoires.');
      return;
    }
    if (selectedProductIds.length === 0) {
      setLocalError('Sélectionnez au moins une formule d’adhésion.');
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
            membershipProductIds: selectedProductIds,
            billingRhythm: null,
          },
        },
      });
      const res = data?.viewerRegisterChildMember;
      if (!res?.pendingItemId) {
        setLocalError('Impossible d’inscrire l’enfant.');
        return;
      }
      showToast(
        `${res.firstName} ${res.lastName} ajouté au projet (${selectedProductIds.length} formule${selectedProductIds.length > 1 ? 's' : ''}). Sa fiche adhérent sera créée à la validation du projet.`,
        'success',
      );
      reset();
      onClose();
    } catch (err: unknown) {
      setLocalError(
        err instanceof Error
          ? err.message
          : 'Impossible d’inscrire l’enfant.',
      );
    }
  }

  if (!open) return null;

  return (
    <>
      <div
        className="mp-modal-backdrop"
        role="presentation"
        onClick={handleClose}
      />
      <div
        className="mp-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-child-title"
      >
        <h2 id="add-child-title" className="mp-modal-title">
          Ajouter un enfant au projet
        </h2>
        <p className="mp-hint mp-modal-lede">
          Vous pouvez sélectionner plusieurs formules (ex Karaté +
          Cross Training). La fiche adhérent sera créée à la validation
          du projet — pas avant.
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
              name="add-child-civility"
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
              name="add-child-civility"
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

        {birthDate ? (
          <fieldset className="mp-fieldset">
            <legend className="mp-legend">
              Formules d&rsquo;adhésion
              {selectedProductIds.length > 0
                ? ` (${selectedProductIds.length} sélectionnée${selectedProductIds.length > 1 ? 's' : ''})`
                : ''}
            </legend>
            {formulasLoading ? (
              <p className="mp-hint">Chargement…</p>
            ) : formulas.length === 0 ? (
              <p className="mp-hint">
                Aucune formule disponible pour cet âge — contacte le club.
              </p>
            ) : (
              formulas.map((f) => {
                const checked = selectedProductIds.includes(f.id);
                return (
                  <label
                    key={f.id}
                    className="mp-checkbox"
                    style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: 8,
                      padding: '8px 12px',
                      marginBottom: 6,
                      border: checked
                        ? '2px solid #2563eb'
                        : '1px solid #e5e7eb',
                      borderRadius: 6,
                      cursor: 'pointer',
                      background: checked ? 'rgba(37, 99, 235, 0.05)' : 'white',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleProduct(f.id)}
                      disabled={loading}
                      style={{ marginTop: 3 }}
                    />
                    <span style={{ flex: 1 }}>
                      <strong>{f.label}</strong>
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
            onClick={handleClose}
          >
            Annuler
          </button>
          <button
            type="button"
            className="mp-btn mp-btn-primary"
            disabled={loading}
            onClick={() => void handleSubmit()}
          >
            {loading ? 'Ajout…' : 'Ajouter au projet'}
          </button>
        </div>
      </div>
    </>
  );
}
