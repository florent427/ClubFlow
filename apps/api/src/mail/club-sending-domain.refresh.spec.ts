import { BadRequestException } from '@nestjs/common';
import type { ClubSendingDomainVerificationStatus } from '@prisma/client';
import type { PrismaService } from '../prisma/prisma.service';
import { ClubSendingDomainService } from './club-sending-domain.service';
import type {
  DomainVerificationSnapshot,
  MailTransport,
} from './mail-transport.interface';
import { SmtpMailTransport } from './providers/smtp-mail.transport';
import { smtpProviderIdForFqdn } from './providers/smtp-id';

/**
 * Audit du 2026-09-14, point 1.4 : « Vérifier » marquait un domaine prêt sans
 * aucun contrôle. Un transport qui ne sait pas vérifier ne change plus le
 * statut enregistré, dans un sens comme dans l'autre.
 */

const CLUB = 'club-1';

function monde(statut: ClubSendingDomainVerificationStatus, snap: Omit<DomainVerificationSnapshot, 'providerDomainId'>) {
  const domaine = {
    id: 'dom-1',
    clubId: CLUB,
    fqdn: 'clubflow.topdigital.re',
    purpose: 'TRANSACTIONAL' as const,
    providerDomainId: 'brevo-123',
    verificationStatus: statut,
    dnsRecordsJson: '[]',
    lastCheckedAt: null as Date | null,
  };
  const prisma = {
    clubSendingDomain: {
      findFirst: jest.fn(async () => ({ ...domaine })),
      findMany: jest.fn(async () => []),
      update: jest.fn(async ({ data }: { data: Partial<typeof domaine> }) => {
        Object.assign(domaine, data);
        return { ...domaine };
      }),
    },
  };
  const transport = {
    refreshDomain: jest.fn(async (providerDomainId: string) => ({ providerDomainId, ...snap })),
  };
  const service = new ClubSendingDomainService(
    prisma as unknown as PrismaService,
    transport as unknown as MailTransport,
  );
  return { service, domaine, prisma };
}

const INCONCLUSIF = { records: [], verified: false, failed: false, inconclusive: true };

describe('ClubSendingDomainService.refreshVerification (audit 1.4)', () => {
  it.each<ClubSendingDomainVerificationStatus>(['VERIFIED', 'PENDING', 'FAILED'])(
    'transport qui ne sait pas vérifier : refus explicite, statut %s inchangé',
    async (statut) => {
      const w = monde(statut, INCONCLUSIF);

      await expect(w.service.refreshVerification(CLUB, 'dom-1')).rejects.toThrow(
        new BadRequestException(
          'Vérification indisponible depuis ClubFlow : l’authentification du domaine auprès du service d’envoi est faite par l’équipe ClubFlow. Le statut du domaine ne change pas.',
        ),
      );

      expect(w.prisma.clubSendingDomain.update).not.toHaveBeenCalled();
      expect(w.domaine.verificationStatus).toBe(statut);
    },
  );

  it('contrôle réel positif : le domaine passe vérifié', async () => {
    const w = monde('PENDING', { records: [], verified: true, failed: false });

    await w.service.refreshVerification(CLUB, 'dom-1');

    expect(w.domaine.verificationStatus).toBe('VERIFIED');
  });

  it('contrôle réel en échec : le domaine passe en échec', async () => {
    const w = monde('VERIFIED', { records: [], verified: false, failed: true });

    await w.service.refreshVerification(CLUB, 'dom-1');

    expect(w.domaine.verificationStatus).toBe('FAILED');
  });
});

/**
 * Les cas ci-dessus doublent le transport, qui accepte donc n'importe quel
 * identifiant. Le vrai `SmtpMailTransport` exige le préfixe `smtp:` : une ligne
 * enregistrée avant la bascule vers le relais SMTP porte encore l'identifiant
 * de l'ancienne API, et « Vérifier » remontait « Identifiant domaine SMTP
 * invalide » (erreur 500 vue en prod sur SKSR le 2026-09-21).
 */
describe('ClubSendingDomainService.refreshVerification (transport SMTP réel)', () => {
  const ENV = process.env;

  function mondeSmtp() {
    const domaine = {
      id: 'dom-1',
      clubId: CLUB,
      fqdn: 'clubflow.topdigital.re',
      purpose: 'TRANSACTIONAL' as const,
      // Identifiant hérité de l'ancienne API fournisseur.
      providerDomainId: '69f8410ed5eb982a25003083',
      verificationStatus: 'VERIFIED' as ClubSendingDomainVerificationStatus,
      dnsRecordsJson: '[]',
      lastCheckedAt: null as Date | null,
    };
    const prisma = {
      clubSendingDomain: {
        // Le double honore le `where` : le service doit filtrer par club.
        findFirst: jest.fn(
          async ({ where }: { where: { id?: string; clubId?: string } }) =>
            where.id === domaine.id && where.clubId === domaine.clubId
              ? { ...domaine }
              : null,
        ),
        findMany: jest.fn(async () => []),
        update: jest.fn(async ({ data }: { data: Partial<typeof domaine> }) => {
          Object.assign(domaine, data);
          return { ...domaine };
        }),
      },
    };
    const service = new ClubSendingDomainService(
      prisma as unknown as PrismaService,
      new SmtpMailTransport({} as never),
    );
    return { service, domaine, prisma };
  }

  beforeEach(() => {
    process.env = { ...ENV };
    delete process.env.SMTP_DNS_SPF_CHECK;
    delete process.env.SMTP_AUTO_VERIFY_DOMAIN;
  });

  afterEach(() => {
    process.env = ENV;
  });

  it('identifiant hérité : le refus est celui du transport qui ne vérifie rien, pas une erreur interne', async () => {
    const w = mondeSmtp();

    await expect(w.service.refreshVerification(CLUB, 'dom-1')).rejects.toThrow(
      new BadRequestException(
        'Vérification indisponible depuis ClubFlow : l’authentification du domaine auprès du service d’envoi est faite par l’équipe ClubFlow. Le statut du domaine ne change pas.',
      ),
    );
    expect(w.domaine.verificationStatus).toBe('VERIFIED');
  });

  it('contrôle positif : l’identifiant hérité est remplacé par celui du transport SMTP', async () => {
    process.env.SMTP_AUTO_VERIFY_DOMAIN = 'true';
    const w = mondeSmtp();

    await w.service.refreshVerification(CLUB, 'dom-1');

    expect(w.domaine.providerDomainId).toBe(
      smtpProviderIdForFqdn('clubflow.topdigital.re'),
    );
  });
});
