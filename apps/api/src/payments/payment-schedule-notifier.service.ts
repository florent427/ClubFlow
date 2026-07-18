import { Inject, Injectable, Logger } from '@nestjs/common';
import { FamilyMemberLinkRole } from '@prisma/client';
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

function euros(cents: number): string {
  return (cents / 100).toFixed(2).replace('.', ',');
}

/**
 * Courriers liés aux échéanciers (cf. ADR-0009, lot 4).
 *
 * Un envoi qui échoue ne doit JAMAIS faire échouer le traitement financier
 * qui l'a déclenché : un prélèvement correctement enregistré ne peut pas être
 * annulé parce qu'un SMTP est indisponible. Toutes les méthodes avalent donc
 * leurs erreurs et se contentent de les journaliser.
 */
@Injectable()
export class PaymentScheduleNotifierService {
  private readonly logger = new Logger(PaymentScheduleNotifierService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly domains: ClubSendingDomainService,
    @Inject(MAIL_TRANSPORT) private readonly transport: MailTransport,
  ) {}

  /** Origine du portail, nettoyée (liste séparée par des virgules + slash final). */
  private portalBaseUrl(): string {
    const raw = process.env.MEMBER_PORTAL_ORIGIN ?? 'http://localhost:5174';
    return raw.split(',')[0]!.trim().replace(/\/+$/, '');
  }

  /**
   * Prévient l'adhérent qu'un prélèvement a échoué.
   *
   * `definitive` distingue les deux situations, qui n'appellent pas du tout
   * le même message : une nouvelle tentative est prévue, ou bien il faut
   * qu'il agisse.
   */
  async notifyInstallmentFailed(args: {
    installmentId: string;
    definitive: boolean;
    nextAttemptAt: Date | null;
  }): Promise<void> {
    try {
      const inst = await this.prisma.paymentScheduleInstallment.findUnique({
        where: { id: args.installmentId },
        include: {
          schedule: {
            include: {
              invoice: {
                include: {
                  club: { select: { name: true } },
                  family: {
                    include: {
                      familyMembers: {
                        where: { linkRole: FamilyMemberLinkRole.PAYER },
                        include: {
                          member: { select: { firstName: true, email: true } },
                          // L'e-mail d'un contact vit sur son User, pas sur
                          // le contact lui-même.
                          contact: {
                            select: {
                              firstName: true,
                              user: { select: { email: true } },
                            },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      });
      if (!inst) return;

      const invoice = inst.schedule.invoice;
      const payerLink = invoice.family?.familyMembers?.[0];
      const to =
        payerLink?.contact?.user?.email ?? payerLink?.member?.email ?? null;
      if (!to) {
        this.logger.warn(
          `[echeancier] échec de l'échéance ${inst.id} : aucun e-mail payeur connu.`,
        );
        return;
      }
      const firstName =
        payerLink?.contact?.firstName ?? payerLink?.member?.firstName ?? '';

      const profile = await this.domains.getVerifiedMailProfile(
        inst.clubId,
        'transactional',
      );
      const url = `${this.portalBaseUrl()}/facturation`;
      const amount = euros(inst.amountCents);
      const clubName = invoice.club.name;

      const suite = args.definitive
        ? `<p>Nous avons tenté le prélèvement à trois reprises sans succès. Le
           montant reste dû : merci de régulariser depuis votre espace membre,
           ou de prendre contact avec le club.</p>`
        : `<p>Une nouvelle tentative est prévue${
            args.nextAttemptAt
              ? ` le ${args.nextAttemptAt.toLocaleDateString('fr-FR')}`
              : ''
          }. Vous n'avez rien à faire si votre moyen de paiement est à jour ;
           dans le cas contraire, vous pouvez le modifier depuis votre espace
           membre.</p>`;

      await this.transport.sendEmail({
        clubId: inst.clubId,
        kind: 'transactional',
        from: profile.from,
        to,
        subject: args.definitive
          ? `Prélèvement impossible — ${invoice.label}`
          : `Prélèvement refusé — ${invoice.label}`,
        html: `
          <p>Bonjour ${escapeHtml(firstName)},</p>
          <p>Le prélèvement de <strong>${amount} €</strong> prévu pour
          <em>${escapeHtml(invoice.label)}</em> n'a pas pu aboutir.</p>
          ${suite}
          <p><a href="${url}">Ouvrir mon espace facturation</a></p>
          <p>Cordialement,<br>${escapeHtml(clubName)}</p>
        `,
        text: `Bonjour ${firstName},

Le prélèvement de ${amount} € prévu pour « ${invoice.label} » n'a pas pu aboutir.
${
  args.definitive
    ? 'Après trois tentatives, le montant reste dû. Merci de régulariser depuis votre espace membre ou de contacter le club.'
    : `Une nouvelle tentative est prévue${args.nextAttemptAt ? ` le ${args.nextAttemptAt.toLocaleDateString('fr-FR')}` : ''}.`
}

Espace facturation : ${url}

${clubName}`,
      });
    } catch (err) {
      // Volontairement avalé : cf. docstring de la classe.
      this.logger.warn(
        `[echeancier] notification d'échec impossible pour ${args.installmentId} : ${(err as Error).message}`,
      );
    }
  }
}
