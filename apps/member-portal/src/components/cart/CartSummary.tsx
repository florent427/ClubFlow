import { useMutation } from '@apollo/client/react';
import { useNavigate } from 'react-router-dom';
import {
  VIEWER_ACTIVE_CART,
  VIEWER_MEMBERSHIP_CARTS,
  VIEWER_VALIDATE_CART,
  type Cart,
} from '../../lib/cart-documents';
import { VIEWER_CREATE_INVOICE_CHECKOUT_SESSION } from '../../lib/viewer-documents';
import { formatEuroCents } from '../../lib/format';
import { useToast } from '../ToastProvider';

interface Props {
  cart: Cart;
}

interface CreateCheckoutData {
  viewerCreateInvoiceCheckoutSession: {
    url: string | null;
    sessionId: string | null;
  };
}

export function CartSummary({ cart }: Props) {
  const { showToast } = useToast();
  const navigate = useNavigate();
  const [validate, { loading: validating }] = useMutation(VIEWER_VALIDATE_CART, {
    refetchQueries: [
      { query: VIEWER_ACTIVE_CART },
      { query: VIEWER_MEMBERSHIP_CARTS },
    ],
    awaitRefetchQueries: true,
  });
  const [createCheckout, { loading: redirecting }] =
    useMutation<CreateCheckoutData>(VIEWER_CREATE_INVOICE_CHECKOUT_SESSION);
  const loading = validating || redirecting;

  const blockedByManual = cart.requiresManualAssignmentCount > 0;
  const itemCount = cart.items.length + (cart.pendingItems?.length ?? 0);
  const blockedByEmpty = itemCount === 0;
  // canValidate vient déjà du backend en tenant compte des pendingItems et
  // du flag requiresManualAssignment. On garde un garde-fou local pour le
  // bouton (loading + sécurités).
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
      if (!invoiceId) {
        showToast(
          'Panier validé. Aucune facture à régler n’a été trouvée — contactez le club.',
          'info',
        );
        return;
      }
      // E-commerce flow : on demande tout de suite la session Stripe et on
      // redirige vers le checkout. Si Stripe n’est pas configuré côté club,
      // on tombe en fallback sur la page Mes factures pour que l’utilisateur
      // règle par virement / chèque (instructions affichées sur cette page).
      try {
        const ck = await createCheckout({ variables: { invoiceId } });
        const url = ck.data?.viewerCreateInvoiceCheckoutSession.url ?? null;
        if (url) {
          showToast('Redirection vers le paiement…', 'success');
          window.location.assign(url);
          return;
        }
      } catch (e) {
        // eslint-disable-next-line no-console
        console.warn(
          '[cart-summary] checkout session indisponible',
          e instanceof Error ? e.message : e,
        );
      }
      showToast(
        'Panier validé — facture émise. Choisissez votre mode de règlement.',
        'success',
      );
      void navigate('/factures', { replace: true });
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
  const pendingEstimateTotal = (cart.pendingItems ?? []).reduce(
    (sum, p) => sum + p.estimatedTotalCents,
    0,
  );
  const pendingCount = cart.pendingItems?.length ?? 0;

  return (
    <aside className="mp-cart-summary">
      <h2 className="mp-subtitle">Récapitulatif</h2>

      <dl className="mp-cart-summary__lines">
        {cart.items.length > 0 ? (
          <div>
            <dt>Cotisations confirmées ({cart.items.length})</dt>
            <dd>{formatEuroCents(subscriptionTotal)}</dd>
          </div>
        ) : null}
        {pendingCount > 0 ? (
          <div>
            <dt>
              Inscriptions du panier ({pendingCount})
              <br />
              <small className="mp-hint" style={{ fontWeight: 400 }}>
                estimé — recalculé à la validation
              </small>
            </dt>
            <dd>~{formatEuroCents(pendingEstimateTotal)}</dd>
          </div>
        ) : null}
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
          <dd>
            {formatEuroCents(cart.totalCents + pendingEstimateTotal)}
          </dd>
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
        {validating
          ? 'Validation…'
          : redirecting
            ? 'Redirection…'
            : 'Valider et payer'}
      </button>

      <p className="mp-hint mp-cart-summary__disclaimer">
        En validant, votre facture est émise immédiatement et vous êtes
        redirigé vers le paiement par carte. Aucune action du club n’est
        requise pour confirmer votre adhésion.
      </p>
    </aside>
  );
}
