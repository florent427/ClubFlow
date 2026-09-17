import { BadRequestException } from '@nestjs/common';
import { CommunicationChannel, MemberStatus } from '@prisma/client';
import type { ClubSendingDomainService } from '../mail/club-sending-domain.service';
import type { MailTransport } from '../mail/mail-transport.interface';
import type { MembersService } from '../members/members.service';
import type { MessagingGateway } from '../messaging/messaging.gateway';
import type { MessagingService } from '../messaging/messaging.service';
import type { NotificationsService } from '../notifications/notifications.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { TelegramApiService } from '../telegram/telegram-api.service';
import { CommsService } from './comms.service';

/**
 * Audit du 2026-09-14, point 1.3 : `sendCampaign` passe la campagne en SENT
 * avant la diffusion, et un canal en échec n'est que journalisé. Sans domaine
 * d'envoi vérifié pour les campagnes, une campagne e-mail s'affichait
 * « envoyée » sans qu'aucun mail ne parte.
 */

const CLUB = 'club-1';

function monde(options: {
  channels: CommunicationChannel[];
  domaineCampagne?: boolean | 'panne';
  telegram?: boolean;
}) {
  const campagne = {
    id: 'camp-1',
    clubId: CLUB,
    title: 'Stage de Toussaint',
    body: 'Inscriptions ouvertes.',
    channel: options.channels[0],
    channels: options.channels,
    dynamicGroupId: null,
    audienceFilterJson: null,
    status: 'DRAFT' as string,
    sentAt: null as Date | null,
  };
  const destinataires: string[] = [];
  const prisma: Record<string, unknown> = {
    messageCampaign: {
      findFirst: jest.fn(async () => ({ ...campagne })),
      update: jest.fn(async ({ data }: { data: { status: string; sentAt: Date } }) => {
        campagne.status = data.status;
        campagne.sentAt = data.sentAt;
        return { ...campagne };
      }),
      findUniqueOrThrow: jest.fn(async () => ({ ...campagne })),
    },
    messageCampaignRecipient: {
      create: jest.fn(async ({ data }: { data: { memberId: string } }) => {
        destinataires.push(data.memberId);
        return data;
      }),
      count: jest.fn(async () => destinataires.length),
    },
    familyMember: { findFirst: jest.fn(async () => null) },
    emailSuppression: { findMany: jest.fn(async () => []) },
    member: { findMany: jest.fn(async () => []) },
    chatRoom: { findMany: jest.fn(async () => []) },
    $transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>): Promise<unknown> => fn(prisma)),
  };
  const members = {
    listMembers: jest.fn(async () => [
      { id: 'm-1', status: MemberStatus.ACTIVE, email: 'alice@exemple.test' },
      { id: 'm-2', status: MemberStatus.INACTIVE, email: 'bob@exemple.test' },
    ]),
  };
  const sendingDomains = {
    getVerifiedMailProfile: jest.fn(async () => {
      if (options.domaineCampagne === 'panne') throw new Error('base indisponible');
      if (!options.domaineCampagne) {
        throw new BadRequestException('Validez un domaine d’envoi avant d’envoyer.');
      }
      return { fqdn: 'club.test', from: { name: 'Club', address: 'noreply@club.test' } };
    }),
  };
  const telegram = {
    isConfigured: jest.fn(() => options.telegram ?? false),
    sendMessage: jest.fn(async () => undefined),
  };
  const notifications = {
    notifyMembers: jest.fn(async () => ({ sent: 1, failed: 0 })),
  };
  const mail = { sendEmail: jest.fn(async () => ({ providerMessageId: 'msg-1' })) };
  const service = new CommsService(
    prisma as unknown as PrismaService,
    members as unknown as MembersService,
    sendingDomains as unknown as ClubSendingDomainService,
    telegram as unknown as TelegramApiService,
    {} as MessagingService,
    {} as MessagingGateway,
    notifications as unknown as NotificationsService,
    mail as unknown as MailTransport,
  );
  return { service, campagne, destinataires, prisma, mail, notifications, telegram };
}

describe('CommsService.sendCampaign : pas de campagne « envoyée » sans canal utilisable (audit 1.3)', () => {
  it('sans domaine vérifié pour les campagnes, une campagne e-mail est refusée et reste un brouillon', async () => {
    const w = monde({ channels: [CommunicationChannel.EMAIL], domaineCampagne: false });

    await expect(w.service.sendCampaign(CLUB, 'camp-1')).rejects.toThrow(
      'Campagne non envoyée : aucun domaine d’envoi vérifié pour les campagnes (Paramètres → E-mail). Validez-en un, ou retirez le canal e-mail.',
    );

    expect(w.campagne.status).toBe('DRAFT');
    expect(w.destinataires).toEqual([]);
    expect(w.mail.sendEmail).not.toHaveBeenCalled();
  });

  it('le refus vaut pour toute la campagne : ses autres canaux ne partent pas non plus', async () => {
    const w = monde({
      channels: [CommunicationChannel.PUSH, CommunicationChannel.EMAIL],
      domaineCampagne: false,
    });

    await expect(w.service.sendCampaign(CLUB, 'camp-1')).rejects.toThrow(BadRequestException);

    expect(w.notifications.notifyMembers).not.toHaveBeenCalled();
    expect(w.campagne.status).toBe('DRAFT');
  });

  it('Telegram sans bot configuré : refusée de même', async () => {
    const w = monde({ channels: [CommunicationChannel.TELEGRAM], telegram: false });

    await expect(w.service.sendCampaign(CLUB, 'camp-1')).rejects.toThrow(
      'Campagne non envoyée : Telegram n’est pas configuré sur le serveur. Retirez le canal Telegram.',
    );

    expect(w.campagne.status).toBe('DRAFT');
    expect(w.telegram.sendMessage).not.toHaveBeenCalled();
  });

  it('une panne au contrôle du domaine n’est pas déguisée en refus : l’erreur remonte telle quelle', async () => {
    const w = monde({ channels: [CommunicationChannel.EMAIL], domaineCampagne: 'panne' });

    await expect(w.service.sendCampaign(CLUB, 'camp-1')).rejects.toThrow('base indisponible');

    expect(w.campagne.status).toBe('DRAFT');
  });

  it('avec un domaine vérifié : envoyée, un e-mail par membre actif, depuis le domaine du club', async () => {
    const w = monde({ channels: [CommunicationChannel.EMAIL], domaineCampagne: true });

    const res = await w.service.sendCampaign(CLUB, 'camp-1');

    expect(res.status).toBe('SENT');
    expect(w.destinataires).toEqual(['m-1']);
    expect(w.mail.sendEmail).toHaveBeenCalledTimes(1);
    expect(w.mail.sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'alice@exemple.test',
        kind: 'campaign',
        from: { name: 'Club', address: 'noreply@club.test' },
      }),
    );
  });

  it('sans canal e-mail ni Telegram, aucun domaine n’est exigé', async () => {
    const w = monde({ channels: [CommunicationChannel.PUSH], domaineCampagne: false });

    const res = await w.service.sendCampaign(CLUB, 'camp-1');

    expect(res.status).toBe('SENT');
    expect(w.notifications.notifyMembers).toHaveBeenCalledTimes(1);
  });
});
