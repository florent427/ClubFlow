import { useMemo, useState } from 'react';
import { useMutation } from '@apollo/client/react';
import { VIEWER_CHECKOUT_SHOP_CART } from '../../lib/viewer-documents';
import type { ViewerCheckoutShopCartData } from '../../lib/viewer-types';
import { formatEuroCents } from '../../lib/format';
import { installmentsPreview } from '../../lib/shop-cart';
import { useToast } from '../ToastProvider';

interface Props {
  /** Total TTC vendable du panier (fourni par le serveur). */
  totalCents: number;
  /** Fermeture sans payer. */
  onClose: () => void;
}

/**
 * Choix du règlement de la commande boutique, puis redirection Stripe.
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
 * `window.location.assign(stripeCheckoutUrl)`. Le retour est géré par la page
 * de facturation via `?paid=1` / `?canceled=1` (URL fixée côté serveur,
 * partagée avec le paiement de facture).
 */
export function ShopCheckoutModal({ totalCents, onClose }: Props) {
  const { showToast } = useToast();
  const [installments, setInstallments] = useState<1 | 3>(1);
  const [serverError, setServerError] = useState<string | null>(null);
  const [checkout, { loading }] = useMutation<ViewerCheckoutShopCartData>(
    VIEWER_CHECKOUT_SHOP_CART,
  );

  const preview = useMemo(() => installmentsPreview(totalCents), [totalCents]);

  async function handlePay(): Promise<void> {
    if (loading) return;
    setServerError(null);
    try {
      const res = await checkout({
        variables: { wantsInstallments: installments === 3 },
      });
      const data = res.data?.viewerCheckoutShopCart;
      if (!data?.stripeCheckoutUrl) {
        throw new Error(
          'URL de paiement Stripe indisponible. Réessayez plus tard.',
        );
      }
      showToast('Redirection vers le paiement sécurisé…', 'success');
      window.location.assign(data.stripeCheckoutUrl);
    } catch (e) {
      // Message SERVEUR tel quel (rupture, 3× sous le seuil, Stripe indispo).
      const msg = e instanceof Error ? e.message : 'Paiement indisponible.';
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
            Paiement sécurisé par carte (Stripe). Votre commande et sa facture
            sont créées dès la validation du paiement.
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
          <button
            type="button"
            className="mp-btn mp-btn-primary"
            disabled={loading}
            onClick={() => void handlePay()}
          >
            <span className="material-symbols-outlined" aria-hidden="true">
              credit_card
            </span>
            {loading ? 'Redirection…' : 'Payer par carte'}
          </button>
        </div>
      </div>
    </>
  );
}
