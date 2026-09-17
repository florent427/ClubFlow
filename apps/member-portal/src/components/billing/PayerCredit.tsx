import type { ReactNode } from 'react';
import { formatShortDate } from '../../lib/format';
import {
  payerCreditKpi,
  payerCreditMovementTitle,
  signedEuroCents,
} from '../../lib/payer-credit';
import type {
  ViewerPayerCredit,
  ViewerPayerCreditMovement,
} from '../../lib/viewer-types';

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
