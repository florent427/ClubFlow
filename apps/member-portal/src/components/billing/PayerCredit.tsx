import { useMutation } from '@apollo/client/react';
import { useState, type FormEvent, type ReactNode } from 'react';
import { formatShortDate } from '../../lib/format';
import {
  parsePayerCreditTopUp,
  payerCreditKpi,
  payerCreditMovementTitle,
  signedEuroCents,
} from '../../lib/payer-credit';
import { VIEWER_CREATE_PAYER_CREDIT_CHECKOUT_SESSION } from '../../lib/viewer-documents';
import type {
  ViewerCreatePayerCreditCheckoutSessionData,
  ViewerPayerCredit,
  ViewerPayerCreditMovement,
} from '../../lib/viewer-types';
import { useToast } from '../ToastProvider';

/**
 * Solde du crédit du compte (ADR-0022), sous la forme d'un indicateur de la
 * facturation. À n'afficher que si `shouldShowPayerCredit` le permet.
 */
export function PayerCreditKpi({
  credit,
  children,
}: {
  credit: ViewerPayerCredit;
  children?: ReactNode;
}) {
  const kpi = payerCreditKpi(credit.balanceCents);
  const tone = kpi.tone === 'neutral' ? '' : ` mp-billing-kpi--${kpi.tone}`;
  return (
    <article className={`mp-billing-kpi${tone}`}>
      <span className="mp-billing-kpi__label">{kpi.label}</span>
      <span className="mp-billing-kpi__value">{kpi.value}</span>
      {credit.balanceCents < 0 ? (
        <span className="mp-billing-kpi__hint">
          Contactez le club pour le régulariser.
        </span>
      ) : null}
      {children}
    </article>
  );
}

/** Historique du crédit, replié : un paiement par ligne, avec son effet. */
export function PayerCreditHistory({
  movements,
}: {
  movements: ViewerPayerCreditMovement[];
}) {
  if (movements.length === 0) return null;
  return (
    <details className="mp-credit-history">
      <summary className="mp-credit-history__summary">
        Historique du crédit ({movements.length})
      </summary>
      <ul className="mp-invoice-payments-list">
        {movements.map((m) => (
          <li key={m.paymentId} className="mp-invoice-payments-list__row">
            <div>
              <div className="mp-invoice-payments-list__method">
                {payerCreditMovementTitle(m)}
              </div>
              <div className="mp-invoice-payments-list__meta">
                {formatShortDate(m.createdAt)}
              </div>
            </div>
            <div
              className={`mp-invoice-payments-list__amount${m.amountCents < 0 ? ' mp-credit-history__amount--out' : ''}`}
            >
              {signedEuroCents(m.amountCents)}
            </div>
          </li>
        ))}
      </ul>
    </details>
  );
}

/**
 * « Créditer mon compte » : une avance par carte, de 1 € à 1 000 €, versée sur
 * Stripe. Le crédit apparaît quand Stripe confirme l'encaissement, quelques
 * secondes après le retour sur le portail.
 */
export function PayerCreditTopUp() {
  const { showToast } = useToast();
  const [amount, setAmount] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [redirecting, setRedirecting] = useState(false);
  const [createSession] = useMutation<ViewerCreatePayerCreditCheckoutSessionData>(
    VIEWER_CREATE_PAYER_CREDIT_CHECKOUT_SESSION,
  );

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (redirecting) return;
    const parsed = parsePayerCreditTopUp(amount);
    if ('error' in parsed) {
      setError(parsed.error);
      return;
    }
    setError(null);
    setRedirecting(true);
    try {
      const res = await createSession({ variables: { amountCents: parsed.cents } });
      const url = res.data?.viewerCreatePayerCreditCheckoutSession.url;
      if (!url) throw new Error('URL de paiement manquante.');
      window.location.assign(url);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Paiement indisponible.', 'error');
      setRedirecting(false);
    }
  }

  return (
    <form className="mp-credit-topup" onSubmit={(e) => void onSubmit(e)}>
      <label className="mp-field">
        <span>Créditer mon compte (1 € à 1 000 €)</span>
        <input
          type="text"
          inputMode="decimal"
          placeholder="50,00"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? 'credit-topup-error' : undefined}
        />
      </label>
      <button type="submit" className="mp-btn mp-btn-primary" disabled={redirecting}>
        <span className="material-symbols-outlined" aria-hidden>
          credit_card
        </span>
        {redirecting ? 'Redirection…' : 'Créditer par carte'}
      </button>
      {error ? (
        <p id="credit-topup-error" className="mp-hint mp-credit-topup__error" role="alert">
          {error}
        </p>
      ) : (
        <p className="mp-hint">
          Paiement sécurisé Stripe. Le montant rejoint votre crédit dès que le
          paiement est confirmé.
        </p>
      )}
    </form>
  );
}
