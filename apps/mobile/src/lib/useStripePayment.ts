import { useApolloClient } from '@apollo/client/react';
import { useCallback } from 'react';
import * as WebBrowser from 'expo-web-browser';
import {
  interpretStripeReturn,
  type StripeReturnOutcome,
} from './shop-payment';
import { VIEWER_SHOP_CART, VIEWER_SHOP_ORDERS } from './shop-documents';

/**
 * Ouvre une session Stripe dans un navigateur INTÉGRÉ qui se referme tout seul
 * dès que Stripe redirige vers `paymentReturnUrl` — ce qui ramène l'adhérent
 * dans l'app (fini l'aller-retour vers le portail web déconnecté).
 *
 * Utilisé à l'identique par le checkout (ShopCartScreen) et la reprise de
 * paiement (ShopCatalogScreen).
 *
 * ⚠️ `paid` = Stripe a accepté, PAS « commande payée en base ». La bascule en
 * PAID est faite par le webhook Stripe (asynchrone), donc quelques secondes
 * plus tard. On refetch quand même `viewerShopOrders`/`viewerShopCart` sur
 * `paid` : au pire la commande est encore PENDING (le refetch suivant la
 * corrigera), jamais on n'affiche un « Payée ! » péremptoire.
 */
export function useStripePayment() {
  const client = useApolloClient();

  return useCallback(
    async (checkout: {
      stripeCheckoutUrl: string;
      paymentReturnUrl: string;
    }): Promise<StripeReturnOutcome> => {
      const res = await WebBrowser.openAuthSessionAsync(
        checkout.stripeCheckoutUrl,
        checkout.paymentReturnUrl,
      );
      const outcome = interpretStripeReturn(res);
      if (outcome === 'paid') {
        // Rafraîchit l'état réel : la commande peut encore être PENDING ici,
        // c'est voulu — on ne ment pas, on laisse le statut serveur trancher.
        await client.refetchQueries({
          include: [VIEWER_SHOP_ORDERS, VIEWER_SHOP_CART],
        });
      }
      return outcome;
    },
    [client],
  );
}
