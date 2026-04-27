import { useMemo, useState } from 'react';
import { useMutation } from '@apollo/client/react';
import {
  VIEWER_ACTIVE_CART,
  VIEWER_MEMBERSHIP_CARTS,
} from '../../lib/cart-documents';
import { VIEWER_CHECKOUT_MEMBERSHIP_CART } from '../../lib/viewer-documents';
import { formatEuroCents } from '../../lib/format';
import { useToast } from '../ToastProvider';

type ClubPaymentMethod =
  | 'STRIPE_CARD'
  | 'MANUAL_CASH'
  | 'MANUAL_CHECK'
  | 'MANUAL_TRANSFER';

interface CheckoutData {
  viewerCheckoutMembershipCart: {
    cartId: string;
    invoiceId: string;
    method: ClubPaymentMethod;
    installmentsCount: number;
    stripeCheckoutUrl: string | null;
    instructions: string | null;
  };
}

interface Props {
  /** Panier OPEN à valider (les Members ne sont créés qu'au confirm). */
  cartId: string;
  /** Total TTC du panier (déjà tout-inclus, calculé par computeCartPreview). */
  totalCents: number;
  /**
   * Rythme dominant du panier. ANNUAL → propose 1× ou 3×. MONTHLY →
   * comptant uniquement.
   */
  billingRhythm: 'ANNUAL' | 'MONTHLY';
  /** Fermeture (annulation explicite, sans validation BDD). */
  onClose: () => void;
  /** Callback après acceptation d'un mode manuel (post instructions). */
  onDone: () => void;
}

const METHODS: Array<{
  method: ClubPaymentMethod;
  label: string;
  icon: string;
  blurb: string;
}> = [
  {
    method: 'STRIPE_CARD',
    label: 'Carte bancaire',
    icon: 'credit_card',
    blurb: 'Paiement sécurisé en ligne (Stripe).',
  },
  {
    method: 'MANUAL_TRANSFER',
    label: 'Virement bancaire',
    icon: 'account_balance',
    blurb: 'Le club vous transmet un IBAN par e-mail.',
  },
  {
    method: 'MANUAL_CHECK',
    label: 'Chèque',
    icon: 'description',
    blurb: 'À déposer au club ou envoyer par courrier.',
  },
  {
    method: 'MANUAL_CASH',
    label: 'Espèces',
    icon: 'payments',
    blurb: 'À remettre au club lors du prochain entraînement.',
  },
];

export function PaymentChoiceModal({
  cartId,
  totalCents,
  billingRhythm,
  onClose,
  onDone,
}: Props) {
  const { showToast } = useToast();
  const supportsInstallments = billingRhythm === 'ANNUAL';
  const [installments, setInstallments] = useState<1 | 3>(1);
  const [selected, setSelected] = useState<ClubPaymentMethod | null>(null);
  const [instructions, setInstructions] = useState<string | null>(null);

  const [checkout, { loading }] = useMutation<CheckoutData>(
    VIEWER_CHECKOUT_MEMBERSHIP_CART,
    {
      // Refetch des panier-related queries pour que le badge header se
      // mette à jour (le panier passe en VALIDATED, son count tombe à 0).
      refetchQueries: [
        { query: VIEWER_ACTIVE_CART },
        { query: VIEWER_MEMBERSHIP_CARTS },
      ],
      awaitRefetchQueries: true,
    },
  );

  const perInstallment = useMemo(
    () => Math.round(totalCents / installments),
    [totalCents, installments],
  );

  async function handleConfirm(method: ClubPaymentMethod): Promise<void> {
    if (loading) return;
    setSelected(method);
    try {
      const res = await checkout({
        variables: {
          cartId,
          method,
          installmentsCount: installments,
        },
      });
      const data = res.data?.viewerCheckoutMembershipCart;
      if (!data) {
        throw new Error('Réponse serveur invalide.');
      }
      if (method === 'STRIPE_CARD') {
        const url = data.stripeCheckoutUrl;
        if (!url) {
          throw new Error(
            'URL Stripe indisponible. Choisissez un autre mode (chèque, espèces, virement) ou réessayez plus tard.',
          );
        }
        showToast('Redirection vers le paiement Stripe…', 'success');
        window.location.assign(url);
        return;
      }
      // Méthodes manuelles : on affiche les instructions retournées
      // par le backend (montant, échéancier, modalités).
      setInstructions(data.instructions ?? '');
      showToast('Adhésion confirmée. Mode de règlement enregistré.', 'success');
    } catch (e) {
      showToast(
        e instanceof Error ? e.message : 'Choix indisponible.',
        'error',
      );
      setSelected(null);
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
        aria-labelledby="payment-choice-title"
        style={{ maxWidth: 560 }}
      >
        {instructions !== null ? (
          <>
            <h2 id="payment-choice-title" className="mp-modal-title">
              Adhésion confirmée
            </h2>
            <p className="mp-hint mp-modal-lede">
              {instructions ||
                'Mode de règlement enregistré. Le club vous contactera si nécessaire.'}
            </p>
            <div
              style={{
                padding: 12,
                background: 'rgba(37, 99, 235, 0.06)',
                border: '1px solid rgba(37, 99, 235, 0.2)',
                borderRadius: 6,
                marginBottom: 16,
                fontSize: '0.85rem',
              }}
            >
              Vos fiches adhérent ont été créées et la facture est
              accessible dans <strong>Mes factures</strong>. Le club a
              été notifié de votre choix de règlement.
            </div>
            <div className="mp-modal-actions">
              <button
                type="button"
                className="mp-btn mp-btn-primary"
                onClick={onDone}
              >
                J’ai compris
              </button>
            </div>
          </>
        ) : (
          <>
            <h2 id="payment-choice-title" className="mp-modal-title">
              Comment souhaitez-vous régler ?
            </h2>
            <p className="mp-hint mp-modal-lede">
              Total dû : <strong>{formatEuroCents(totalCents)}</strong>
              {supportsInstallments
                ? " — vous pouvez choisir un échéancier en 3 fois."
                : ' — paiement comptant uniquement (cotisation mensuelle).'}
              <br />
              <small>
                Vos fiches adhérent et la facture seront créées dès que
                vous aurez confirmé votre choix.
              </small>
            </p>

            {supportsInstallments ? (
              <fieldset className="mp-fieldset">
                <legend className="mp-legend">Échéancier</legend>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    gap: 8,
                    marginBottom: 16,
                  }}
                >
                  <button
                    type="button"
                    className={`mp-btn ${installments === 1 ? 'mp-btn-primary' : 'mp-btn-outline'}`}
                    disabled={loading}
                    onClick={() => setInstallments(1)}
                  >
                    En 1 fois
                    <br />
                    <small style={{ fontWeight: 400 }}>
                      {formatEuroCents(totalCents)} maintenant
                    </small>
                  </button>
                  <button
                    type="button"
                    className={`mp-btn ${installments === 3 ? 'mp-btn-primary' : 'mp-btn-outline'}`}
                    disabled={loading}
                    onClick={() => setInstallments(3)}
                  >
                    En 3 fois
                    <br />
                    <small style={{ fontWeight: 400 }}>
                      3 × {formatEuroCents(perInstallment)}
                    </small>
                  </button>
                </div>
              </fieldset>
            ) : null}

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(2, 1fr)',
                gap: 8,
              }}
            >
              {METHODS.map((m) => {
                const isSelected = selected === m.method;
                return (
                  <button
                    key={m.method}
                    type="button"
                    className="mp-btn mp-btn-outline"
                    disabled={loading}
                    onClick={() => void handleConfirm(m.method)}
                    style={{
                      padding: 12,
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'flex-start',
                      gap: 4,
                      textAlign: 'left',
                      borderColor: isSelected ? '#2563eb' : undefined,
                      background: isSelected
                        ? 'rgba(37, 99, 235, 0.05)'
                        : undefined,
                    }}
                  >
                    <span
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                        fontWeight: 600,
                      }}
                    >
                      <span
                        className="material-symbols-outlined"
                        aria-hidden="true"
                        style={{ fontSize: '1.2rem' }}
                      >
                        {m.icon}
                      </span>
                      {m.label}
                      {installments === 3 ? (
                        <span
                          className="mp-pill"
                          style={{
                            marginLeft: 'auto',
                            padding: '2px 6px',
                            background: 'rgba(37, 99, 235, 0.15)',
                            color: '#1e3a8a',
                            borderRadius: 8,
                            fontSize: '0.7rem',
                          }}
                        >
                          3×
                        </span>
                      ) : null}
                    </span>
                    <small
                      className="mp-hint"
                      style={{ fontSize: '0.78rem', fontWeight: 400 }}
                    >
                      {m.blurb}
                    </small>
                  </button>
                );
              })}
            </div>

            <div className="mp-modal-actions" style={{ marginTop: 16 }}>
              <button
                type="button"
                className="mp-btn mp-btn-outline"
                disabled={loading}
                onClick={onClose}
              >
                {loading ? 'Validation…' : 'Annuler'}
              </button>
            </div>
          </>
        )}
      </div>
    </>
  );
}
