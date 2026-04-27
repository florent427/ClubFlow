import { useState } from 'react';
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
import { PaymentChoiceModal } from './PaymentChoiceModal';

interface Props {
  cart: Cart;
}

interface ValidateData {
  viewerValidateMembershipCart: {
    invoiceId: string | null;
    totalCents: number;
  };
}

export function CartSummary({ cart }: Props) {
  const { showToast } = useToast();
  const navigate = useNavigate();
  const [validate, { loading: validating }] = useMutation<ValidateData>(
    VIEWER_VALIDATE_CART,
    {
      refetchQueries: [
        { query: VIEWER_ACTIVE_CART },
        { query: VIEWER_MEMBERSHIP_CARTS },
      ],
      awaitRefetchQueries: true,
    },
  );

  const [paymentInvoiceId, setPaymentInvoiceId] = useState<string | null>(null);
  const [paymentTotalCents, setPaymentTotalCents] = useState<number>(0);

  const blockedByManual = cart.requiresManualAssignmentCount > 0;
  const itemCount = cart.items.length + (cart.pendingItems?.length ?? 0);
  const blockedByEmpty = itemCount === 0;
  const canValidate =
    cart.canValidate && !blockedByManual && !blockedByEmpty && !validating;

  // ----------------------------------------------------------------
  // Détermine le rythme dominant du panier pour proposer (ou non) le
  // 3×. Règle pragmatique : si AU MOINS un article du panier est
  // annuel, on autorise le 3× (le payeur peut souhaiter étaler même
  // un panier mixte). Sinon (tout mensuel) → comptant uniquement.
  // ----------------------------------------------------------------
  const hasAnnual =
    cart.items.some((i) => i.billingRhythm === 'ANNUAL') ||
    (cart.pendingItems ?? []).some((p) => p.billingRhythm === 'ANNUAL');
  const dominantRhythm: 'ANNUAL' | 'MONTHLY' = hasAnnual ? 'ANNUAL' : 'MONTHLY';

  async function handleValidate(): Promise<void> {
    try {
      const res = await validate({ variables: { cartId: cart.id } });
      const payload = res.data?.viewerValidateMembershipCart ?? null;
      const invoiceId = payload?.invoiceId ?? null;
      const totalCents = payload?.totalCents ?? cart.totalCents;
      if (!invoiceId) {
        showToast(
          'Panier validé. Aucune facture à régler n’a été trouvée — contactez le club.',
          'info',
        );
        return;
      }
      // Au lieu de rediriger directement vers Stripe, on ouvre la
      // modale de choix : carte / chèque / espèces / virement, et 1×
      // ou 3× pour les paniers annuels.
      setPaymentInvoiceId(invoiceId);
      setPaymentTotalCents(totalCents);
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
            <dt>Inscriptions du panier ({pendingCount})</dt>
            <dd>{formatEuroCents(pendingEstimateTotal)}</dd>
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
          <dd>{formatEuroCents(cart.totalCents)}</dd>
        </div>
      </dl>

      {blockedByEmpty ? (
        <p className="mp-hint">
          Ajoutez au moins un membre pour activer la validation.
        </p>
      ) : null}

      {blockedByManual ? (
        <p className="mp-hint mp-hint--warn">
          {cart.requiresManualAssignmentCount} ligne(s) du panier sans
          formule sélectionnée. Modifiez ou supprimez-les pour finaliser
          votre commande.
        </p>
      ) : null}

      <button
        type="button"
        className="mp-btn mp-btn-primary"
        disabled={!canValidate}
        onClick={() => void handleValidate()}
      >
        {validating ? 'Validation…' : 'Valider et payer'}
      </button>

      <p className="mp-hint mp-cart-summary__disclaimer">
        À la validation, vous choisissez votre mode de règlement (carte,
        chèque, espèces ou virement) et l’échéancier (1× ou 3×). Aucune
        intervention du club n’est requise pour confirmer votre adhésion.
      </p>

      {paymentInvoiceId ? (
        <PaymentChoiceModal
          invoiceId={paymentInvoiceId}
          totalCents={paymentTotalCents}
          billingRhythm={dominantRhythm}
          onClose={() => {
            setPaymentInvoiceId(null);
            // Le panier est déjà validé en BDD ; on renvoie l'utilisateur
            // vers la liste des factures pour qu'il puisse reprendre le
            // paiement plus tard.
            void navigate('/factures', { replace: true });
          }}
          onDone={() => {
            setPaymentInvoiceId(null);
            void navigate('/factures', { replace: true });
          }}
        />
      ) : null}
    </aside>
  );
}
