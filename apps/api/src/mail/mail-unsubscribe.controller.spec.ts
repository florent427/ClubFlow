import { BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ClubSendingDomainService } from './club-sending-domain.service';
import { MailUnsubscribeController } from './mail-unsubscribe.controller';
import { buildUnsubscribeToken } from './unsubscribe-token';

/**
 * Se désinscrire ne demande ni compte ni session : le jeton du lien porte le
 * club et l'adresse. Tout le reste doit être refusé, sinon n'importe qui
 * désinscrirait n'importe qui.
 */
describe('MailUnsubscribeController', () => {
  const avant = { ...process.env };
  let prisma: { club: { findUnique: jest.Mock } };
  let domains: { upsertSuppression: jest.Mock };
  let controller: MailUnsubscribeController;

  beforeEach(() => {
    process.env.MAIL_UNSUBSCRIBE_SECRET = 'secret-de-test';
    prisma = {
      club: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ id: 'club-1', name: 'Dojo Test' }),
      },
    };
    domains = { upsertSuppression: jest.fn().mockResolvedValue(undefined) };
    controller = new MailUnsubscribeController(
      prisma as unknown as PrismaService,
      domains as unknown as ClubSendingDomainService,
    );
  });

  afterEach(() => {
    process.env = { ...avant };
  });

  const jeton = (clubId: string, email: string) =>
    buildUnsubscribeToken({ clubId, email }, 'secret-de-test');

  it('inscrit l’adresse en liste de suppression, et nomme le club', async () => {
    await expect(
      controller.unsubscribe(jeton('club-1', 'parent@exemple.fr')),
    ).resolves.toEqual({ ok: true, clubName: 'Dojo Test' });

    expect(domains.upsertSuppression).toHaveBeenCalledWith(
      'club-1',
      'parent@exemple.fr',
      'desinscription',
    );
  });

  it('accepte le jeton posté dans le corps, comme le fait une boîte mail', async () => {
    await expect(
      controller.unsubscribe(undefined, {
        token: jeton('club-1', 'parent@exemple.fr'),
      }),
    ).resolves.toMatchObject({ ok: true });
  });

  it('refuse un jeton forgé, sans rien écrire', async () => {
    await expect(
      controller.unsubscribe('charge.signature'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(domains.upsertSuppression).not.toHaveBeenCalled();
  });

  it('refuse un jeton signé avec un autre secret', async () => {
    const autre = buildUnsubscribeToken(
      { clubId: 'club-1', email: 'parent@exemple.fr' },
      'secret-d-un-autre-serveur',
    );

    await expect(controller.unsubscribe(autre)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(domains.upsertSuppression).not.toHaveBeenCalled();
  });

  it('refuse quand le club n’existe plus', async () => {
    prisma.club.findUnique.mockResolvedValue(null);

    await expect(
      controller.unsubscribe(jeton('club-disparu', 'parent@exemple.fr')),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(domains.upsertSuppression).not.toHaveBeenCalled();
  });

  it('sans secret sur le serveur, aucun jeton ne passe', async () => {
    const valide = jeton('club-1', 'parent@exemple.fr');
    delete process.env.MAIL_UNSUBSCRIBE_SECRET;
    delete process.env.EMAIL_VERIFICATION_SECRET;

    await expect(controller.unsubscribe(valide)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});
