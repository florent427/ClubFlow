import { Inject, Injectable, Logger } from '@nestjs/common';
import { ClubSendingDomainService } from '../mail/club-sending-domain.service';
import { MAIL_TRANSPORT } from '../mail/mail.constants';
import type { MailTransport } from '../mail/mail-transport.interface';
import { PrismaService } from '../prisma/prisma.service';

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Une ligne du récapitulatif envoyé au club. */
export type LowStockItem = {
  productName: string;
  label: string | null;
  sku: string | null;
  available: number;
  reorderThreshold: number;
  reorderTargetQty: number | null;
};

/**
 * Alerte de réapprovisionnement boutique (ADR-0012 §7).
 *
 * Calqué sur `PaymentScheduleNotifierService` : destinataire `club.contactEmail`,
 * profil d'envoi vérifié, et TOUTE la méthode dans un try/catch journalisé.
 *
 * Le retour booléen n'est pas décoratif : l'appelant a déjà POSÉ le marqueur
 * anti-spam avant d'appeler ici, donc il doit pouvoir compter les alertes
 * réclamées puis perdues. Sans ce retour, une panne SMTP prolongée éteindrait
 * les alertes de tous les clubs en silence.
 */
@Injectable()
export class ShopLowStockNotifierService {
  private readonly logger = new Logger(ShopLowStockNotifierService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly domains: ClubSendingDomainService,
    @Inject(MAIL_TRANSPORT) private readonly transport: MailTransport,
  ) {}

  /**
   * UN SEUL courrier groupé par club et par passage.
   *
   * Un mail par variante ferait d'un inventaire de rentrée — où tout passe
   * sous le seuil le même jour — quarante messages, que le trésorier
   * classerait en indésirables avant d'en lire trois.
   *
   * @returns true si le courrier est parti.
   */
  async notifyLowStock(clubId: string, items: LowStockItem[]): Promise<boolean> {
    if (items.length === 0) return true;
    try {
      const club = await this.prisma.club.findUnique({
        where: { id: clubId },
        select: { name: true, contactEmail: true },
      });
      if (!club) {
        this.logger.warn(
          `[boutique] alerte de stock impossible : club ${clubId} introuvable.`,
        );
        return false;
      }
      const to = club.contactEmail;
      if (!to) {
        // Explicite à dessein : sans adresse de contact, le club ne saura
        // jamais qu'il est en rupture, et rien d'autre ne le signalerait.
        this.logger.warn(
          `[boutique] ${items.length} déclinaison(s) sous seuil pour le club ${clubId}, ` +
            `mais aucun e-mail de contact — le bureau n'est pas averti.`,
        );
        return false;
      }

      const profile = await this.domains.getVerifiedMailProfile(
        clubId,
        'transactional',
      );

      const name = (i: LowStockItem) =>
        i.label ? `${i.productName} — ${i.label}` : i.productName;
      const target = (i: LowStockItem) =>
        i.reorderTargetQty !== null ? `${i.reorderTargetQty}` : '—';

      const rows = items
        .map(
          (i) =>
            `<tr><td>${escapeHtml(name(i))}</td>` +
            `<td>${escapeHtml(i.sku ?? '—')}</td>` +
            `<td align="right"><strong>${i.available}</strong></td>` +
            `<td align="right">${i.reorderThreshold}</td>` +
            `<td align="right">${target(i)}</td></tr>`,
        )
        .join('');
      const lines = items
        .map(
          (i) =>
            `  - ${name(i)} : ${i.available} en stock (seuil ${i.reorderThreshold}` +
            `${i.reorderTargetQty !== null ? `, à recommander : ${i.reorderTargetQty}` : ''})`,
        )
        .join('\n');

      await this.transport.sendEmail({
        clubId,
        kind: 'transactional',
        from: profile.from,
        to,
        subject:
          items.length === 1
            ? `Stock bas — ${name(items[0]!)}`
            : `Stock bas — ${items.length} articles à réapprovisionner`,
        html: `
          <p>Bonjour,</p>
          <p>${
            items.length === 1
              ? 'Un article de votre boutique est passé'
              : `${items.length} articles de votre boutique sont passés`
          } sous son seuil de réapprovisionnement :</p>
          <table cellpadding="6" style="border-collapse:collapse">
            <tr>
              <th align="left">Article</th><th align="left">Référence</th>
              <th align="right">Restant</th><th align="right">Seuil</th>
              <th align="right">À recommander</th>
            </tr>
            ${rows}
          </table>
          <p>Ce message n'est envoyé qu'une fois par passage sous le seuil :
          vous ne recevrez pas de rappel tant que le stock ne sera pas remonté.</p>
          <p>Cordialement,<br>${escapeHtml(club.name)}</p>
        `,
        text: `Bonjour,

${items.length === 1 ? 'Un article de votre boutique est passé' : `${items.length} articles de votre boutique sont passés`} sous son seuil de réapprovisionnement :

${lines}

Ce message n'est envoyé qu'une fois par passage sous le seuil : vous ne recevrez pas de rappel tant que le stock ne sera pas remonté.

${club.name}`,
      });
      return true;
    } catch (err) {
      // Volontairement avalé — mais JAMAIS silencieux : le marqueur anti-spam
      // a déjà été posé, donc ces alertes-là sont définitivement perdues. Ce
      // log est la seule trace qu'il en reste.
      this.logger.error(
        `[boutique] alerte de stock NON ENVOYÉE pour le club ${clubId} ` +
          `(${items.length} déclinaison(s)) : ${(err as Error).message}`,
      );
      return false;
    }
  }
}
