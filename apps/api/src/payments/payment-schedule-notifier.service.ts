import { Inject, Injectable, Logger } from '@nestjs/common';
import { FamilyMemberLinkRole } from '@prisma/client';
import { ClubSendingDomainService } from '../mail/club-sending-domain.service';
import { MAIL_TRANSPORT } from '../mail/mail.constants';
import type { MailTransport } from '../mail/mail-transport.interface';
import { PrismaService } from '../prisma/prisma.service';
import { formatDueDate, formatEuros } from './payment-format';

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Partagés avec le mandat SEPA affiché par Checkout : l'avis et le mandat
// doivent annoncer les mêmes montants aux mêmes dates (cf. payment-format.ts).
const euros = formatEuros;

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
   * Charge une échéance avec tout ce qu'il faut pour écrire un courrier :
   * facture, club, et coordonnées du payeur du foyer.
   */
  private async loadContext(installmentId: string) {
    return this.prisma.paymentScheduleInstallment.findUnique({
      where: { id: installmentId },
      include: {
        schedule: {
          include: {
            invoice: {
              include: {
                club: { select: { name: true, contactEmail: true } },
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
                            lastName: true,
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
      const inst = await this.loadContext(args.installmentId);
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

  /**
   * Pré-notification SEPA, envoyée à la signature du mandat.
   *
   * Le schéma SEPA impose d'informer le débiteur du montant et de la date
   * avant tout prélèvement. Pour un échéancier fixe, dont toutes les dates
   * sont connues d'avance, un avis unique récapitulant l'ensemble des
   * échéances couvre l'obligation — inutile d'écrire avant chacune.
   *
   * @returns true si l'avis est parti (l'appelant en trace la date, qui
   *          constitue la preuve d'envoi).
   */
  async notifySepaPreNotification(scheduleId: string): Promise<boolean> {
    try {
      const schedule = await this.prisma.paymentSchedule.findUnique({
        where: { id: scheduleId },
        include: {
          installments: { orderBy: { seq: 'asc' } },
          invoice: {
            include: {
              club: { select: { name: true } },
              family: {
                include: {
                  familyMembers: {
                    where: { linkRole: FamilyMemberLinkRole.PAYER },
                    include: {
                      member: { select: { firstName: true, email: true } },
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
      });
      if (!schedule) return false;

      const invoice = schedule.invoice;
      const payerLink = invoice.family?.familyMembers?.[0];
      const to =
        payerLink?.contact?.user?.email ?? payerLink?.member?.email ?? null;
      if (!to) {
        this.logger.warn(
          `[echeancier] pré-notification SEPA impossible pour ${scheduleId} : ` +
            `aucun e-mail payeur. L'obligation d'information n'est pas remplie.`,
        );
        return false;
      }

      const firstName =
        payerLink?.contact?.firstName ?? payerLink?.member?.firstName ?? '';
      const profile = await this.domains.getVerifiedMailProfile(
        schedule.clubId,
        'transactional',
      );

      const rows = schedule.installments
        .map(
          (i) =>
            `<tr><td>Échéance ${i.seq}</td><td>${formatDueDate(i.dueOn)}</td>` +
            `<td><strong>${euros(i.amountCents)} €</strong></td></tr>`,
        )
        .join('');
      const lines = schedule.installments
        .map(
          (i) =>
            `  ${i.seq}. ${formatDueDate(i.dueOn)} — ${euros(i.amountCents)} €`,
        )
        .join('\n');

      await this.transport.sendEmail({
        clubId: schedule.clubId,
        kind: 'transactional',
        from: profile.from,
        to,
        subject: `Avis de prélèvement — ${invoice.label}`,
        html: `
          <p>Bonjour ${escapeHtml(firstName)},</p>
          <p>Vous venez d'autoriser <strong>${escapeHtml(invoice.club.name)}</strong>
          à prélever votre compte pour <em>${escapeHtml(invoice.label)}</em>.</p>
          <p>Voici le détail des prélèvements à venir, pour un total de
          <strong>${euros(schedule.totalCents)} €</strong> :</p>
          <table cellpadding="6" style="border-collapse:collapse">${rows}</table>
          ${
            schedule.sepaMandateReference
              ? `<p style="color:#555">Référence de votre mandat :
                 ${escapeHtml(schedule.sepaMandateReference)}</p>`
              : ''
          }
          <p>Aucune démarche n'est nécessaire de votre part : les prélèvements
          seront effectués automatiquement aux dates indiquées. Conservez ce
          message, il vaut avis de prélèvement.</p>
          <p>Cordialement,<br>${escapeHtml(invoice.club.name)}</p>
        `,
        text: `Bonjour ${firstName},

Vous venez d'autoriser ${invoice.club.name} à prélever votre compte pour « ${invoice.label} ».

Prélèvements à venir (total ${euros(schedule.totalCents)} €) :
${lines}
${schedule.sepaMandateReference ? `\nRéférence de votre mandat : ${schedule.sepaMandateReference}` : ''}

Aucune démarche nécessaire : les prélèvements seront effectués automatiquement aux dates indiquées. Conservez ce message, il vaut avis de prélèvement.

${invoice.club.name}`,
      });
      return true;
    } catch (err) {
      this.logger.warn(
        `[echeancier] pré-notification SEPA impossible pour ${scheduleId} : ${(err as Error).message}`,
      );
      return false;
    }
  }

  /**
   * Alerte le club après un échec DÉFINITIF.
   *
   * Sans ce message, une créance en échec définitif resterait invisible côté
   * club : l'adhérent est prévenu, mais personne au bureau ne sait qu'il faut
   * reprendre la main. C'est précisément le moment où l'automatisme s'arrête
   * et où un humain doit décider.
   */
  async notifyTreasurerFinalFailure(installmentId: string): Promise<void> {
    try {
      const inst = await this.loadContext(installmentId);
      if (!inst) return;

      const invoice = inst.schedule.invoice;
      const to = invoice.club.contactEmail;
      if (!to) {
        this.logger.warn(
          `[echeancier] échec définitif de ${installmentId} : aucun e-mail de contact ` +
            `pour le club — le bureau n'est pas averti.`,
        );
        return;
      }

      const payerLink = invoice.family?.familyMembers?.[0];
      const payerName =
        [
          payerLink?.contact?.firstName ?? payerLink?.member?.firstName,
          payerLink?.contact?.lastName,
        ]
          .filter(Boolean)
          .join(' ') || 'Payeur inconnu';

      const profile = await this.domains.getVerifiedMailProfile(
        inst.clubId,
        'transactional',
      );
      const amount = euros(inst.amountCents);

      await this.transport.sendEmail({
        clubId: inst.clubId,
        kind: 'transactional',
        from: profile.from,
        to,
        subject: `Prélèvement en échec définitif — ${invoice.label}`,
        html: `
          <p>Le prélèvement automatique de <strong>${amount} €</strong> sur la
          facture <em>${escapeHtml(invoice.label)}</em> a échoué après trois
          tentatives.</p>
          <p>Payeur : <strong>${escapeHtml(payerName)}</strong>${
            inst.lastFailureMessage
              ? `<br>Motif du dernier refus : ${escapeHtml(inst.lastFailureMessage)}`
              : ''
          }</p>
          <p>Aucune nouvelle tentative n'aura lieu. Le montant reste dû : il
          vous appartient de contacter l'adhérent ou d'enregistrer un
          règlement manuel.</p>
        `,
        text: `Le prélèvement automatique de ${amount} € sur la facture « ${invoice.label} » a échoué après trois tentatives.

Payeur : ${payerName}
${inst.lastFailureMessage ? `Motif du dernier refus : ${inst.lastFailureMessage}` : ''}

Aucune nouvelle tentative n'aura lieu. Le montant reste dû.`,
      });
    } catch (err) {
      this.logger.warn(
        `[echeancier] alerte trésorier impossible pour ${installmentId} : ${(err as Error).message}`,
      );
    }
  }

  /**
   * Sollicite l'adhérent quand le prélèvement exige une authentification
   * forte (3-D Secure).
   *
   * On ne cherche pas à rejouer l'authentification du PaymentIntent
   * hors-session — chemin fragile et peu lisible pour l'adhérent. On
   * l'oriente vers son espace, où il règle en étant présent : la banque
   * l'authentifie alors normalement.
   */
  async notifyRequiresAction(installmentId: string): Promise<void> {
    try {
      const inst = await this.loadContext(installmentId);
      if (!inst) return;

      const invoice = inst.schedule.invoice;
      const payerLink = invoice.family?.familyMembers?.[0];
      const to =
        payerLink?.contact?.user?.email ?? payerLink?.member?.email ?? null;
      if (!to) return;

      const firstName =
        payerLink?.contact?.firstName ?? payerLink?.member?.firstName ?? '';
      const profile = await this.domains.getVerifiedMailProfile(
        inst.clubId,
        'transactional',
      );
      const url = `${this.portalBaseUrl()}/facturation`;
      const amount = euros(inst.amountCents);

      await this.transport.sendEmail({
        clubId: inst.clubId,
        kind: 'transactional',
        from: profile.from,
        to,
        subject: `Confirmation requise pour votre prélèvement — ${invoice.label}`,
        html: `
          <p>Bonjour ${escapeHtml(firstName)},</p>
          <p>Votre banque demande une confirmation de votre part pour le
          prélèvement de <strong>${amount} €</strong> lié à
          <em>${escapeHtml(invoice.label)}</em>.</p>
          <p>Le prélèvement n'a donc pas été effectué. Vous pouvez régler cette
          échéance depuis votre espace membre : votre banque vous demandera
          alors de valider l'opération.</p>
          <p><a href="${url}">Ouvrir mon espace facturation</a></p>
          <p>Cordialement,<br>${escapeHtml(invoice.club.name)}</p>
        `,
        text: `Bonjour ${firstName},

Votre banque demande une confirmation pour le prélèvement de ${amount} € lié à « ${invoice.label} ». Le prélèvement n'a pas été effectué.

Réglez cette échéance depuis votre espace membre, votre banque vous demandera de valider : ${url}

${invoice.club.name}`,
      });
    } catch (err) {
      this.logger.warn(
        `[echeancier] notification 3-D Secure impossible pour ${installmentId} : ${(err as Error).message}`,
      );
    }
  }
}
