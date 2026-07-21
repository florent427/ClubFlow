import { useMemo, useState } from 'react';
import { useMutation } from '@apollo/client/react';
import {
  VIEWER_CHECKOUT_SHOP_CART,
  VIEWER_CHECKOUT_SHOP_CART_ON_SITE,
  VIEWER_REPAY_SHOP_ORDER,
} from '../../lib/viewer-documents';
import type {
  ViewerCheckoutShopCartData,
  ViewerCheckoutShopCartOnSiteData,
  ViewerRepayShopOrderData,
} from '../../lib/viewer-types';
import { formatEuroCents } from '../../lib/format';
import { installmentsPreview } from '../../lib/shop-cart';
import { canPayOnSiteAtCheckout } from '../../lib/shop-order-actions';
import { useToast } from '../ToastProvider';

interface Props {
  /** Total TTC dû (panier vendable au checkout, ou total commande au repay). */
  totalCents: number;
  /**
   * Reprise de paiement d'une commande EN ATTENTE : quand renseigné, la modale
   * appelle `viewerRepayShopOrder(orderId)` au lieu du checkout panier. Sinon
   * (undefined) c'est le checkout du panier courant.
   */
  orderId?: string;
  /**
   * Appelé après une validation « Régler sur place » réussie (commande créée
   * en PENDING, panier vidé côté serveur). Le parent y rafraîchit commandes +
   * panier et ferme la modale. Ignoré en mode repay (le bouton n'apparaît pas).
   */
  onOnSitePlaced?: () => void;
  /** Fermeture sans payer. */
  onClose: () => void;
}

/**
 * Choix du règlement de la commande boutique, puis redirection Stripe. Sert le
 * checkout du panier ET la reprise de paiement d'une commande EN ATTENTE
 * (prop `orderId`) : même UI 1×/3×, même redirection, seule la mutation change.
 *
 * Deux points de discipline imposés par le cahier des charges :
 *
 *  1. **Le 3× est arbitré par le SERVEUR.** L'adhérent ne peut pas lire le
 *     seuil du club (`shopInstallmentThresholdCents` est exposé sur le
 *     résolveur ADMIN uniquement). On propose donc toujours le choix 1×/3× et
 *     on laisse le serveur refuser un 3× sous le seuil.
 *  2. **Le message de refus vient du serveur — on l'affiche tel quel.** Rupture
 *     de stock au checkout, 3× indisponible pour ce montant : `e.message` porte
 *     le texte serveur, jamais remplacé par un générique.
 *
 * Redirection identique au paiement de facture (`BillingPage.handlePay`) :
 * `window.location.assign(stripeCheckoutUrl)`. Le retour `?paid=1` /
 * `?canceled=1` sur `/boutique` est géré par `ShopPage` (URL fixée côté
 * serveur) — il marche à l'identique pour le repay.
 */
export function ShopCheckoutModal({
  totalCents,
  orderId,
  onOnSitePlaced,
  onClose,
}: Props) {
  const { showToast } = useToast();
  const [installments, setInstallments] = useState<1 | 3>(1);
  const [serverError, setServerError] = useState<string | null>(null);
  const [checkout, { loading: checkoutLoading }] =
    useMutation<ViewerCheckoutShopCartData>(VIEWER_CHECKOUT_SHOP_CART);
  const [repay, { loading: repayLoading }] =
    useMutation<ViewerRepayShopOrderData>(VIEWER_REPAY_SHOP_ORDER);
  const [checkoutOnSite, { loading: onSiteLoading }] =
    useMutation<ViewerCheckoutShopCartOnSiteData>(
      VIEWER_CHECKOUT_SHOP_CART_ON_SITE,
    );
  // Le libellé « Redirection… » ne concerne QUE la carte ; on distingue donc le
  // chargement Stripe de celui du « sur place » pour ne pas mentir sur l'action.
  const stripeLoading = checkoutLoading || repayLoading;
  const loading = stripeLoading || onSiteLoading;

  // « Régler sur place » : proposé à la validation du panier, jamais en reprise
  // de paiement (mode repay = `orderId` renseigné). Cf. canPayOnSiteAtCheckout.
  const showOnSite = canPayOnSiteAtCheckout(orderId);

  const preview = useMemo(() => installmentsPreview(totalCents), [totalCents]);

  async function handlePay(): Promise<void> {
    if (loading) return;
    setServerError(null);
    try {
      const wantsInstallments = installments === 3;
      // Repay quand une commande est visée ; sinon checkout du panier. Les deux
      // renvoient la même forme, on ne lit que `stripeCheckoutUrl`.
      const stripeCheckoutUrl = orderId
        ? (
            await repay({ variables: { orderId, wantsInstallments } })
          ).data?.viewerRepayShopOrder.stripeCheckoutUrl
        : (
            await checkout({ variables: { wantsInstallments } })
          ).data?.viewerCheckoutShopCart.stripeCheckoutUrl;
      if (!stripeCheckoutUrl) {
        throw new Error(
          'URL de paiement Stripe indisponible. Réessayez plus tard.',
        );
      }
      showToast('Redirection vers le paiement sécurisé…', 'success');
      window.location.assign(stripeCheckoutUrl);
    } catch (e) {
      // Message SERVEUR tel quel (rupture, 3× sous le seuil, Stripe indispo).
      const msg = e instanceof Error ? e.message : 'Paiement indisponible.';
      setServerError(msg);
      showToast(msg, 'error');
    }
  }

  /**
   * « Régler sur place » : valide le panier SANS paiement en ligne. La commande
   * est créée en PENDING et le stock réservé ; aucune redirection Stripe. On
   * délègue au parent le rafraîchissement (commandes + panier vidé) et la
   * fermeture. L'échéancier 1×/3× est ignoré — il ne concerne que la carte. Le
   * message serveur de refus (panier vide, article épuisé) est affiché tel quel.
   */
  async function handlePayOnSite(): Promise<void> {
    if (loading) return;
    setServerError(null);
    try {
      await checkoutOnSite();
      showToast(
        'Commande validée. Réglez sur place au club — elle sera confirmée après paiement.',
        'success',
      );
      onOnSitePlaced?.();
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Validation impossible.';
      setServerError(msg);
      showToast(msg, 'error');
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
        aria-labelledby="shop-checkout-title"
        style={{ maxWidth: 520 }}
      >
        <h2 id="shop-checkout-title" className="mp-modal-title">
          Régler votre commande
        </h2>
        <p className="mp-hint mp-modal-lede">
          Total dû : <strong>{formatEuroCents(totalCents)}</strong>
          <br />
          <small>
            {showOnSite
              ? 'Payez en ligne par carte (Stripe), ou réglez sur place au club : dans ce cas votre commande est validée et le stock réservé, et le club la confirmera une fois le paiement reçu.'
              : 'Paiement sécurisé par carte (Stripe). Votre commande et sa facture sont créées dès la validation du paiement.'}
          </small>
        </p>

        <fieldset className="mp-fieldset">
          <legend className="mp-legend">Échéancier</legend>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: 8,
              marginBottom: 8,
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
                {preview.equal
                  ? `3 × ${formatEuroCents(preview.base)}`
                  : `2 × ${formatEuroCents(preview.base)} puis ${formatEuroCents(preview.last)}`}
              </small>
            </button>
          </div>
          {installments === 3 ? (
            <p className="mp-hint" style={{ fontSize: '0.78rem', margin: 0 }}>
              Le paiement en 3× est soumis à un montant minimum fixé par le
              club. S'il n'est pas atteint, le club vous en informe et vous
              pouvez régler en 1 fois.
            </p>
          ) : null}
        </fieldset>

        {serverError ? (
          <p
            className="mp-product-card__oos"
            role="alert"
            style={{ marginTop: 4 }}
          >
            {serverError}
          </p>
        ) : null}

        <div className="mp-modal-actions" style={{ marginTop: 16 }}>
          <button
            type="button"
            className="mp-btn mp-btn-outline"
            disabled={loading}
            onClick={onClose}
          >
            Annuler
          </button>
          {showOnSite ? (
            <button
              type="button"
              className="mp-btn mp-btn-outline"
              disabled={loading}
              onClick={() => void handlePayOnSite()}
            >
              <span className="material-symbols-outlined" aria-hidden="true">
                storefront
              </span>
              {onSiteLoading ? 'Validation…' : 'Régler sur place'}
            </button>
          ) : null}
          <button
            type="button"
            className="mp-btn mp-btn-primary"
            disabled={loading}
            onClick={() => void handlePay()}
          >
            <span className="material-symbols-outlined" aria-hidden="true">
              credit_card
            </span>
            {stripeLoading ? 'Redirection…' : 'Payer par carte'}
          </button>
        </div>
      </div>
    </>
  );
}
