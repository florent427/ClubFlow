import { createHmac, timingSafeEqual } from 'crypto';
import { Injectable } from '@nestjs/common';

/**
 * Lien signé vers le bon de livraison (ADR-0017).
 *
 * POURQUOI : le bon se téléchargeait par un `fetch` authentifié, puis un lien
 * `download` cliqué par programme sur un Blob. Constaté le 2026-09-13 : le
 * bouton restait sans effet — rien ne s'ouvrait, et aucune erreur. Un onglet
 * ouvert DANS le geste, puis dirigé vers une URL qui porte elle-même son droit
 * de lecture, laisse le navigateur afficher le PDF avec ses propres boutons :
 * enregistrer, imprimer, partager.
 *
 * Le lien lie le CLUB et la COMMANDE : changer l'un ou l'autre invalide la
 * signature, et le contrôleur n'a pas à croire le club annoncé. Il expire
 * vite : recopié hors contexte, il cesse de fonctionner. Clé dérivée de
 * `JWT_SECRET` avec sa propre étiquette, comme les URLs média signées : aucune
 * variable d'environnement à ajouter, et compromettre l'une ne donne pas
 * l'autre.
 */
@Injectable()
export class ShopDeliveryNoteLinkService {
  /** Le temps d'ouvrir le PDF, pas celui de le faire circuler. */
  static readonly TTL_SECONDS = 600;

  private key(): Buffer {
    const secret = process.env.JWT_SECRET ?? 'change-me-in-development';
    return createHmac('sha256', secret)
      .update('shop-delivery-note-link')
      .digest();
  }

  private digest(clubId: string, orderId: string, exp: number): string {
    return createHmac('sha256', this.key())
      .update(`${clubId}.${orderId}.${exp}`)
      .digest('base64url');
  }

  sign(
    clubId: string,
    orderId: string,
    now = Date.now(),
  ): { exp: number; sig: string } {
    const exp =
      Math.floor(now / 1000) + ShopDeliveryNoteLinkService.TTL_SECONDS;
    return { exp, sig: this.digest(clubId, orderId, exp) };
  }

  /**
   * Faux sur tout lien incomplet, expiré, ou dont le club, la commande ou
   * l'échéance ont été modifiés. Comparaison à temps constant : un `===` sur
   * une signature laisse fuiter de quoi la forger.
   */
  verify(
    clubId: string | undefined,
    orderId: string,
    exp: string | undefined,
    sig: string | undefined,
    now = Date.now(),
  ): boolean {
    if (!clubId || !exp || !sig) return false;
    const expNum = Number(exp);
    if (!Number.isInteger(expNum) || expNum * 1000 <= now) return false;
    const attendu = Buffer.from(this.digest(clubId, orderId, expNum));
    const fourni = Buffer.from(sig);
    return attendu.length === fourni.length && timingSafeEqual(attendu, fourni);
  }

  /** URL absolue, prête à ouvrir dans un onglet. */
  url(clubId: string, orderId: string, now = Date.now()): string {
    const base =
      process.env.API_PUBLIC_URL?.replace(/\/+$/, '') ??
      'http://localhost:3000';
    const { exp, sig } = this.sign(clubId, orderId, now);
    const query = new URLSearchParams({ club: clubId, exp: String(exp), sig });
    return `${base}/shop/orders/${encodeURIComponent(orderId)}/delivery-note/signed.pdf?${query.toString()}`;
  }
}
