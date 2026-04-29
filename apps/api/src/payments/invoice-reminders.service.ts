import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { InvoiceStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ClubSendingDomainService } from '../mail/club-sending-domain.service';
import { MAIL_TRANSPORT } from '../mail/mail.constants';
import { Inject } from '@nestjs/common';
import type { MailTransport } from '../mail/mail-transport.interface';
import { invoicePaymentTotals } from './invoice-totals';

/**
 * Relance des factures impayées (dunning).
 *
 * Règles métier :
 *  - Une facture est réputée "en retard" si elle est OPEN, balance > 0,
 *    et `dueAt` est dépassée d'au moins {@link OVERDUE_GRACE_DAYS} jours.
 *  - On ne peut envoyer qu'une seule relance tous les
 *    {@link MIN_REMINDER_INTERVAL_DAYS} jours par facture.
 *  - L'historique de relance est conservé via `Invoice.lastRemindedAt`
 *    (mis à jour à chaque envoi). Un futur log détaillé pourra réutiliser
 *    ces invariants.
 */

/** Nombre de jours après `dueAt` à partir desquels la facture est "en retard". */
export const OVERDUE_GRACE_DAYS = 30;
/** Intervalle minimum entre 2 relances pour une même facture. */
export const MIN_REMINDER_INTERVAL_DAYS = 30;

const DAY_MS = 86_400_000;

@Injectable()
export class InvoiceRemindersService {
  private readonly logger = new Logger('InvoiceRemindersService');

  constructor(
    private readonly prisma: PrismaService,
    private readonly domains: ClubSendingDomainService,
    @Inject(MAIL_TRANSPORT) private readonly transport: MailTransport,
  ) {}

  /**
   * Liste les factures OPEN considérées en retard pour un club :
   * `dueAt` dépassé d'au moins OVERDUE_GRACE_DAYS jours et balance > 0.
   * Retourne aussi l'historique de relance (lastRemindedAt) et un flag
   * `canSendReminder` selon MIN_REMINDER_INTERVAL_DAYS.
   */
  async listOverdue(clubId: string): Promise<
    Array<{
      invoiceId: string;
      label: string;
      dueAt: Date | null;
      balanceCents: number;
      payerEmail: string | null;
      payerName: string | null;
      lastRemindedAt: Date | null;
      canSendReminder: boolean;
      nextReminderAvailableAt: Date | null;
    }>
  > {
    const now = new Date();
    const overdueCutoff = new Date(now.getTime() - OVERDUE_GRACE_DAYS * DAY_MS);
    const invoices = await this.prisma.invoice.findMany({
      where: {
        clubId,
        status: InvoiceStatus.OPEN,
        // "En retard" = dueAt définie ET dépassée de >= GRACE jours.
        dueAt: { lt: overdueCutoff },
      },
      orderBy: { dueAt: 'asc' },
      take: 200,
      include: {
        payments: true,
        family: {
          include: {
            familyMembers: {
              include: { contact: { include: { user: true } }, member: true },
            },
          },
        },
      },
    });
    return invoices
      .map((inv) => {
        const paid = inv.payments.reduce((s, p) => s + p.amountCents, 0);
        const { balanceCents } = invoicePaymentTotals(inv.amountCents, paid);
        if (balanceCents <= 0) return null;
        const payer = inv.family?.familyMembers.find(
          (fm) => fm.linkRole === 'PAYER',
        );
        const payerEmail =
          payer?.contact?.user?.email ??
          payer?.member?.email ??
          null;
        const first = payer?.contact?.firstName ?? payer?.member?.firstName ?? null;
        const last = payer?.contact?.lastName ?? payer?.member?.lastName ?? null;
        const payerName = [first, last].filter(Boolean).join(' ') || null;
        const last30 = inv.lastRemindedAt
          ? inv.lastRemindedAt.getTime() >
            now.getTime() - MIN_REMINDER_INTERVAL_DAYS * DAY_MS
          : false;
        const canSendReminder = !last30 && payerEmail !== null;
        const nextReminderAvailableAt =
          last30 && inv.lastRemindedAt
            ? new Date(
                inv.lastRemindedAt.getTime() +
                  MIN_REMINDER_INTERVAL_DAYS * DAY_MS,
              )
            : null;
        return {
          invoiceId: inv.id,
          label: inv.label,
          dueAt: inv.dueAt,
          balanceCents,
          payerEmail,
          payerName,
          lastRemindedAt: inv.lastRemindedAt,
          canSendReminder,
          nextReminderAvailableAt,
        };
      })
      .filter((r): r is NonNullable<typeof r> => r !== null);
  }

  /** Envoie un mail de relance à l'adresse du payeur. */
  async sendReminder(clubId: string, invoiceId: string): Promise<{ sentTo: string }> {
    const invoice = await this.prisma.invoice.findFirst({
      where: { id: invoiceId, clubId, status: InvoiceStatus.OPEN },
      include: {
        payments: true,
        club: { select: { name: true } },
        family: {
          include: {
            familyMembers: {
              include: { contact: { include: { user: true } }, member: true },
            },
          },
        },
      },
    });
    if (!invoice) {
      throw new BadRequestException(
        'Facture introuvable ou déjà réglée.',
      );
    }
    const paid = invoice.payments.reduce((s, p) => s + p.amountCents, 0);
    const { balanceCents } = invoicePaymentTotals(invoice.amountCents, paid);
    if (balanceCents <= 0) {
      throw new BadRequestException('Facture soldée — rien à relancer.');
    }

    // Vérifie qu'on n'a pas déjà relancé dans les 30 derniers jours.
    const now = new Date();
    if (
      invoice.lastRemindedAt &&
      invoice.lastRemindedAt.getTime() >
        now.getTime() - MIN_REMINDER_INTERVAL_DAYS * DAY_MS
    ) {
      const next = new Date(
        invoice.lastRemindedAt.getTime() +
          MIN_REMINDER_INTERVAL_DAYS * DAY_MS,
      );
      const daysLeft = Math.max(
        1,
        Math.ceil((next.getTime() - now.getTime()) / DAY_MS),
      );
      throw new BadRequestException(
        `Une relance a déjà été envoyée le ${invoice.lastRemindedAt.toLocaleDateString('fr-FR')}. Prochaine relance possible dans ${daysLeft} jour${daysLeft > 1 ? 's' : ''}.`,
      );
    }
    const payer = invoice.family?.familyMembers.find(
      (fm) => fm.linkRole === 'PAYER',
    );
    const payerEmail = payer?.contact?.user?.email ?? payer?.member?.email;
    if (!payerEmail) {
      throw new BadRequestException(
        'Aucun e-mail payeur connu pour cette facture.',
      );
    }
    const payerFirstName =
      payer?.contact?.firstName ?? payer?.member?.firstName ?? 'Bonjour';

    const portalUrl = process.env.MEMBER_PORTAL_ORIGIN ?? 'http://localhost:5174';
    const invoiceUrl = `${portalUrl}/factures/${invoice.id}`;
    const amountEuros = (balanceCents / 100).toFixed(2).replace('.', ',');

    const profile = await this.domains.getVerifiedMailProfile(
      clubId,
      'transactional',
    );
    const subject = `Rappel de règlement — ${invoice.label}`;
    const html = `
      <p>Bonjour ${escapeHtml(payerFirstName)},</p>
      <p>Nous avons constaté qu'une somme de <strong>${amountEuros} €</strong>
      reste due sur votre facture <em>${escapeHtml(invoice.label)}</em>${
        invoice.dueAt
          ? ` (échéance ${invoice.dueAt.toLocaleDateString('fr-FR')})`
          : ''
      }.</p>
      <p>Vous pouvez régler en ligne via votre espace membre :
        <a href="${invoiceUrl}">Ouvrir la facture</a>
      </p>
      <p>Si vous avez déjà réglé, merci d'ignorer ce message — nous mettons
      à jour la facture au plus vite.</p>
      <p>Cordialement,<br>${escapeHtml(invoice.club.name)}</p>
    `;
    const text = `Bonjour ${payerFirstName},

Un solde de ${amountEuros} € reste dû sur votre facture « ${invoice.label} »${
      invoice.dueAt
        ? ` (échéance ${invoice.dueAt.toLocaleDateString('fr-FR')})`
        : ''
    }.
Régler en ligne : ${invoiceUrl}

${invoice.club.name}`;

    await this.transport.sendEmail({
      clubId,
      kind: 'transactional',
      from: profile.from,
      to: payerEmail,
      subject,
      html,
      text,
    });

    await this.prisma.invoice.update({
      where: { id: invoice.id },
      data: { lastRemindedAt: new Date() },
    });

    return { sentTo: payerEmail };
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
