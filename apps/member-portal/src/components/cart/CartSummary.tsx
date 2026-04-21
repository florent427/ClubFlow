import { useMutation } from '@apollo/client/react';
import { useNavigate } from 'react-router-dom';
import {
  VIEWER_ACTIVE_CART,
  VIEWER_MEMBERSHIP_CARTS,
  VIEWER_VALIDATE_CART,
  type Cart,
} from '../../lib/cart-documents';
import { formatEuroCents } from '../../lib/format';
import { useToast } from '../ToastProvider';

interface Props {
  cart: Cart;
}

export function CartSummary({ cart }: Props) {
  const { showToast } = useToast();
  const navigate = useNavigate();
  const [validate, { loading }] = useMutation(VIEWER_VALIDATE_CART, {
    refetchQueries: [
      { query: VIEWER_ACTIVE_CART },
      { query: VIEWER_MEMBERSHIP_CARTS },
    ],
    awaitRefetchQueries: true,
  });

  const blockedByManual = cart.requiresManualAssignmentCount > 0;
  const blockedByEmpty = cart.items.length === 0;
  const canValidate =
    cart.canValidate && !blockedByManual && !blockedByEmpty && !loading;

  async function handleValidate(): Promise<void> {
    try {
      const res = await validate({ variables: { cartId: cart.id } });
      const invoiceId =
        res.data && typeof res.data === 'object' && 'viewerValidateMembershipCart' in res.data
          ? (res.data as { viewerValidateMembershipCart: { invoiceId: string | null } })
              .viewerValidateMembershipCart.invoiceId
          : null;
      showToast(
        'Projet validé — facture émise et notification envoyée au payeur.',
        'success',
      );
      if (invoiceId) {
        setTimeout(() => {
          void navigate('/factures', { replace: true });
        }, 800);
      }
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : 'Échec de la validation.',
        'error',
      );
    }
  }

  const subscriptionTotal = cart.items.reduce(
    (sum, it) => sum + it.subscriptionAdjustedCents,
    0,
  );
  const feesTotal = cart.items.reduce(
    (sum, it) => sum + it.oneTimeFeesCents,
    0,
  );
  const discountsTotal = cart.items.reduce(
    (sum, it) => sum + it.exceptionalDiscountCents,
    0,
  );

  return (
    <aside className="mp-cart-summary">
      <h2 className="mp-subtitle">Récapitulatif</h2>

      <dl className="mp-cart-summary__lines">
        <div>
          <dt>Cotisations ({cart.items.length})</dt>
          <dd>{formatEuroCents(subscriptionTotal)}</dd>
        </div>
        {feesTotal > 0 ? (
          <div>
            <dt>Frais uniques</dt>
            <dd>{formatEuroCents(feesTotal)}</dd>
          </div>
        ) : null}
        {discountsTotal > 0 ? (
          <div>
            <dt>Remises exceptionnelles</dt>
            <dd>-{formatEuroCents(discountsTotal)}</dd>
          </div>
        ) : null}
        <div className="mp-cart-summary__total">
          <dt>Total TTC</dt>
          <dd>{formatEuroCents(cart.totalCents)}</dd>
        </div>
      </dl>

      {blockedByManual ? (
        <p className="mp-hint mp-hint--warn">
          {cart.requiresManualAssignmentCount} ligne(s) nécessite(nt) une
          assignation manuelle par le club avant validation.
        </p>
      ) : null}

      {blockedByEmpty ? (
        <p className="mp-hint">
          Ajoutez au moins un membre pour activer la validation.
        </p>
      ) : null}

      <button
        type="button"
        className="mp-btn mp-btn-primary"
        disabled={!canValidate}
        onClick={() => void handleValidate()}
      >
        {loading ? 'Validation…' : 'Valider et payer'}
      </button>

      <p className="mp-hint mp-cart-summary__disclaimer">
        À la validation, une facture est émise et un email de confirmation est
        envoyé au payeur du foyer.
      </p>
    </aside>
  );
}
