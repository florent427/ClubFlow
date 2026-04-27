import { useMemo, useState } from 'react';
import { useMutation } from '@apollo/client/react';
import {
  VIEWER_CREATE_INVOICE_CHECKOUT_SESSION,
  VIEWER_LOCK_INVOICE_PAYMENT_CHOICE,
} from '../../lib/viewer-documents';
import { formatEuroCents } from '../../lib/format';
import { useToast } from '../ToastProvider';

type ClubPaymentMethod =
  | 'STRIPE_CARD'
  | 'MANUAL_CASH'
  | 'MANUAL_CHECK'
  | 'MANUAL_TRANSFER';

interface CreateCheckoutData {
  viewerCreateInvoiceCheckoutSession: {
    url: string | null;
    sessionId: string | null;
  };
}

interface LockChoiceData {
  viewerLockInvoicePaymentChoice: {
    invoiceId: string;
    method: ClubPaymentMethod;
    installmentsCount: number;
    instructions: string;
  };
}

interface Props {
  /** Facture nouvellement créée à régler. */
  invoiceId: string;
  /** Total à payer (en cents). */
  totalCents: number;
  /**
   * Rythme de facturation dominant du panier. ANNUAL → propose les 8
   * options (1× ou 3×). MONTHLY → seulement 1×.
   */
  billingRhythm: 'ANNUAL' | 'MONTHLY';
  /** Fermeture (annulation explicite). */
  onClose: () => void;
  /** Callback après acceptation d'un mode manuel (post instructions). */
  onDone: () => void;
}

const METHODS: Array<{
  method: ClubPaymentMethod;
  label: string;
  icon: string;
  /** Clé pour la grille de description courte. */
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
  invoiceId,
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

  const [createCheckout, { loading: redirecting }] =
    useMutation<CreateCheckoutData>(VIEWER_CREATE_INVOICE_CHECKOUT_SESSION);
  const [lockChoice, { loading: locking }] =
    useMutation<LockChoiceData>(VIEWER_LOCK_INVOICE_PAYMENT_CHOICE);
  const loading = redirecting || locking;

  const perInstallment = useMemo(
    () => Math.round(totalCents / installments),
    [totalCents, installments],
  );

  async function handleConfirm(method: ClubPaymentMethod): Promise<void> {
    if (loading) return;
    setSelected(method);
    try {
      if (method === 'STRIPE_CARD') {
        const ck = await createCheckout({
          variables: {
            invoiceId,
            installmentsCount: installments,
          },
        });
        const url = ck.data?.viewerCreateInvoiceCheckoutSession.url ?? null;
        if (!url) {
          throw new Error('URL de paiement Stripe indisponible.');
        }
        showToast('Redirection vers le paiement Stripe…', 'success');
        window.location.assign(url);
        return;
      }
      const res = await lockChoice({
        variables: {
          invoiceId,
          method,
          installmentsCount: installments,
        },
      });
      const data = res.data?.viewerLockInvoicePaymentChoice;
      if (!data) {
        throw new Error('Réponse serveur invalide.');
      }
      setInstructions(data.instructions);
      showToast('Mode de règlement enregistré.', 'success');
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
        {instructions ? (
          <>
            <h2 id="payment-choice-title" className="mp-modal-title">
              Mode de règlement enregistré
            </h2>
            <p className="mp-hint mp-modal-lede">{instructions}</p>
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
              Le club a été notifié de votre choix. Vous pourrez suivre
              l’état du règlement dans <strong>Mes factures</strong>.
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
                {loading ? 'Patientez…' : 'Annuler'}
              </button>
            </div>
          </>
        )}
      </div>
    </>
  );
}
