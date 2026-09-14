import type { ShopPurchaseOrder, ShopPurchaseOrderStatusGql, ShopSupplier } from './types';

/**
 * Transmission du bon de commande au fournisseur (ADR-0021 §5), telle que le
 * tiroir de commande la montre. Le serveur reste l'autorité : ces règles ne
 * font que choisir les boutons et la pastille.
 */

/** Adresse plausible, comme côté serveur : une faute de frappe ne part pas. */
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** L'adresse où le bon partira ; null si le fournisseur n'en a pas de valide. */
export function supplierOrderEmail(
  supplier: Pick<ShopSupplier, 'email'> | null,
): string | null {
  const email = supplier?.email?.trim() ?? '';
  return EMAIL.test(email) ? email : null;
}

export type PurchaseTransmission =
  | { kind: 'emailed'; at: string; to: string | null }
  | { kind: 'not-emailed' };

/**
 * Un brouillon n'a rien à dire. Un envoi réussi se dit toujours, même une fois
 * la commande close. Une commande encore attendue sans envoi enregistré est
 * « non transmise » ; close, elle n'attend plus rien et se tait.
 */
export function purchaseTransmission(
  order: Pick<ShopPurchaseOrder, 'status' | 'emailedAt' | 'emailedTo'>,
): PurchaseTransmission | null {
  if (order.status === 'DRAFT') return null;
  if (order.emailedAt) return { kind: 'emailed', at: order.emailedAt, to: order.emailedTo };
  if (order.status === 'ORDERED' || order.status === 'PARTIALLY_RECEIVED') {
    return { kind: 'not-emailed' };
  }
  return null;
}

/** Le bon se renvoie tant que la commande est attendue, chez un fournisseur joignable. */
export function canResendPurchaseOrder(order: {
  status: ShopPurchaseOrderStatusGql;
  supplier: Pick<ShopSupplier, 'email'> | null;
}): boolean {
  return (
    (order.status === 'ORDERED' || order.status === 'PARTIALLY_RECEIVED') &&
    supplierOrderEmail(order.supplier) !== null
  );
}
