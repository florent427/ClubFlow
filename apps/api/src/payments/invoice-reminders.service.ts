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
 * Principe : l'admin (ou un cron ultérieur) appelle `sendReminder(clubId, invoiceId)`
 * pour relancer un payeur sur une facture OPEN dont la date d'échéance est
 * passée. Le service :
 *  - calcule le solde dû (amountCents - sum(Payment))
 *  - récupère l'e-mail du payeur (contact/member)
 *  - envoie un mail via `MailTransport` avec un récap et lien vers le portail
 *  - journalise (console + table `InvoiceReminderLog` si créée ensuite).
 *
 * Phase 1 : mail uniquement, déclenchement manuel depuis l'admin.
 * Phase 2 : cron quotidien + relance via Telegram/SMS, backoff exponentiel.
 */
@Injectable()
export class InvoiceRemindersService {
  private readonly logger = new Logger('InvoiceRemindersService');

  constructor(
    private readonly prisma: PrismaService,
    private readonly domains: ClubSendingDomainService,
    @Inject(MAIL_TRANSPORT) private readonly transport: MailTransport,
  ) {}

  /** Liste les factures OPEN avec échéance passée, pour un club. */
  async listOverdue(clubId: string): Promise<
    Array<{
      invoiceId: string;
      label: string;
      dueAt: Date | null;
      balanceCents: number;
      payerEmail: string | null;
      payerName: string | null;
    }>
  > {
    const now = new Date();
    const invoices = await this.prisma.invoice.findMany({
      where: {
        clubId,
        status: InvoiceStatus.OPEN,
        OR: [{ dueAt: { lt: now } }, { dueAt: null }],
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
        return {
          invoiceId: inv.id,
          label: inv.label,
          dueAt: inv.dueAt,
          balanceCents,
          payerEmail,
          payerName,
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
