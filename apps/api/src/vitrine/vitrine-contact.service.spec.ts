import { BadRequestException, NotFoundException } from '@nestjs/common';
import { VitrineContactService } from './vitrine-contact.service';

const CLUB = { id: 'club-1', name: 'Demo', contactEmail: 'bureau@demo.fr' };

function makePrisma() {
  return {
    club: {
      findUnique: jest.fn().mockResolvedValue(CLUB),
    },
    user: {
      upsert: jest.fn().mockResolvedValue({
        id: 'user-1',
        email: 'prospect@example.com',
        displayName: 'Jean Dupont',
      }),
    },
    contact: {
      upsert: jest.fn().mockResolvedValue({
        id: 'contact-1',
      }),
    },
  };
}

function makeMail() {
  return {
    sendVitrineContactMessage: jest.fn().mockResolvedValue(undefined),
  };
}

function makeService(prisma = makePrisma(), mail = makeMail()) {
  return {
    svc: new VitrineContactService(prisma as never, mail as never),
    prisma,
    mail,
  };
}

describe('VitrineContactService.submit', () => {
  it('refuse si e-mail vide', async () => {
    const { svc } = makeService();
    await expect(
      svc.submit({
        clubSlug: 'demo',
        email: '',
        message: 'Bonjour',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('refuse si message vide', async () => {
    const { svc } = makeService();
    await expect(
      svc.submit({
        clubSlug: 'demo',
        email: 'a@b.fr',
        message: '',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('refuse message trop long', async () => {
    const { svc } = makeService();
    await expect(
      svc.submit({
        clubSlug: 'demo',
        email: 'a@b.fr',
        message: 'x'.repeat(5001),
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('refuse si club introuvable', async () => {
    const prisma = makePrisma();
    prisma.club.findUnique.mockResolvedValue(null);
    const { svc } = makeService(prisma);
    await expect(
      svc.submit({
        clubSlug: 'unknown',
        email: 'a@b.fr',
        message: 'Bonjour',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('crée User + Contact (téléphone inclus) et retourne success', async () => {
    const { svc, prisma } = makeService();
    const res = await svc.submit({
      clubSlug: 'demo',
      firstName: 'Jean',
      lastName: 'Dupont',
      email: 'Jean.Dupont@example.FR',
      phone: ' 0692 00 00 00 ',
      message: 'Bonjour, je voudrais un cours d’essai.',
    });
    expect(res.success).toBe(true);
    // Email normalisé en minuscules
    expect(prisma.user.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { email: 'jean.dupont@example.fr' },
      }),
    );
    expect(prisma.contact.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          clubId: 'club-1',
          userId: 'user-1',
          phone: '0692 00 00 00',
        }),
      }),
    );
  });

  it('transmet le message à l’e-mail de contact du club, réponse vers le visiteur', async () => {
    const { svc, mail } = makeService();
    await svc.submit({
      clubSlug: 'demo',
      firstName: 'Jean',
      lastName: 'Dupont',
      email: 'Jean.Dupont@example.FR',
      phone: null,
      message: 'Bonjour, je voudrais un cours d’essai.',
    });
    expect(mail.sendVitrineContactMessage).toHaveBeenCalledTimes(1);
    expect(mail.sendVitrineContactMessage).toHaveBeenCalledWith(
      'club-1',
      'bureau@demo.fr',
      {
        clubName: 'Demo',
        visitorName: 'Jean Dupont',
        visitorEmail: 'jean.dupont@example.fr',
        visitorPhone: null,
        message: 'Bonjour, je voudrais un cours d’essai.',
      },
    );
  });

  it('sans e-mail de contact : prospect créé, aucun envoi, success', async () => {
    const prisma = makePrisma();
    prisma.club.findUnique.mockResolvedValue({ ...CLUB, contactEmail: null });
    const { svc, mail } = makeService(prisma);
    const res = await svc.submit({
      clubSlug: 'demo',
      email: 'a@b.fr',
      message: 'Bonjour',
    });
    expect(res.success).toBe(true);
    expect(prisma.contact.upsert).toHaveBeenCalledTimes(1);
    expect(mail.sendVitrineContactMessage).not.toHaveBeenCalled();
  });

  it('si l’envoi échoue : prospect conservé, success=false avec message', async () => {
    const mail = makeMail();
    mail.sendVitrineContactMessage.mockRejectedValue(
      new Error('Envoi SMTP impossible : ECONNREFUSED'),
    );
    const { svc, prisma } = makeService(makePrisma(), mail);
    const res = await svc.submit({
      clubSlug: 'demo',
      email: 'a@b.fr',
      message: 'Bonjour',
    });
    expect(res.success).toBe(false);
    expect(res.message).toMatch(/pas pu être transmis/);
    expect(prisma.contact.upsert).toHaveBeenCalledTimes(1);
  });

  it('écrit le prospect AVANT de tenter l’envoi', async () => {
    const order: string[] = [];
    const prisma = makePrisma();
    prisma.user.upsert.mockImplementation(async () => {
      order.push('user');
      return { id: 'user-1', email: 'a@b.fr', displayName: 'a' };
    });
    prisma.contact.upsert.mockImplementation(async () => {
      order.push('contact');
      return { id: 'contact-1' };
    });
    const mail = makeMail();
    mail.sendVitrineContactMessage.mockImplementation(async () => {
      order.push('mail');
    });
    const { svc } = makeService(prisma, mail);
    await svc.submit({ clubSlug: 'demo', email: 'a@b.fr', message: 'Bonjour' });
    expect(order).toEqual(['user', 'contact', 'mail']);
  });
});
