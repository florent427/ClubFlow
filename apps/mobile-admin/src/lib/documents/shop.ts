import { gql } from '@apollo/client';

export const SHOP_PRODUCTS = gql`
  query ShopProducts {
    shopProducts {
      id
      name
      sku
      priceCents
      stock
      active
      imageUrl
      createdAt
    }
  }
`;

export const SHOP_ORDERS = gql`
  query ShopOrders {
    shopOrders {
      id
      memberId
      contactId
      productId
      quantity
      totalCents
      status
      createdAt
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
