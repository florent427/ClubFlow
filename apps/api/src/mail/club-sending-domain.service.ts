import {
  BadRequestException,
  Injectable,
  Logger,
  Inject,
} from '@nestjs/common';
import type { ClubSendingDomainPurpose } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { MAIL_TRANSPORT } from './mail.constants';
import type { MailTransport } from './mail-transport.interface';
import {
  fqdnIsUnderHostedSuffix,
  getClubflowHostedMailSuffix,
  slugToMailDnsLabel,
} from './hosted-mail.utils';
import { smtpProviderIdForFqdn } from './providers/smtp-id';
import { buildSmtpMailFrom, type SmtpMailFrom } from './mail-from';

export type MailUsageKind = 'campaign' | 'transactional';

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function normalizeFqdn(fqdn: string): string {
  return fqdn.trim().toLowerCase().replace(/\.$/, '');
}

function purposeMatchesUsage(
  purpose: ClubSendingDomainPurpose,
  usage: MailUsageKind,
): boolean {
  if (purpose === 'BOTH') {
    return true;
  }
  if (usage === 'campaign') {
    return purpose === 'CAMPAIGN';
  }
  return purpose === 'TRANSACTIONAL';
}

function verificationConflict(
  existing: ClubSendingDomainPurpose,
  incoming: ClubSendingDomainPurpose,
): boolean {
  const covers = (a: ClubSendingDomainPurpose, u: MailUsageKind) =>
    purposeMatchesUsage(a, u);

  if (existing === 'BOTH' || incoming === 'BOTH') {
    return true;
  }
  if (
    covers(existing, 'campaign') &&
    covers(incoming, 'campaign')
  ) {
    return true;
  }
  if (
    covers(existing, 'transactional') &&
    covers(incoming, 'transactional')
  ) {
    return true;
  }
  return false;
}

@Injectable()
export class ClubSendingDomainService {
  private readonly log = new Logger(ClubSendingDomainService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(MAIL_TRANSPORT) private readonly transport: MailTransport,
  ) {}

  private requireTransport(): MailTransport {
    if (!this.transport) {
      throw new BadRequestException(
        'Configuration e-mail indisponible (transport non chargé).',
      );
    }
    return this.transport;
  }

  async listForClub(clubId: string) {
    return this.prisma.clubSendingDomain.findMany({
      where: { clubId },
      orderBy: { createdAt: 'asc' },
    });
  }

  /** Sous-domaine opérateur du type sksr.mail.clubflow.fr (sans compte ESP chez le club). */
  async createHostedDomain(
    clubId: string,
    purpose: ClubSendingDomainPurpose,
  ) {
    const suffix = getClubflowHostedMailSuffix();
    if (!suffix) {
      throw new BadRequestException(
        'Sous-domaines ClubFlow indisponibles : définissez CLUBFLOW_HOSTED_MAIL_DOMAIN sur le serveur.',
      );
    }
    const club = await this.prisma.club.findUniqueOrThrow({
      where: { id: clubId },
    });
    const fallback = `club${club.id.replace(/-/g, '').slice(0, 12)}`;
    const baseLabel = slugToMailDnsLabel(club.slug, fallback);

    for (let i = 0; i < 40; i++) {
      const label = i === 0 ? baseLabel : `${baseLabel}-${i}`;
      const fqdn = `${label}.${suffix}`;
      const takenOtherClub = await this.prisma.clubSendingDomain.findFirst({
        where: { fqdn, clubId: { not: clubId } },
      });
      if (!takenOtherClub) {
        return this.createDomain(clubId, fqdn, purpose, {
          hostedProvisioned: true,
        });
      }
    }
    throw new BadRequestException(
      'Impossible d’attribuer un sous-domaine ClubFlow libre.',
    );
  }

  async createDomain(
    clubId: string,
    fqdn: string,
    purpose: ClubSendingDomainPurpose,
    opts?: { hostedProvisioned?: boolean },
  ) {
    const norm = normalizeFqdn(fqdn);
    if (!norm || norm.includes('/') || norm.includes(' ')) {
      throw new BadRequestException('FQDN invalide');
    }
    const suffix = getClubflowHostedMailSuffix();
    if (
      !opts?.hostedProvisioned &&
      suffix &&
      fqdnIsUnderHostedSuffix(norm, suffix)
    ) {
      throw new BadRequestException(
        'Pour un sous-domaine ClubFlow, utilisez l’action « Obtenir une adresse … » plutôt que la saisie manuelle.',
      );
    }
    const takenGlobally = await this.prisma.clubSendingDomain.findFirst({
      where: { fqdn: norm, clubId: { not: clubId } },
    });
    if (takenGlobally) {
      throw new BadRequestException(
        'Ce domaine d’envoi est déjà utilisé par un autre club.',
      );
    }
    const existing = await this.prisma.clubSendingDomain.findMany({
      where: { clubId, verificationStatus: 'VERIFIED' },
    });
    for (const row of existing) {
      if (verificationConflict(row.purpose, purpose)) {
        throw new BadRequestException(
          'Un domaine vérifié couvre déjà ce type d’envoi. Archivez-le ou utilisez un rôle différent (ex. LES DEUX).',
        );
      }
    }

    const t = this.requireTransport();
    const registered = await t.registerDomain(norm);
    return this.prisma.clubSendingDomain.create({
      data: {
        clubId,
        fqdn: norm,
        purpose,
        providerDomainId: registered.providerDomainId,
        dnsRecordsJson: JSON.stringify(registered.records),
        verificationStatus: 'PENDING',
      },
    });
  }

  async refreshVerification(clubId: string, domainId: string) {
    const row = await this.prisma.clubSendingDomain.findFirst({
      where: { id: domainId, clubId },
    });
    if (!row) {
      throw new BadRequestException('Domaine inconnu');
    }
    const providerId =
      row.providerDomainId ?? smtpProviderIdForFqdn(normalizeFqdn(row.fqdn));
    const t = this.requireTransport();
    const snap = await t.refreshDomain(providerId);

    let verificationStatus = row.verificationStatus;
    if (snap.verified) {
      const others = await this.prisma.clubSendingDomain.findMany({
        where: {
          clubId,
          verificationStatus: 'VERIFIED',
          id: { not: row.id },
        },
      });
      for (const o of others) {
        if (verificationConflict(o.purpose, row.purpose)) {
          this.log.warn(
            `Conflit de domaine vérifié club=${clubId} domain=${row.id}`,
          );
          throw new BadRequestException(
            'Un autre domaine vérifié couvre déjà ce type d’envoi.',
          );
        }
      }
      verificationStatus = 'VERIFIED';
    } else if (snap.failed) {
      verificationStatus = 'FAILED';
    } else {
      verificationStatus = 'PENDING';
    }

    return this.prisma.clubSendingDomain.update({
      where: { id: row.id },
      data: {
        verificationStatus,
        dnsRecordsJson: JSON.stringify(snap.records),
        lastCheckedAt: new Date(),
      },
    });
  }

  async deleteDomain(clubId: string, domainId: string): Promise<void> {
    const row = await this.prisma.clubSendingDomain.findFirst({
      where: { id: domainId, clubId },
    });
    if (!row) {
      throw new BadRequestException('Domaine inconnu');
    }
    await this.prisma.clubSendingDomain.delete({
      where: { id: domainId },
    });
  }

  /**
   * Domaine vérifié requis pour envoyer (spec : aucun envoi sinon).
   */
  async getVerifiedMailProfile(
    clubId: string,
    usage: MailUsageKind,
  ): Promise<{ fqdn: string; from: SmtpMailFrom }> {
    const domains = await this.prisma.clubSendingDomain.findMany({
      where: { clubId, verificationStatus: 'VERIFIED' },
    });
    const row = domains.find((d) => purposeMatchesUsage(d.purpose, usage));
    if (!row) {
      throw new BadRequestException(
        'Validez un domaine d’envoi (Paramètres → E-mail : enregistrement puis « Vérifier ») avant d’envoyer.',
      );
    }
    const club = await this.prisma.club.findUniqueOrThrow({
      where: { id: clubId },
    });
    const local =
      process.env.MAIL_FROM_LOCAL_PART?.trim() || 'noreply';
    return {
      fqdn: row.fqdn,
      from: buildSmtpMailFrom(club.name, row.fqdn, local),
    };
  }

  async isEmailSuppressedForCampaign(
    clubId: string,
    email: string,
  ): Promise<boolean> {
    const norm = normalizeEmail(email);
    if (!norm) {
      return true;
    }
    const hit = await this.prisma.emailSuppression.findUnique({
      where: {
        clubId_emailNormalized: { clubId, emailNormalized: norm },
      },
    });
    return !!hit;
  }

  async upsertSuppression(
    clubId: string,
    email: string,
    reason: string,
  ): Promise<void> {
    const norm = normalizeEmail(email);
    if (!norm) {
      return;
    }
    await this.prisma.emailSuppression.upsert({
      where: {
        clubId_emailNormalized: { clubId, emailNormalized: norm },
      },
      create: { clubId, emailNormalized: norm, reason },
      update: { reason },
    });
  }
}
