import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery } from '@apollo/client/react';
import {
  VIEWER_ACTIVE_CART,
  VIEWER_MEMBERSHIP_CARTS,
  VIEWER_REGISTER_CHILD_FOR_CART,
} from '../../lib/cart-documents';
import { VIEWER_ELIGIBLE_MEMBERSHIP_FORMULAS } from '../../lib/viewer-documents';
import { useToast } from '../ToastProvider';
import { formatEuroCents } from '../../lib/format';

type Civility = 'MR' | 'MME';
type BillingRhythm = 'ANNUAL' | 'MONTHLY';

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
  const [billingRhythm, setBillingRhythm] = useState<BillingRhythm>('ANNUAL');
  const [localError, setLocalError] = useState<string | null>(null);

  const [registerChild, { loading }] =
    useMutation<RegisterChildPendingResponse>(VIEWER_REGISTER_CHILD_FOR_CART, {
      // Refetch immédiat pour que le badge panier dans le header se
      // mette à jour aussitôt que le pending item est créé.
      refetchQueries: [
        { query: VIEWER_ACTIVE_CART },
        { query: VIEWER_MEMBERSHIP_CARTS },
      ],
      awaitRefetchQueries: true,
    });

  // Charge les formules éligibles selon l'âge.
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
      birthDate,
      // Identité passée pour annoter `alreadyTakenInSeason` côté
      // backend — évite que l'utilisateur coche une formule déjà prise
      // par la même identité dans la saison active.
      identityFirstName: firstName.trim() || null,
      identityLastName: lastName.trim() || null,
    },
    skip: !birthDate || !firstName.trim() || !lastName.trim(),
    fetchPolicy: 'cache-and-network',
  });
  const formulas = formulasData?.viewerEligibleMembershipFormulas ?? [];
  const availableFormulas = formulas.filter((f) => !f.alreadyTakenInSeason);
  const allTaken = formulas.length > 0 && availableFormulas.length === 0;

  // Pré-sélection automatique : dès que les formules sont chargées et
  // qu'aucune n'est cochée, on coche la première DISPONIBLE (non déjà
  // prise). L'utilisateur peut en cocher d'autres à la suite.
  useEffect(() => {
    if (availableFormulas.length > 0 && selectedProductIds.length === 0) {
      setSelectedProductIds([availableFormulas[0].id]);
    }
  }, [availableFormulas, selectedProductIds.length]);

  // Si la seule formule sélectionnée n'a pas de tarif mensuel, on
  // force ANNUAL (sinon le payeur enverrait un rythme invalide).
  const selectedFormulas = useMemo(
    () => formulas.filter((f) => selectedProductIds.includes(f.id)),
    [formulas, selectedProductIds],
  );
  const monthlyAvailable = selectedFormulas.every(
    (f) => f.monthlyAmountCents > 0,
  );
  useEffect(() => {
    if (!monthlyAvailable && billingRhythm === 'MONTHLY') {
      setBillingRhythm('ANNUAL');
    }
  }, [monthlyAvailable, billingRhythm]);

  // Totaux affichés en regard du sélecteur de rythme.
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

  function reset(): void {
    setFirstName('');
    setLastName('');
    setCivility('MR');
    setBirthDate('');
    setSelectedProductIds([]);
    setBillingRhythm('ANNUAL');
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
            billingRhythm,
          },
        },
      });
      const res = data?.viewerRegisterChildMember;
      if (!res?.pendingItemId) {
        setLocalError('Impossible d’inscrire l’enfant.');
        return;
      }
      showToast(
        `${res.firstName} ${res.lastName} ajouté au panier (${selectedProductIds.length} formule${selectedProductIds.length > 1 ? 's' : ''}, ${billingRhythm === 'ANNUAL' ? 'annuel' : 'mensuel'}).`,
        'success',
      );
      reset();
      onClose();
    } catch (err: unknown) {
      setLocalError(
        err instanceof Error ? err.message : 'Impossible d’inscrire l’enfant.',
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
          Ajouter un enfant au panier
        </h2>
        <p className="mp-hint mp-modal-lede">
          Vous pouvez sélectionner plusieurs formules (ex Karaté + Cross
          Training). La fiche adhérent sera créée à la validation du
          panier — pas avant.
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

        {birthDate && firstName.trim() && lastName.trim() ? (
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
              <p className="mp-hint mp-hint--warn">
                Aucune formule disponible pour cet âge — contactez le club.
              </p>
            ) : allTaken ? (
              <p className="mp-hint mp-hint--warn">
                Toutes les formules d&rsquo;adhésion compatibles ont déjà
                été prises pour cette saison par {firstName} {lastName}.
                Plus aucune adhésion supplémentaire n&rsquo;est possible.
              </p>
            ) : (
              formulas.map((f) => {
                const checked = selectedProductIds.includes(f.id);
                const taken = f.alreadyTakenInSeason;
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
        ) : null}

        {selectedFormulas.length > 0 ? (
          <fieldset className="mp-fieldset">
            <legend className="mp-legend">Rythme de règlement</legend>
            <label className="mp-radio mp-radio--inline">
              <input
                type="radio"
                name="add-child-billing"
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
                name="add-child-billing"
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
            {loading ? 'Ajout…' : 'Ajouter au panier'}
          </button>
        </div>
      </div>
    </>
  );
}
