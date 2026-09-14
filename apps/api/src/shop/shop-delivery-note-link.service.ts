import { createHmac, timingSafeEqual } from 'crypto';
import { Injectable } from '@nestjs/common';

/**
 * Liens signés vers les bons de la boutique : bon de livraison (ADR-0017),
 * bon d'échange (ADR-0020) et bon de commande fournisseur (ADR-0021).
 *
 * POURQUOI : le bon se téléchargeait par un `fetch` authentifié, puis un lien
 * `download` cliqué par programme sur un Blob. Constaté le 2026-09-13 : le
 * bouton restait sans effet — rien ne s'ouvrait, et aucune erreur. Un onglet
 * ouvert DANS le geste, puis dirigé vers une URL qui porte elle-même son droit
 * de lecture, laisse le navigateur afficher le PDF avec ses propres boutons :
 * enregistrer, imprimer, partager.
 *
 * Le lien lie le CLUB et le DOCUMENT : changer l'un ou l'autre invalide la
 * signature, et le contrôleur n'a pas à croire le club annoncé. Il expire
 * vite : recopié hors contexte, il cesse de fonctionner. Clé dérivée de
 * `JWT_SECRET` avec une étiquette PAR SORTE de bon, comme les URLs média
 * signées : aucune variable d'environnement à ajouter, compromettre l'une ne
 * donne pas l'autre, et un lien de bon de livraison ne vaut pas pour un bon
 * d'échange qui porterait le même identifiant.
 */
@Injectable()
export class ShopDeliveryNoteLinkService {
  /** Le temps d'ouvrir le PDF, pas celui de le faire circuler. */
  static readonly TTL_SECONDS = 600;

  private key(purpose: string): Buffer {
    const secret = process.env.JWT_SECRET ?? 'change-me-in-development';
    return createHmac('sha256', secret).update(purpose).digest();
  }

  private digest(
    purpose: string,
    clubId: string,
    id: string,
    exp: number,
  ): string {
    return createHmac('sha256', this.key(purpose))
      .update(`${clubId}.${id}.${exp}`)
      .digest('base64url');
  }

  private signFor(
    purpose: string,
    clubId: string,
    id: string,
    now: number,
  ): { exp: number; sig: string } {
    const exp =
      Math.floor(now / 1000) + ShopDeliveryNoteLinkService.TTL_SECONDS;
    return { exp, sig: this.digest(purpose, clubId, id, exp) };
  }

  /**
   * Faux sur tout lien incomplet, expiré, ou dont le club, le document ou
   * l'échéance ont été modifiés. Comparaison à temps constant : un `===` sur
   * une signature laisse fuiter de quoi la forger.
   */
  private verifyFor(
    purpose: string,
    clubId: string | undefined,
    id: string,
    exp: string | undefined,
    sig: string | undefined,
    now: number,
  ): boolean {
    if (!clubId || !exp || !sig) return false;
    const expNum = Number(exp);
    if (!Number.isInteger(expNum) || expNum * 1000 <= now) return false;
    const attendu = Buffer.from(this.digest(purpose, clubId, id, expNum));
    const fourni = Buffer.from(sig);
    return attendu.length === fourni.length && timingSafeEqual(attendu, fourni);
  }

  private base(): string {
    return (
      process.env.API_PUBLIC_URL?.replace(/\/+$/, '') ?? 'http://localhost:3000'
    );
  }

  // --- Bon de livraison (ADR-0017) ---

  sign(
    clubId: string,
    orderId: string,
    now = Date.now(),
  ): { exp: number; sig: string } {
    return this.signFor('shop-delivery-note-link', clubId, orderId, now);
  }

  verify(
    clubId: string | undefined,
    orderId: string,
    exp: string | undefined,
    sig: string | undefined,
    now = Date.now(),
  ): boolean {
    return this.verifyFor('shop-delivery-note-link', clubId, orderId, exp, sig, now);
  }

  /** URL absolue, prête à ouvrir dans un onglet. */
  url(clubId: string, orderId: string, now = Date.now()): string {
    const { exp, sig } = this.sign(clubId, orderId, now);
    const query = new URLSearchParams({ club: clubId, exp: String(exp), sig });
    return `${this.base()}/shop/orders/${encodeURIComponent(orderId)}/delivery-note/signed.pdf?${query.toString()}`;
  }

  // --- Bon d'échange (ADR-0020) ---

  signExchange(
    clubId: string,
    adjustmentId: string,
    now = Date.now(),
  ): { exp: number; sig: string } {
    return this.signFor('shop-exchange-note-link', clubId, adjustmentId, now);
  }

  verifyExchange(
    clubId: string | undefined,
    adjustmentId: string,
    exp: string | undefined,
    sig: string | undefined,
    now = Date.now(),
  ): boolean {
    return this.verifyFor(
      'shop-exchange-note-link',
      clubId,
      adjustmentId,
      exp,
      sig,
      now,
    );
  }

  /** URL absolue du bon d'échange, prête à ouvrir dans un onglet. */
  exchangeUrl(clubId: string, adjustmentId: string, now = Date.now()): string {
    const { exp, sig } = this.signExchange(clubId, adjustmentId, now);
    const query = new URLSearchParams({ club: clubId, exp: String(exp), sig });
    return `${this.base()}/shop/exchanges/${encodeURIComponent(adjustmentId)}/note/signed.pdf?${query.toString()}`;
  }

  // --- Bon de commande fournisseur (ADR-0021) ---

  signPurchaseOrder(
    clubId: string,
    orderId: string,
    now = Date.now(),
  ): { exp: number; sig: string } {
    return this.signFor('shop-purchase-order-link', clubId, orderId, now);
  }

  verifyPurchaseOrder(
    clubId: string | undefined,
    orderId: string,
    exp: string | undefined,
    sig: string | undefined,
    now = Date.now(),
  ): boolean {
    return this.verifyFor('shop-purchase-order-link', clubId, orderId, exp, sig, now);
  }

  /** URL absolue du bon de commande, prête à ouvrir dans un onglet. */
  purchaseOrderUrl(clubId: string, orderId: string, now = Date.now()): string {
    const { exp, sig } = this.signPurchaseOrder(clubId, orderId, now);
    const query = new URLSearchParams({ club: clubId, exp: String(exp), sig });
    return `${this.base()}/shop/purchase-orders/${encodeURIComponent(orderId)}/purchase-order/signed.pdf?${query.toString()}`;
  }
}
