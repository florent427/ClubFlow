import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  type Cart,
} from '../../lib/cart-documents';
import { formatEuroCents } from '../../lib/format';
import { PaymentChoiceModal } from './PaymentChoiceModal';

interface Props {
  cart: Cart;
}

export function CartSummary({ cart }: Props) {
  const navigate = useNavigate();
  // La validation du panier (création des Members + Invoice) n'a plus
  // lieu au clic du bouton — uniquement quand l'utilisateur a choisi son
  // mode de règlement dans la modale. Tant qu'il ne choisit rien, le
  // panier reste en OPEN et il peut le modifier.
  const [paymentOpen, setPaymentOpen] = useState<boolean>(false);

  const blockedByManual = cart.requiresManualAssignmentCount > 0;
  const itemCount = cart.items.length + (cart.pendingItems?.length ?? 0);
  const blockedByEmpty = itemCount === 0;
  const canValidate =
    cart.canValidate && !blockedByManual && !blockedByEmpty;

  // Détermine le rythme dominant du panier pour proposer (ou non) le
  // 3×. Règle : si AU MOINS un article du panier est annuel, on
  // autorise le 3× (le payeur peut souhaiter étaler même un panier
  // mixte). Sinon (tout mensuel) → comptant uniquement.
  const hasAnnual =
    cart.items.some((i) => i.billingRhythm === 'ANNUAL') ||
    (cart.pendingItems ?? []).some((p) => p.billingRhythm === 'ANNUAL');
  const dominantRhythm: 'ANNUAL' | 'MONTHLY' = hasAnnual ? 'ANNUAL' : 'MONTHLY';

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
        onClick={() => setPaymentOpen(true)}
      >
        Valider et payer
      </button>

      <p className="mp-hint mp-cart-summary__disclaimer">
        À l’étape suivante, vous choisissez votre mode de règlement
        (carte, chèque, espèces ou virement) et l’échéancier (1× ou 3×).
        Vos fiches adhérent et la facture ne sont créées qu’une fois ce
        choix confirmé.
      </p>

      {paymentOpen ? (
        <PaymentChoiceModal
          cartId={cart.id}
          totalCents={cart.totalCents}
          billingRhythm={dominantRhythm}
          onClose={() => setPaymentOpen(false)}
          onDone={() => {
            setPaymentOpen(false);
            void navigate('/factures', { replace: true });
          }}
        />
      ) : null}
    </aside>
  );
}
