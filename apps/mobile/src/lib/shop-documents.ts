import { gql } from '@apollo/client';

/**
 * Boutique — opérations ADHÉRENT (ADR-0012).
 *
 * Trois opérations, toutes portées par `ShopViewerResolver` côté API
 * (`apps/api/src/shop/shop.resolver.ts`) : `viewerShopProducts`,
 * `viewerShopOrders`, `viewerPlaceShopOrder`. Ce résolveur est gardé par
 * `GqlJwtAuthGuard + ClubContextGuard + ViewerActiveProfileGuard +
 * ClubModuleEnabledGuard` — jamais par `ClubAdminRoleGuard`. Aucune
 * opération du `ShopAdminResolver` (déclinaisons, mouvements de stock,
 * fournisseurs, commandes d'appro, seuils) n'a sa place ici : appelée
 * depuis le mobile elle échouerait à l'exécution, sans que le type-check
 * le voie.
 *
 * ─────────────────────────────────────────────────────────────────────
 * CONFIDENTIALITÉ DU STOCK — la contrainte n°1 de ce fichier
 * ─────────────────────────────────────────────────────────────────────
 * On ne sélectionne volontairement AUCUN compteur : ni `stock`, ni
 * `available`, `onHand`, `reorderThreshold`, `onOrder`, `belowThreshold`,
 * `variantsBelowThreshold`, `avgCostCents`, `marginCents`, `marginRate`,
 * `stockValueCents`. Sur le chemin public l'API les renvoie tous à `null`
 * (`shapeProduct({ withQuantities: false })`), y compris les champs
 * DÉRIVÉS des quantités — c'est un correctif de sécurité : un adhérent
 * muni de son JWT pouvait lire le stock exact via `viewerShopProducts {
 * stock }`. Ne pas sélectionner un champ ne protège rien ; c'est le
 * serveur qui tient la garantie. Les sélectionner ici ne « percerait »
 * donc rien, mais inviterait à afficher un chiffre — et le jour où le
 * masquage serveur régresse, l'écran l'exposerait aussitôt.
 *
 * La seule information de stock transmise à l'adhérent est le booléen
 * `inStock` : « Disponible » ou « Épuisé », jamais « il en reste 2 ».
 */
const VIEWER_SHOP_PRODUCT_FIELDS = `
  id
  sku
  name
  description
  imageUrl
  priceCents
  hasVariants
  priceFromCents
  active
  variants {
    id
    isDefault
    label
    sku
    unitPriceCents
    inStock
  }
`;

const VIEWER_SHOP_ORDER_FIELDS = `
  id
  status
  totalCents
  note
  createdAt
  paidAt
  payableOnline
  lines {
    id
    productId
    quantity
    unitPriceCents
    label
  }
`;

export const VIEWER_SHOP_PRODUCTS = gql`
  query ViewerShopProducts {
    viewerShopProducts {
      ${VIEWER_SHOP_PRODUCT_FIELDS}
    }
  }
`;

export const VIEWER_SHOP_ORDERS = gql`
  query ViewerShopOrders {
    viewerShopOrders {
      ${VIEWER_SHOP_ORDER_FIELDS}
    }
  }
`;

export const VIEWER_PLACE_SHOP_ORDER = gql`
  mutation ViewerPlaceShopOrder($input: PlaceShopOrderInput!) {
    viewerPlaceShopOrder(input: $input) {
      ${VIEWER_SHOP_ORDER_FIELDS}
    }
  }
`;

/**
 * ─────────────────────────────────────────────────────────────────────
 * PANIER BOUTIQUE — opérations ADHÉRENT (ADR-0012)
 * ─────────────────────────────────────────────────────────────────────
 * Cinq opérations panier + le checkout. Toutes portées par des résolveurs
 * VIEWER, jamais admin :
 *   - `viewerShopCart`, `viewerAddShopCartItem`,
 *     `viewerSetShopCartItemQuantity`, `viewerRemoveShopCartItem`,
 *     `viewerClearShopCart` vivent sur `ShopViewerResolver`
 *     (`shop.resolver.ts`), gardé par `GqlJwtAuthGuard + ClubContextGuard +
 *     ViewerActiveProfileGuard + ClubModuleEnabledGuard` (+ gating SHOP).
 *   - `viewerCheckoutShopCart` vit sur `ViewerResolver`
 *     (`viewer.resolver.ts`), mêmes gardes viewer (+ gating SHOP), car le
 *     checkout a besoin de Stripe côté couche viewer.
 * Aucune n'est gardée par `ClubAdminRoleGuard`.
 *
 * CONFIDENTIALITÉ DU STOCK — on ne sélectionne AUCUN compteur. La ligne
 * expose `inStock` (booléen) et `unavailable` (booléen). Jamais une
 * quantité. « Disponible » / « Épuisé », jamais « il en reste 2 ».
 */
const VIEWER_SHOP_CART_FIELDS = `
  id
  totalCents
  items {
    id
    variantId
    productId
    label
    imageUrl
    quantity
    unitPriceCents
    lineTotalCents
    inStock
    unavailable
  }
`;

export const VIEWER_SHOP_CART = gql`
  query ViewerShopCart {
    viewerShopCart {
      ${VIEWER_SHOP_CART_FIELDS}
    }
  }
`;

export const VIEWER_ADD_SHOP_CART_ITEM = gql`
  mutation ViewerAddShopCartItem($input: AddShopCartItemInput!) {
    viewerAddShopCartItem(input: $input) {
      ${VIEWER_SHOP_CART_FIELDS}
    }
  }
`;

export const VIEWER_SET_SHOP_CART_ITEM_QUANTITY = gql`
  mutation ViewerSetShopCartItemQuantity($input: SetShopCartItemQuantityInput!) {
    viewerSetShopCartItemQuantity(input: $input) {
      ${VIEWER_SHOP_CART_FIELDS}
    }
  }
`;

export const VIEWER_REMOVE_SHOP_CART_ITEM = gql`
  mutation ViewerRemoveShopCartItem($itemId: ID!) {
    viewerRemoveShopCartItem(itemId: $itemId) {
      ${VIEWER_SHOP_CART_FIELDS}
    }
  }
`;

export const VIEWER_CLEAR_SHOP_CART = gql`
  mutation ViewerClearShopCart {
    viewerClearShopCart {
      ${VIEWER_SHOP_CART_FIELDS}
    }
  }
`;

/**
 * Champs communs au checkout ET au repay : les deux renvoient un
 * `ShopCartCheckout`. `paymentReturnUrl` est le préfixe d'URL de SUCCÈS posé
 * sur la session Stripe (`…/boutique?paid=1`) : ce N'EST PAS l'URL à ouvrir
 * (`stripeCheckoutUrl`), c'est celle que `WebBrowser.openAuthSessionAsync`
 * surveille pour refermer le navigateur intégré dès le retour de Stripe.
 */
const VIEWER_SHOP_CART_CHECKOUT_FIELDS = `
  orderId
  invoiceId
  totalCents
  installmentsCount
  stripeCheckoutUrl
  paymentReturnUrl
`;

/**
 * Checkout : transforme le panier en commande + facture et renvoie l'URL
 * Stripe hébergée. `wantsInstallments=true` DEMANDE le 3× — le serveur le
 * REFUSE (BadRequest) si le total est sous le seuil du club, ou si le 3× est
 * désactivé. `installmentsCount` reflète ce que le serveur a ACCORDÉ (1 ou 3).
 */
export const VIEWER_CHECKOUT_SHOP_CART = gql`
  mutation ViewerCheckoutShopCart($wantsInstallments: Boolean) {
    viewerCheckoutShopCart(wantsInstallments: $wantsInstallments, nativeApp: true) {
      ${VIEWER_SHOP_CART_CHECKOUT_FIELDS}
    }
  }
`;

/**
 * Validation « régler sur place » : transforme le panier en commande PENDING et
 * RÉSERVE le stock (même réservation atomique que le checkout Stripe), mais SANS
 * paiement en ligne — aucune facture ni session Stripe. Aucun argument.
 * L'adhérent règlera au club (espèces/chèque) ; le club marquera la commande
 * payée plus tard. Le panier est vidé côté serveur. Renvoie la commande créée
 * (`status: PENDING`), même forme que `viewerShopOrders`. Porté par
 * `ShopViewerResolver.viewerCheckoutShopCartOnSite` (gardes viewer + gating
 * SHOP), jamais admin.
 */
export const VIEWER_CHECKOUT_SHOP_CART_ON_SITE = gql`
  mutation ViewerCheckoutShopCartOnSite {
    viewerCheckoutShopCartOnSite {
      ${VIEWER_SHOP_ORDER_FIELDS}
    }
  }
`;

/**
 * Reprise de paiement d'une commande restée EN ATTENTE (PENDING) dont la
 * facture est encore ouverte : crée une NOUVELLE session Stripe sur la facture
 * EXISTANTE (ni recréation de commande, ni re-réservation de stock). Même forme
 * de retour que le checkout, même arbitrage serveur du 3×. Porté par
 * `ViewerResolver.viewerRepayShopOrder` (gardes viewer + gating SHOP).
 */
export const VIEWER_REPAY_SHOP_ORDER = gql`
  mutation ViewerRepayShopOrder($orderId: ID!, $wantsInstallments: Boolean) {
    viewerRepayShopOrder(orderId: $orderId, wantsInstallments: $wantsInstallments, nativeApp: true) {
      ${VIEWER_SHOP_CART_CHECKOUT_FIELDS}
    }
  }
`;

/**
 * Annule une commande EN ATTENTE (PENDING) du viewer et LIBÈRE le stock
 * réservé (la facture liée passe à VOID, idempotent). Renvoie la commande avec
 * son nouveau `status` (CANCELLED). Porté par
 * `ShopViewerResolver.viewerCancelShopOrder` (gardes viewer + gating SHOP).
 */
export const VIEWER_CANCEL_SHOP_ORDER = gql`
  mutation ViewerCancelShopOrder($orderId: ID!) {
    viewerCancelShopOrder(orderId: $orderId) {
      ${VIEWER_SHOP_ORDER_FIELDS}
    }
  }
`;

/**
 * Modules activés du club. Query `clubModules`, gardée seulement par
 * `GqlJwtAuthGuard + ClubContextGuard` (`club-modules.resolver.ts:21`) :
 * accessible à un adhérent. Sert à masquer l'entrée « Boutique » du menu
 * quand le club n'a pas le module SHOP — sans quoi la vignette mènerait à
 * un écran que `ClubModuleEnabledGuard` refuse.
 */
export const VIEWER_CLUB_MODULES = gql`
  query ViewerClubModules {
    clubModules {
      moduleCode
      enabled
    }
  }
`;

/**
 * Déclinaison vendable. `available`, `onHand` et `reorderThreshold` ne
 * sont volontairement PAS typés : l'API les renvoie à null côté adhérent,
 * les déclarer ici inviterait à les afficher.
 */
export type ViewerShopVariant = {
  id: string;
  /** Vraie pour l'unique déclinaison d'un produit qui n'en a pas. */
  isDefault: boolean;
  /** « L / Rouge ». Null pour la déclinaison par défaut. */
  label: string | null;
  sku: string | null;
  /** Prix réellement appliqué : celui de la déclinaison, sinon du produit. */
  unitPriceCents: number;
  /** Seule information de stock transmise à l'adhérent. */
  inStock: boolean;
};

export type ViewerShopProduct = {
  id: string;
  sku: string | null;
  name: string;
  description: string | null;
  imageUrl: string | null;
  priceCents: number;
  /** Vrai si le produit a de vraies déclinaisons (hors celle par défaut). */
  hasVariants: boolean;
  /** Prix le plus bas parmi les déclinaisons — « à partir de X € ». */
  priceFromCents: number;
  /** Toujours au moins une (celle par défaut si le produit est simple). */
  variants: ViewerShopVariant[];
  active: boolean;
};

export type ViewerShopOrderStatus = 'PENDING' | 'PAID' | 'CANCELLED';

export type ViewerShopOrderLine = {
  id: string;
  productId: string;
  quantity: number;
  unitPriceCents: number;
  /** Libellé FIGÉ à la commande, déclinaison comprise. */
  label: string;
};

export type ViewerShopOrder = {
  id: string;
  status: ViewerShopOrderStatus;
  totalCents: number;
  note: string | null;
  createdAt: string;
  paidAt: string | null;
  /** Vrai si la commande porte une facture ouverte (payable en ligne). */
  payableOnline: boolean;
  lines: ViewerShopOrderLine[];
};

export type ViewerShopProductsData = {
  viewerShopProducts: ViewerShopProduct[];
};
export type ViewerShopOrdersData = { viewerShopOrders: ViewerShopOrder[] };
export type ViewerPlaceShopOrderData = {
  viewerPlaceShopOrder: ViewerShopOrder;
};

export type ViewerClubModulesData = {
  clubModules: Array<{ moduleCode: string; enabled: boolean }>;
};

/**
 * Ligne de panier vue par l'adhérent. `available`, `onHand`, etc. ne sont
 * volontairement PAS typés : le chemin viewer les renvoie null et les
 * déclarer inviterait à afficher une quantité. Seuls `inStock` et
 * `unavailable` (booléens) informent sur la disponibilité.
 */
export type ShopCartItem = {
  id: string;
  variantId: string;
  productId: string;
  /** Libellé figé « Produit — Taille / Couleur ». */
  label: string;
  imageUrl: string | null;
  quantity: number;
  unitPriceCents: number;
  lineTotalCents: number;
  /** Seule information de stock transmise : « Disponible » / « Épuisé ». */
  inStock: boolean;
  /** Produit ou déclinaison désactivé après l'ajout au panier. */
  unavailable: boolean;
};

export type ShopCart = {
  /** Chaîne vide tant que le panier n'a jamais été matérialisé en base. */
  id: string;
  totalCents: number;
  items: ShopCartItem[];
};

/** Résultat du checkout : commande + facture + URL Stripe hébergée. */
export type ViewerShopCartCheckout = {
  orderId: string;
  invoiceId: string;
  totalCents: number;
  /** Ce que le SERVEUR a accordé (1 ou 3), pas ce qui a été demandé. */
  installmentsCount: number;
  /** URL Stripe hébergée à OUVRIR. */
  stripeCheckoutUrl: string;
  /**
   * Préfixe d'URL de succès posé sur la session (`…/boutique?paid=1`). Ce
   * n'est PAS l'URL à ouvrir : c'est celle que `openAuthSessionAsync` surveille
   * pour refermer le navigateur intégré et ramener dans l'app.
   */
  paymentReturnUrl: string;
};

export type ViewerShopCartData = { viewerShopCart: ShopCart };
export type ViewerAddShopCartItemData = { viewerAddShopCartItem: ShopCart };
export type ViewerSetShopCartItemQuantityData = {
  viewerSetShopCartItemQuantity: ShopCart;
};
export type ViewerRemoveShopCartItemData = {
  viewerRemoveShopCartItem: ShopCart;
};
export type ViewerClearShopCartData = { viewerClearShopCart: ShopCart };
export type ViewerCheckoutShopCartData = {
  viewerCheckoutShopCart: ViewerShopCartCheckout;
};
export type ViewerCheckoutShopCartOnSiteData = {
  viewerCheckoutShopCartOnSite: ViewerShopOrder;
};
export type ViewerRepayShopOrderData = {
  viewerRepayShopOrder: ViewerShopCartCheckout;
};
export type ViewerCancelShopOrderData = {
  viewerCancelShopOrder: ViewerShopOrder;
};
