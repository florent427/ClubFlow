import { useMutation, useQuery } from '@apollo/client/react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  VIEWER_ACTIVE_CART,
  VIEWER_OPEN_CART,
  VIEWER_REGISTER_SELF_AS_MEMBER,
  type Cart,
  type ViewerActiveCartData,
} from '../lib/cart-documents';
import {
  VIEWER_ELIGIBLE_MEMBERSHIP_FORMULAS,
  VIEWER_ME,
} from '../lib/viewer-documents';
import type { ViewerMeData } from '../lib/viewer-types';
import { CartItemCard } from '../components/cart/CartItemCard';
import { CartSummary } from '../components/cart/CartSummary';
import { AddChildToCartDrawer } from '../components/cart/AddChildToCartDrawer';
import { useToast } from '../components/ToastProvider';
import { formatEuroCents } from '../lib/format';

type Civility = 'MR' | 'MME';

interface RegisterSelfResponse {
  viewerRegisterSelfAsMember: {
    pendingItemId: string;
    cartId: string;
    firstName: string;
    lastName: string;
  };
}

export function AdhesionPage() {
  const { showToast } = useToast();
  const navigate = useNavigate();
  const [selfOpen, setSelfOpen] = useState<boolean>(false);
  const [childOpen, setChildOpen] = useState<boolean>(false);

  const { data: meData } = useQuery<ViewerMeData>(VIEWER_ME, {
    fetchPolicy: 'cache-first',
  });
  const { data, loading, error, refetch } = useQuery<ViewerActiveCartData>(
    VIEWER_ACTIVE_CART,
    { fetchPolicy: 'cache-and-network' },
  );

  const [openCart, { loading: opening }] = useMutation(VIEWER_OPEN_CART, {
    refetchQueries: [{ query: VIEWER_ACTIVE_CART }],
    awaitRefetchQueries: true,
  });

  const isContactOnly = meData?.viewerMe?.isContactProfile === true;
  const canManageMembershipCart =
    meData?.viewerMe?.canManageMembershipCart === true;
  const cart: Cart | null = data?.viewerActiveMembershipCart ?? null;

  async function handleOpen(): Promise<void> {
    try {
      await openCart();
      showToast('Projet d\u2019adhÃ©sion ouvert.', 'success');
    } catch (err) {
      showToast(
        err instanceof Error
          ? err.message
          : 'Impossible d\u2019ouvrir un projet.',
        'error',
      );
    }
  }

  // Tant que `viewerMe` nâ€™est pas encore chargÃ©, on Ã©vite de flasher lâ€™Ã©cran
  // Â« accÃ¨s refusÃ© Â» : on montre un placeholder neutre.
  if (!meData) {
    return (
      <div className="mp-page">
        <p className="mp-hint">Chargementâ€¦</p>
      </div>
    );
  }

  if (!canManageMembershipCart) {
    return (
      <div className="mp-page">
        <header className="mp-page-head">
          <div>
            <p className="mp-eyebrow">Saison active</p>
            <h1 className="mp-page-title">Projet d&rsquo;adhÃ©sion</h1>
          </div>
        </header>
        <section className="mp-empty-state">
          <h2 className="mp-subtitle">AccÃ¨s rÃ©servÃ© au payeur du foyer</h2>
          <p className="mp-hint">
            Seul un adulte dÃ©signÃ© payeur du foyer peut ouvrir et gÃ©rer un
            projet d&rsquo;adhÃ©sion. Si vous Ãªtes un enfant ou un autre membre
            de la famille, demandez au payeur du foyer de s&rsquo;en charger â€”
            il pourra ensuite vous ajouter au projet.
          </p>
          <button
            type="button"
            className="mp-btn mp-btn-outline"
            onClick={() => void navigate('/')}
          >
            Retour au tableau de bord
          </button>
        </section>
      </div>
    );
  }

  return (
    <div className="mp-page">
      <header className="mp-page-head">
        <div>
          <p className="mp-eyebrow">Saison active</p>
          <h1 className="mp-page-title">Projet d&rsquo;adhÃ©sion</h1>
          <p className="mp-lead">
            PrÃ©parez tranquillement l&rsquo;inscription de votre foyer. Rien
            n&rsquo;est facturÃ© tant que vous n&rsquo;avez pas validÃ©.
          </p>
        </div>
      </header>

      {error ? (
        <p className="mp-form-error" role="alert">
          {error.message}
        </p>
      ) : null}

      {loading && !cart ? (
        <p className="mp-hint">Chargement du projetâ€¦</p>
      ) : !cart ? (
        <section className="mp-empty-state">
          <h2 className="mp-subtitle">Aucun projet en cours</h2>
          <p className="mp-hint">
            Ouvrez un projet d&rsquo;adhÃ©sion pour la saison active. Vous
            pourrez ajouter vos enfants et vous-mÃªme, ajuster les rythmes de
            rÃ¨glement et dÃ©clarer une licence fÃ©dÃ©rale existante.
          </p>
          <button
            type="button"
            className="mp-btn mp-btn-primary"
            disabled={opening}
            onClick={() => void handleOpen()}
          >
            {opening ? 'CrÃ©ationâ€¦' : 'CrÃ©er mon projet d\u2019adhÃ©sion'}
          </button>
        </section>
      ) : cart.status === 'VALIDATED' ? (
        <section className="mp-cart-validated">
          <div className="mp-cart-validated__head">
            <span className="material-symbols-outlined mp-cart-validated__ico">
              verified
            </span>
            <div>
              <h2 className="mp-subtitle">Projet validÃ©</h2>
              <p className="mp-hint">
                ValidÃ© le{' '}
                {cart.validatedAt
                  ? new Date(cart.validatedAt).toLocaleDateString('fr-FR', {
                      day: '2-digit',
                      month: 'long',
                      year: 'numeric',
                    })
                  : 'â€”'}{' '}
                Â· Total TTC : {formatEuroCents(cart.totalCents)}
              </p>
            </div>
          </div>

          <div className="mp-cart-validated__actions">
            {cart.invoiceId ? (
              <button
                type="button"
                className="mp-btn mp-btn-primary"
                onClick={() => void navigate('/factures')}
              >
                Voir la facture
              </button>
            ) : null}
            <button
              type="button"
              className="mp-btn mp-btn-outline"
              disabled={opening}
              onClick={() => void handleOpen()}
            >
              {opening
                ? 'CrÃ©ationâ€¦'
                : 'Ajouter un Ã©lÃ©ment en cours de saison'}
            </button>
          </div>
        </section>
      ) : cart.status === 'CANCELLED' ? (
        <section className="mp-cart-cancelled">
          <h2 className="mp-subtitle">Projet annulÃ©</h2>
          <p className="mp-hint">
            {cart.cancelledReason
              ? `Raison : ${cart.cancelledReason}`
              : 'Le club a annulÃ© ce projet.'}
          </p>
          <button
            type="button"
            className="mp-btn mp-btn-primary"
            disabled={opening}
            onClick={() => void handleOpen()}
          >
            {opening ? 'CrÃ©ationâ€¦' : 'Ouvrir un nouveau projet'}
          </button>
        </section>
      ) : (
        <div className="mp-cart-grid">
          <section className="mp-cart-items">
            <div className="mp-cart-toolbar">
              <h2 className="mp-subtitle">
                Membres ({cart.items.length})
                {cart.requiresManualAssignmentCount > 0 ? (
                  <span className="mp-badge mp-badge--warn">
                    {cart.requiresManualAssignmentCount} alerte(s)
                  </span>
                ) : null}
              </h2>
              <div className="mp-cart-toolbar__actions">
                {isContactOnly ? (
                  <button
                    type="button"
                    className="mp-btn mp-btn-outline mp-btn-compact"
                    onClick={() => setSelfOpen(true)}
                  >
                    <span
                      className="material-symbols-outlined"
                      aria-hidden="true"
                    >
                      person_add
                    </span>
                    M&rsquo;inscrire aussi
                  </button>
                ) : null}
                <button
                  type="button"
                  className="mp-btn mp-btn-primary mp-btn-compact"
                  onClick={() => setChildOpen(true)}
                >
                  <span
                    className="material-symbols-outlined"
                    aria-hidden="true"
                  >
                    child_care
                  </span>
                  Ajouter un enfant
                </button>
              </div>
            </div>

            {cart.items.length === 0 ? (
              <p className="mp-hint">
                Aucun membre dans le projet. Ajoutez-vous ou vos enfants pour
                dÃ©marrer.
              </p>
            ) : (
              <div className="mp-cart-item-list">
                {cart.items.map((it) => (
                  <CartItemCard
                    key={it.id}
                    item={it}
                    disabled={loading}
                  />
                ))}
              </div>
            )}
          </section>

          <CartSummary cart={cart} />
        </div>
      )}

      <AddChildToCartDrawer
        open={childOpen}
        onClose={() => {
          setChildOpen(false);
          void refetch();
        }}
      />

      {selfOpen ? (
        <RegisterSelfAsMemberModal
          onClose={() => {
            setSelfOpen(false);
            void refetch();
          }}
        />
      ) : null}
    </div>
  );
}

// ---------- Modale "M'inscrire aussi" inline ----------

function RegisterSelfAsMemberModal({ onClose }: { onClose: () => void }) {
  const { showToast } = useToast();
  const [civility, setCivility] = useState<Civility>('MR');
  const [birthDate, setBirthDate] = useState<string>('');
  const [selectedProductIds, setSelectedProductIds] = useState<string[]>([]);
  const [localError, setLocalError] = useState<string | null>(null);

  const [register, { loading }] = useMutation<RegisterSelfResponse>(
    VIEWER_REGISTER_SELF_AS_MEMBER,
    { refetchQueries: [{ query: VIEWER_ACTIVE_CART }] },
  );

  // Charge les formules Ã©ligibles dÃ¨s que la date de naissance est saisie.
  // L'utilisateur peut en cocher 1 ou plusieurs.
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

  async function handleSubmit(): Promise<void> {
    setLocalError(null);
    if (!birthDate) {
      setLocalError('La date de naissance est obligatoire.');
      return;
    }
    if (selectedProductIds.length === 0) {
      setLocalError('SÃ©lectionnez au moins une formule.');
      return;
    }
    try {
      const { data } = await register({
        variables: {
          input: {
            civility,
            birthDate,
            membershipProductIds: selectedProductIds,
          },
        },
      });
      const res = data?.viewerRegisterSelfAsMember;
      if (!res?.pendingItemId) {
        setLocalError('Impossible de crÃ©er votre fiche adhÃ©rent.');
        return;
      }
      showToast(
        'Vous Ãªtes ajoutÃ© au projet d\u2019adhÃ©sion.',
        'success',
      );
      onClose();
    } catch (err) {
      setLocalError(
        err instanceof Error
          ? err.message
          : 'Impossible de crÃ©er votre fiche adhÃ©rent.',
      );
    }
  }

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
        aria-labelledby="self-register-title"
      >
        <h2 id="self-register-title" className="mp-modal-title">
          M&rsquo;inscrire comme membre
        </h2>
        <p className="mp-hint mp-modal-lede">
          Nous utilisons votre date de naissance pour sÃ©lectionner la formule
          adaptÃ©e. La licence fÃ©dÃ©rale est auto-ajoutÃ©e.
        </p>

        <fieldset className="mp-fieldset">
          <legend className="mp-legend">CivilitÃ©</legend>
          <label className="mp-radio mp-radio--inline">
            <input
              type="radio"
              name="self-civility"
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
              name="self-civility"
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
              Formules d'adhésion
              {selectedProductIds.length > 0
                ? ` (${selectedProductIds.length} sélectionnée${
                    selectedProductIds.length > 1 ? 's' : ''
                  })`
                : ''}
            </legend>
            <p className="mp-hint" style={{ marginBottom: 8 }}>
              Vous pouvez en sélectionner plusieurs (ex Karaté + Cross
              Training). Le montant sera cumulé sur la facture.
            </p>
            {formulasLoading ? (
              <p className="mp-hint">Chargement…</p>
            ) : formulas.length === 0 ? (
              <p className="mp-hint">
                Aucune formule disponible pour cette date de naissance —
                contacte le club.
              </p>
            ) : (
              <div className="mp-checkboxes">
                {formulas.map((f) => {
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
                        background: checked
                          ? 'rgba(37, 99, 235, 0.05)'
                          : 'white',
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
                })}
              </div>
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
            {loading ? 'Ajoutâ€¦' : 'M\u2019ajouter au projet'}
          </button>
        </div>
      </div>
    </>
  );
}

