import { BadRequestException, NotFoundException } from '@nestjs/common';
import { VitrineContactService } from './vitrine-contact.service';

function makePrisma() {
  return {
    club: {
      findUnique: jest.fn(),
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

describe('VitrineContactService.submit', () => {
  it('refuse si e-mail vide', async () => {
    const prisma = makePrisma();
    prisma.club.findUnique.mockResolvedValue({ id: 'club-1', name: 'Demo' });
    const svc = new VitrineContactService(prisma as never);
    await expect(
      svc.submit({
        clubSlug: 'demo',
        email: '',
        message: 'Bonjour',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('refuse si message vide', async () => {
    const prisma = makePrisma();
    prisma.club.findUnique.mockResolvedValue({ id: 'club-1', name: 'Demo' });
    const svc = new VitrineContactService(prisma as never);
    await expect(
      svc.submit({
        clubSlug: 'demo',
        email: 'a@b.fr',
        message: '',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('refuse message trop long', async () => {
    const prisma = makePrisma();
    prisma.club.findUnique.mockResolvedValue({ id: 'club-1', name: 'Demo' });
    const svc = new VitrineContactService(prisma as never);
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
    const svc = new VitrineContactService(prisma as never);
    await expect(
      svc.submit({
        clubSlug: 'unknown',
        email: 'a@b.fr',
        message: 'Bonjour',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('crée User + Contact et retourne success', async () => {
    const prisma = makePrisma();
    prisma.club.findUnique.mockResolvedValue({ id: 'club-1', name: 'Demo' });
    const svc = new VitrineContactService(prisma as never);
    const res = await svc.submit({
      clubSlug: 'demo',
      firstName: 'Jean',
      lastName: 'Dupont',
      email: 'Jean.Dupont@example.FR',
      message: 'Bonjour, je voudrais un cours d’essai.',
    });
    expect(res.success).toBe(true);
    // Email normalisé en minuscules
    expect(prisma.user.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { email: 'jean.dupont@example.fr' },
      }),
    );
    expect(prisma.contact.upsert).toHaveBeenCalled();
  });
});
