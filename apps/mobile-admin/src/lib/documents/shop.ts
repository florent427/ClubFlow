import { gql } from '@apollo/client';

/**
 * `stock` est un champ DÉRIVÉ depuis l'ADR-0012 (somme des `available` des
 * déclinaisons suivies, null = illimité), plus une colonne. On le sélectionne
 * toujours, accompagné des deux indicateurs qui le rendent lisible :
 * `hasVariants` dit si la somme cache plusieurs déclinaisons, et
 * `variantsBelowThreshold` combien d'entre elles sont sous leur seuil — un
 * total de 40 dont 3 tailles à zéro n'est pas un catalogue en bonne santé.
 *
 * L'application mobile LIT ces informations et n'édite jamais les
 * déclinaisons : la matrice, les axes et les prix par déclinaison restent sur
 * l'admin web.
 */
export const SHOP_PRODUCTS = gql`
  query ShopProducts {
    shopProducts {
      id
      name
      sku
      priceCents
      stock
      hasVariants
      variantsBelowThreshold
      active
      imageUrl
      createdAt
    }
  }
`;

/**
 * Une commande porte des LIGNES depuis le passage au multi-lignes : les
 * scalaires `productId` et `quantity` n'existent plus sur `ShopOrder`.
 *
 * Les demander ici faisait échouer la requête à la validation GraphQL — et
 * comme les écrans utilisent `errorPolicy: 'all'`, l'échec se lisait à l'écran
 * comme « aucune commande » au lieu d'une erreur. Deux écrans affichaient donc
 * du vide sans que rien ne le signale.
 *
 * `label` et `unitPriceCents` sont FIGÉS à la commande côté API : ils
 * survivent au renommage comme à la suppression du produit, ce qui évite au
 * détail de recroiser le catalogue pour afficher un intitulé.
 */
export const SHOP_ORDERS = gql`
  query ShopOrders {
    shopOrders {
      id
      memberId
      contactId
      totalCents
      status
      note
      createdAt
      paidAt
      buyerFirstName
      buyerLastName
      lines {
        id
        productId
        variantId
        quantity
        unitPriceCents
        label
      }
    }
  }
`;

export const CREATE_SHOP_PRODUCT = gql`
  mutation CreateShopProduct($input: CreateShopProductInput!) {
    createShopProduct(input: $input) {
      id
      name
      priceCents
    }
  }
`;

export const UPDATE_SHOP_PRODUCT = gql`
  mutation UpdateShopProduct($input: UpdateShopProductInput!) {
    updateShopProduct(input: $input) {
      id
    }
  }
`;

export const MARK_SHOP_ORDER_PAID = gql`
  mutation MarkShopOrderPaid($id: ID!) {
    markShopOrderPaid(id: $id) {
      id
      status
    }
  }
`;

export const CANCEL_SHOP_ORDER = gql`
  mutation CancelShopOrder($id: ID!) {
    cancelShopOrder(id: $id) {
      id
      status
    }
  }
`;

export const DELETE_SHOP_PRODUCT = gql`
  mutation DeleteShopProduct($id: ID!) {
    deleteShopProduct(id: $id)
  }
`;
