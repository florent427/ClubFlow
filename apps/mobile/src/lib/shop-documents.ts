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
