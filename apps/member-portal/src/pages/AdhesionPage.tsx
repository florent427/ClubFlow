import { useMutation, useQuery } from '@apollo/client/react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  VIEWER_ACTIVE_CART,
  VIEWER_MEMBERSHIP_CARTS,
  VIEWER_OPEN_CART,
  VIEWER_REGISTER_SELF_AS_MEMBER,
  VIEWER_REMOVE_CART_PENDING_ITEM,
  type Cart,
  type CartPendingItem,
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
import { EditPendingCartItemModal } from '../components/cart/EditPendingCartItemModal';
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
  // Pending item ouvert en édition (null = aucun en cours d'édition).
  const [editingPending, setEditingPending] =
    useState<CartPendingItem | null>(null);

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
  const [removePending, { loading: removing }] = useMutation(
    VIEWER_REMOVE_CART_PENDING_ITEM,
    {
      refetchQueries: [
        { query: VIEWER_ACTIVE_CART },
        { query: VIEWER_MEMBERSHIP_CARTS },
      ],
      awaitRefetchQueries: true,
    },
  );

  async function handleRemovePending(
    pendingItemId: string,
    name: string,
  ): Promise<void> {
    if (removing) return;
    if (
      !window.confirm(
        `Retirer ${name} du panier ? Cette action est immédiate et réversible (vous pourrez l'ajouter à nouveau).`,
      )
    ) {
      return;
    }
    try {
      await removePending({ variables: { pendingItemId } });
      showToast(`${name} retiré du panier.`, 'success');
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : 'Suppression impossible.',
        'error',
      );
    }
  }

  const isContactOnly = meData?.viewerMe?.isContactProfile === true;
  const canManageMembershipCart =
    meData?.viewerMe?.canManageMembershipCart === true;
  const cart: Cart | null = data?.viewerActiveMembershipCart ?? null;

  async function handleOpen(): Promise<void> {
    try {
      await openCart();
      showToast('Panier d\u2019adhésion ouvert.', 'success');
    } catch (err) {
      showToast(
        err instanceof Error
          ? err.message
          : 'Impossible d\u2019ouvrir un panier.',
        'error',
      );
    }
  }

  // Tant que `viewerMe` n'est pas encore chargé, on évite de flasher l'écran
  // « accès refusé » : on montre un placeholder neutre.
  if (!meData) {
    return (
      <div className="mp-page">
        <p className="mp-hint">Chargement…</p>
      </div>
    );
  }

  if (!canManageMembershipCart) {
    return (
      <div className="mp-page">
        <header className="mp-page-head">
          <div>
            <p className="mp-eyebrow">Saison active</p>
            <h1 className="mp-page-title">Projet d&rsquo;adhésion</h1>
          </div>
        </header>
        <section className="mp-empty-state">
          <h2 className="mp-subtitle">Accès réservé au payeur du foyer</h2>
          <p className="mp-hint">
            Seul un adulte désigné payeur du foyer peut ouvrir et gérer un
            panier d&rsquo;adhésion. Si vous êtes un enfant ou un autre membre
            de la famille, demandez au payeur du foyer de s&rsquo;en charger —
            il pourra ensuite vous ajouter au panier.
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
          <h1 className="mp-page-title">Panier d&rsquo;adhésion</h1>
          <p className="mp-lead">
            Composez l&rsquo;inscription de votre foyer comme un panier en
            ligne. Validez quand vous êtes prêt — la facture est émise et le
            paiement déclenché immédiatement.
          </p>
        </div>
      </header>

      {error ? (
        <p className="mp-form-error" role="alert">
          {error.message}
        </p>
      ) : null}

      {loading && !cart ? (
        <p className="mp-hint">Chargement du panier…</p>
      ) : !cart ? (
        <section className="mp-empty-state">
          <h2 className="mp-subtitle">Aucun panier en cours</h2>
          <p className="mp-hint">
            Ouvrez un panier d&rsquo;adhésion pour la saison active. Vous
            pourrez ajouter vos enfants et vous-même, ajuster les rythmes de
            règlement et déclarer une licence fédérale existante.
          </p>
          <button
            type="button"
            className="mp-btn mp-btn-primary"
            disabled={opening}
            onClick={() => void handleOpen()}
          >
            {opening ? 'Création…' : 'Créer mon panier d\u2019adhésion'}
          </button>
        </section>
      ) : cart.status === 'VALIDATED' ? (
        <section className="mp-cart-validated">
          <div className="mp-cart-validated__head">
            <span className="material-symbols-outlined mp-cart-validated__ico">
              verified
            </span>
            <div>
              <h2 className="mp-subtitle">Adhésion validée</h2>
              <p className="mp-hint">
                Validé le{' '}
                {cart.validatedAt
                  ? new Date(cart.validatedAt).toLocaleDateString('fr-FR', {
                      day: '2-digit',
                      month: 'long',
                      year: 'numeric',
                    })
                  : '—'}{' '}
                · Total TTC : {formatEuroCents(cart.totalCents)}
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
                ? 'Création…'
                : 'Ajouter un élément en cours de saison'}
            </button>
          </div>
        </section>
      ) : cart.status === 'CANCELLED' ? (
        <section className="mp-cart-cancelled">
          <h2 className="mp-subtitle">Panier annulé</h2>
          <p className="mp-hint">
            {cart.cancelledReason
              ? `Raison : ${cart.cancelledReason}`
              : 'Le club a annulé ce panier.'}
          </p>
          <button
            type="button"
            className="mp-btn mp-btn-primary"
            disabled={opening}
            onClick={() => void handleOpen()}
          >
            {opening ? 'Création…' : 'Ouvrir un nouveau panier'}
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

            {cart.items.length === 0 &&
            (!cart.pendingItems || cart.pendingItems.length === 0) ? (
              <p className="mp-hint">
                Aucun membre dans le panier. Ajoutez-vous ou vos enfants pour
                démarrer.
              </p>
            ) : cart.items.length === 0 ? null : (
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

            {cart.pendingItems && cart.pendingItems.length > 0 ? (
              <div style={{ marginTop: 16 }}>
                <h3
                  style={{
                    fontSize: '0.95rem',
                    fontWeight: 600,
                    color: '#1e3a8a',
                    marginBottom: 8,
                  }}
                >
                  Inscriptions dans votre panier
                </h3>
                <p
                  className="mp-hint"
                  style={{ marginBottom: 8, fontSize: '0.8rem' }}
                >
                  Les fiches adhérent ci-dessous seront créées
                  automatiquement à la validation du panier. Les remises
                  automatiques (rang famille, bundles…) sont déjà incluses
                  dans les montants affichés.
                </p>
                <div className="mp-cart-item-list">
                  {cart.pendingItems.map((p) => {
                    const fullName = `${p.firstName} ${p.lastName}`;
                    return (
                      <div
                        key={p.id}
                        style={{
                          padding: 12,
                          marginBottom: 8,
                          background: 'rgba(37, 99, 235, 0.04)',
                          border: '1px solid rgba(37, 99, 235, 0.2)',
                          borderRadius: 6,
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'flex-start',
                          gap: 12,
                        }}
                      >
                        <div style={{ flex: 1 }}>
                          <strong>{fullName}</strong>
                          <br />
                          <small className="mp-hint">
                            {p.membershipProductLabels.length} formule
                            {p.membershipProductLabels.length > 1 ? 's' : ''} :{' '}
                            {p.membershipProductLabels.join(', ')}
                          </small>
                          {p.pricingRulePreviews.length > 0 ? (
                            <ul
                              style={{
                                marginTop: 6,
                                marginBottom: 0,
                                paddingLeft: 18,
                                fontSize: '0.78rem',
                                color: '#0f766e',
                              }}
                            >
                              {p.pricingRulePreviews.map((r, idx) => (
                                <li key={idx}>
                                  <strong>{r.ruleLabel}</strong> :{' '}
                                  {r.deltaAmountCents < 0 ? '−' : '+'}
                                  {Math.abs(r.deltaAmountCents / 100).toFixed(2)} €
                                  <small
                                    style={{
                                      marginLeft: 6,
                                      color: '#475569',
                                    }}
                                  >
                                    {r.reason}
                                  </small>
                                </li>
                              ))}
                            </ul>
                          ) : null}
                        </div>
                        <div
                          style={{
                            textAlign: 'right',
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'flex-end',
                            gap: 6,
                          }}
                        >
                          <span style={{ fontWeight: 600 }}>
                            {(p.estimatedTotalCents / 100).toFixed(2)} €
                          </span>
                          <small
                            className="mp-hint"
                            style={{
                              fontSize: '0.7rem',
                              fontWeight: 400,
                              opacity: 0.85,
                            }}
                          >
                            {p.billingRhythm === 'ANNUAL'
                              ? 'annuel'
                              : 'mensuel'}
                          </small>
                          <div style={{ display: 'flex', gap: 6 }}>
                            <button
                              type="button"
                              className="mp-btn mp-btn-outline mp-btn-compact"
                              disabled={removing}
                              onClick={() => setEditingPending(p)}
                              aria-label={`Modifier l’inscription de ${fullName}`}
                              title="Modifier formules / rythme"
                              style={{
                                fontSize: '0.75rem',
                                padding: '4px 8px',
                              }}
                            >
                              <span
                                className="material-symbols-outlined"
                                aria-hidden="true"
                                style={{ fontSize: '1rem' }}
                              >
                                edit
                              </span>{' '}
                              Modifier
                            </button>
                            <button
                              type="button"
                              className="mp-btn mp-btn-outline mp-btn-compact"
                              disabled={removing}
                              onClick={() =>
                                void handleRemovePending(p.id, fullName)
                              }
                              aria-label={`Retirer ${fullName} du panier`}
                              title="Retirer du panier"
                              style={{
                                fontSize: '0.75rem',
                                padding: '4px 8px',
                                color: '#b91c1c',
                                borderColor: 'rgba(185, 28, 28, 0.3)',
                              }}
                            >
                              <span
                                className="material-symbols-outlined"
                                aria-hidden="true"
                                style={{ fontSize: '1rem' }}
                              >
                                delete
                              </span>{' '}
                              Retirer
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : null}
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

      {editingPending ? (
        <EditPendingCartItemModal
          pending={editingPending}
          onClose={() => {
            setEditingPending(null);
            void refetch();
          }}
        />
      ) : null}

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

  // Charge les formules éligibles dès que la date de naissance est saisie.
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
      setLocalError('Sélectionnez au moins une formule.');
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
        setLocalError('Impossible de créer votre fiche adhérent.');
        return;
      }
      showToast(
        'Vous êtes ajouté au panier d\u2019adhésion.',
        'success',
      );
      onClose();
    } catch (err) {
      setLocalError(
        err instanceof Error
          ? err.message
          : 'Impossible de créer votre fiche adhérent.',
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
          Nous utilisons votre date de naissance pour sélectionner la formule
          adaptée. La licence fédérale est auto-ajoutée.
        </p>

        <fieldset className="mp-fieldset">
          <legend className="mp-legend">Civilité</legend>
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
            {loading ? 'Ajout…' : 'M\u2019ajouter au panier'}
          </button>
        </div>
      </div>
    </>
  );
}

