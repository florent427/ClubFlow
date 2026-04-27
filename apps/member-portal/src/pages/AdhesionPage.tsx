import { useMutation, useQuery } from '@apollo/client/react';
import { Fragment, useEffect, useState } from 'react';
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
            <h1 className="mp-page-title">Panier d&rsquo;adhésion</h1>
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
                        }}
                      >
                        {/* Header : nom + actions */}
                        <div
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'flex-start',
                            gap: 12,
                            marginBottom: 8,
                          }}
                        >
                          <div>
                            <strong style={{ fontSize: '1rem' }}>
                              {fullName}
                            </strong>
                            <br />
                            <small className="mp-hint">
                              Rythme :{' '}
                              {p.billingRhythm === 'ANNUAL'
                                ? 'annuel'
                                : 'mensuel'}
                            </small>
                          </div>
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

                        {/* Ventilation détaillée : 1 ligne par formule
                            + frais uniques + remises pricing-rule + total */}
                        <dl
                          style={{
                            margin: 0,
                            display: 'grid',
                            gridTemplateColumns: '1fr auto',
                            rowGap: 4,
                            columnGap: 12,
                            fontSize: '0.85rem',
                          }}
                        >
                          {p.perProduct.length > 0 ? (
                            p.perProduct.map((entry) => (
                              <Fragment key={entry.productId}>
                                <dt style={{ margin: 0 }}>
                                  Cotisation {entry.productLabel}
                                  {entry.subscriptionBaseCents !==
                                  entry.subscriptionAdjustedCents ? (
                                    <small
                                      className="mp-hint"
                                      style={{
                                        marginLeft: 4,
                                        fontSize: '0.7rem',
                                        textDecoration: 'line-through',
                                        opacity: 0.6,
                                      }}
                                    >
                                      {formatEuroCents(
                                        entry.subscriptionBaseCents,
                                      )}
                                    </small>
                                  ) : null}
                                </dt>
                                <dd
                                  style={{
                                    margin: 0,
                                    textAlign: 'right',
                                    fontVariantNumeric: 'tabular-nums',
                                  }}
                                >
                                  {formatEuroCents(
                                    entry.subscriptionAdjustedCents,
                                  )}
                                </dd>
                              </Fragment>
                            ))
                          ) : (
                            // Fallback si le preview n'a pas pu être calculé
                            <>
                              <dt style={{ margin: 0 }}>
                                {p.membershipProductLabels.length} formule
                                {p.membershipProductLabels.length > 1
                                  ? 's'
                                  : ''}{' '}
                                : {p.membershipProductLabels.join(', ')}
                              </dt>
                              <dd
                                style={{
                                  margin: 0,
                                  textAlign: 'right',
                                  fontVariantNumeric: 'tabular-nums',
                                }}
                              >
                                {formatEuroCents(p.subscriptionAdjustedCents)}
                              </dd>
                            </>
                          )}

                          {p.oneTimeFeesCents > 0 ? (
                            <>
                              <dt style={{ margin: 0 }}>
                                Frais uniques (licence…)
                              </dt>
                              <dd
                                style={{
                                  margin: 0,
                                  textAlign: 'right',
                                  fontVariantNumeric: 'tabular-nums',
                                }}
                              >
                                {formatEuroCents(p.oneTimeFeesCents)}
                              </dd>
                            </>
                          ) : null}

                          {p.pricingRulePreviews.map((r, idx) => (
                            <Fragment key={`rule-${idx}`}>
                              <dt
                                style={{
                                  margin: 0,
                                  color: '#0f766e',
                                }}
                                title={r.reason}
                              >
                                🎁 {r.ruleLabel}
                                <br />
                                <small
                                  className="mp-hint"
                                  style={{
                                    fontSize: '0.7rem',
                                    color: '#0f766e',
                                    opacity: 0.85,
                                  }}
                                >
                                  {r.reason}
                                </small>
                              </dt>
                              <dd
                                style={{
                                  margin: 0,
                                  textAlign: 'right',
                                  color: '#0f766e',
                                  fontVariantNumeric: 'tabular-nums',
                                }}
                              >
                                {r.deltaAmountCents < 0 ? '−' : '+'}
                                {formatEuroCents(
                                  Math.abs(r.deltaAmountCents),
                                )}
                              </dd>
                            </Fragment>
                          ))}

                          <dt
                            style={{
                              margin: 0,
                              paddingTop: 6,
                              borderTop: '1px solid rgba(37, 99, 235, 0.25)',
                              fontWeight: 600,
                            }}
                          >
                            Total ligne
                          </dt>
                          <dd
                            style={{
                              margin: 0,
                              paddingTop: 6,
                              borderTop: '1px solid rgba(37, 99, 235, 0.25)',
                              fontWeight: 700,
                              textAlign: 'right',
                              fontVariantNumeric: 'tabular-nums',
                            }}
                          >
                            {formatEuroCents(p.estimatedTotalCents)}
                          </dd>
                        </dl>
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
          identityFirstName={meData?.viewerMe?.firstName ?? ''}
          identityLastName={meData?.viewerMe?.lastName ?? ''}
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

type SelfBillingRhythm = 'ANNUAL' | 'MONTHLY';

function RegisterSelfAsMemberModal({
  onClose,
  identityFirstName,
  identityLastName,
}: {
  onClose: () => void;
  identityFirstName: string;
  identityLastName: string;
}) {
  const { showToast } = useToast();
  const [civility, setCivility] = useState<Civility>('MR');
  const [birthDate, setBirthDate] = useState<string>('');
  const [selectedProductIds, setSelectedProductIds] = useState<string[]>([]);
  const [billingRhythm, setBillingRhythm] =
    useState<SelfBillingRhythm>('ANNUAL');
  const [localError, setLocalError] = useState<string | null>(null);

  const [register, { loading }] = useMutation<RegisterSelfResponse>(
    VIEWER_REGISTER_SELF_AS_MEMBER,
    {
      refetchQueries: [
        { query: VIEWER_ACTIVE_CART },
        { query: VIEWER_MEMBERSHIP_CARTS },
      ],
      awaitRefetchQueries: true,
    },
  );

  // Charge les formules éligibles dès que la date de naissance est
  // saisie. On passe l'identité du viewer (Contact) pour annoter
  // `alreadyTakenInSeason` et empêcher les doublons.
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
      identityFirstName,
      identityLastName,
    },
    skip: !birthDate,
    fetchPolicy: 'cache-and-network',
  });
  const formulas = formulasData?.viewerEligibleMembershipFormulas ?? [];
  const availableFormulas = formulas.filter((f) => !f.alreadyTakenInSeason);
  const allTaken = formulas.length > 0 && availableFormulas.length === 0;

  // Pré-sélection automatique de la première formule DISPONIBLE (non
  // déjà prise) — cohérent avec les autres modales du panier.
  useEffect(() => {
    if (availableFormulas.length > 0 && selectedProductIds.length === 0) {
      setSelectedProductIds([availableFormulas[0].id]);
    }
  }, [availableFormulas, selectedProductIds.length]);

  // Si une des formules cochées n'a pas de tarif mensuel, on retombe
  // automatiquement en ANNUAL pour éviter un input invalide.
  const selectedFormulas = formulas.filter((f) =>
    selectedProductIds.includes(f.id),
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
            billingRhythm,
          },
        },
      });
      const res = data?.viewerRegisterSelfAsMember;
      if (!res?.pendingItemId) {
        setLocalError('Impossible de créer votre fiche adhérent.');
        return;
      }
      showToast(
        `Vous êtes ajouté au panier (${selectedProductIds.length} formule${selectedProductIds.length > 1 ? 's' : ''}, ${billingRhythm === 'ANNUAL' ? 'annuel' : 'mensuel'}).`,
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
                contactez le club.
              </p>
            ) : allTaken ? (
              <p className="mp-hint mp-hint--warn">
                Vous avez déjà pris toutes les formules d&rsquo;adhésion
                compatibles pour cette saison. Plus aucune adhésion
                supplémentaire n&rsquo;est possible.
              </p>
            ) : (
              <div className="mp-checkboxes">
                {formulas.map((f) => {
                  const checked = selectedProductIds.includes(f.id);
                  const taken = f.alreadyTakenInSeason;
                  return (
                    <label
                      key={f.id}
                      className="mp-checkbox"
                      title={
                        taken
                          ? 'Formule déjà prise cette saison.'
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
                })}
              </div>
            )}
          </fieldset>
        ) : null}

        {selectedFormulas.length > 0 ? (
          <fieldset className="mp-fieldset">
            <legend className="mp-legend">Rythme de règlement</legend>
            <label className="mp-radio mp-radio--inline">
              <input
                type="radio"
                name="self-billing"
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
                name="self-billing"
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
            {loading ? 'Ajout…' : 'M\u2019ajouter au panier'}
          </button>
        </div>
      </div>
    </>
  );
}

