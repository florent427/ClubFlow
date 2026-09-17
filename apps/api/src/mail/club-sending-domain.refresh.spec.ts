import { BadRequestException } from '@nestjs/common';
import type { ClubSendingDomainVerificationStatus } from '@prisma/client';
import type { PrismaService } from '../prisma/prisma.service';
import { ClubSendingDomainService } from './club-sending-domain.service';
import type {
  DomainVerificationSnapshot,
  MailTransport,
} from './mail-transport.interface';

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
