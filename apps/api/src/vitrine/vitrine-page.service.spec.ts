import { BadRequestException, NotFoundException } from '@nestjs/common';
import { VitrinePageService } from './vitrine-page.service';

/**
 * Tests unitaires du service pages vitrine.
 *
 * On mocke PrismaService pour éviter une dépendance DB réelle. Le service
 * contient de la logique métier pure (deep-merge, manipulation de sections)
 * qui mérite des tests unitaires.
 */

type PrismaMock = {
  vitrinePage: {
    findFirst: jest.Mock;
    findUnique: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
    findMany: jest.Mock;
  };
  vitrinePageRevision: {
    create: jest.Mock;
    findMany: jest.Mock;
    findFirst: jest.Mock;
    count: jest.Mock;
    deleteMany: jest.Mock;
  };
};

function makePrisma(): PrismaMock {
  return {
    vitrinePage: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      findMany: jest.fn(),
    },
    vitrinePageRevision: {
      create: jest.fn().mockResolvedValue({ id: 'rev-x' }),
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn(),
      count: jest.fn().mockResolvedValue(0),
      deleteMany: jest.fn(),
    },
  };
}

function pageWithSections(sections: unknown) {
  return {
    id: 'page-1',
    clubId: 'club-1',
    slug: 'index',
    templateKey: 'sksr-v1',
    status: 'PUBLISHED' as const,
    seoTitle: null,
    seoDescription: null,
    seoOgImageId: null,
    sectionsJson: sections,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

describe('VitrinePageService — updateSection (deep-merge)', () => {
  it('met à jour un champ simple sans perdre les autres', async () => {
    const prisma = makePrisma();
    prisma.vitrinePage.findFirst.mockResolvedValue(
      pageWithSections([
        {
          id: 'sec-1',
          type: 'hero',
          props: {
            title: 'Ancien',
            ctaPrimary: { label: 'Action', href: '/go' },
          },
        },
      ]),
    );
    prisma.vitrinePage.findUnique.mockResolvedValue(
      pageWithSections([
        {
          id: 'sec-1',
          type: 'hero',
          props: {
            title: 'Ancien',
            ctaPrimary: { label: 'Action', href: '/go' },
          },
        },
      ]),
    );
    prisma.vitrinePage.update.mockImplementation(({ data }) =>
      Promise.resolve({ ...pageWithSections(data.sectionsJson) }),
    );
    const svc = new VitrinePageService(prisma as never);
    const result = await svc.updateSection(
      'club-1',
      'page-1',
      'sec-1',
      { ctaPrimary: { label: 'Nouveau' } },
      'user-1',
    );
    const sections = result.sectionsJson as Array<{
      props: Record<string, unknown>;
    }>;
    expect(sections[0]!.props).toEqual({
      title: 'Ancien',
      ctaPrimary: { label: 'Nouveau', href: '/go' },
    });
  });

  it('throw NotFound si section absente', async () => {
    const prisma = makePrisma();
    prisma.vitrinePage.findFirst.mockResolvedValue(pageWithSections([]));
    prisma.vitrinePage.findUnique.mockResolvedValue(pageWithSections([]));
    const svc = new VitrinePageService(prisma as never);
    await expect(
      svc.updateSection('club-1', 'page-1', 'nope', {}, null),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('VitrinePageService — array patches', () => {
  function freshSections() {
    return [
      {
        id: 'sec-list',
        type: 'cardsGrid',
        props: {
          cards: [
            { title: 'A', subtitle: 'x' },
            { title: 'B', subtitle: 'y' },
            { title: 'C', subtitle: 'z' },
          ],
        },
      },
    ];
  }

  function primePrisma() {
    const prisma = makePrisma();
    // Chaque appel retourne un arbre frais — la mutation d'un test ne
    // pollue pas le suivant (le service mute l'objet en place avant d'appeler update).
    prisma.vitrinePage.findFirst.mockImplementation(() =>
      Promise.resolve(pageWithSections(freshSections())),
    );
    prisma.vitrinePage.findUnique.mockImplementation(() =>
      Promise.resolve(pageWithSections(freshSections())),
    );
    prisma.vitrinePage.update.mockImplementation(
      ({ data }: { data: { sectionsJson: unknown } }) =>
        Promise.resolve(pageWithSections(data.sectionsJson)),
    );
    return prisma;
  }

  it('updateSectionListItem : deep-merge sur un item', async () => {
    const prisma = primePrisma();
    const svc = new VitrinePageService(prisma as never);
    const result = await svc.updateSectionListItem(
      'club-1',
      'page-1',
      'sec-list',
      'cards',
      1,
      { subtitle: 'nouveau sous-titre' },
      null,
    );
    const cards = (result.sectionsJson as unknown[])
      .map((s) => s as { props: { cards: unknown[] } })[0]!.props.cards;
    expect(cards[1]).toEqual({ title: 'B', subtitle: 'nouveau sous-titre' });
  });

  it('addSectionListItem : ajout en fin', async () => {
    const prisma = primePrisma();
    const svc = new VitrinePageService(prisma as never);
    const result = await svc.addSectionListItem(
      'club-1',
      'page-1',
      'sec-list',
      'cards',
      { title: 'D' },
      null,
      null,
    );
    const cards = (result.sectionsJson as unknown[])
      .map((s) => s as { props: { cards: unknown[] } })[0]!.props.cards;
    expect(cards).toHaveLength(4);
    expect(cards[3]).toEqual({ title: 'D' });
  });

  it('addSectionListItem : insertion en position donnée', async () => {
    const prisma = primePrisma();
    const svc = new VitrinePageService(prisma as never);
    const result = await svc.addSectionListItem(
      'club-1',
      'page-1',
      'sec-list',
      'cards',
      { title: 'New' },
      1,
      null,
    );
    const cards = (result.sectionsJson as unknown[])
      .map((s) => s as { props: { cards: unknown[] } })[0]!.props.cards;
    expect(cards).toHaveLength(4);
    expect((cards[1] as { title: string }).title).toBe('New');
  });

  it('removeSectionListItem : retire item', async () => {
    const prisma = primePrisma();
    const svc = new VitrinePageService(prisma as never);
    const result = await svc.removeSectionListItem(
      'club-1',
      'page-1',
      'sec-list',
      'cards',
      0,
      null,
    );
    const cards = (result.sectionsJson as unknown[])
      .map((s) => s as { props: { cards: unknown[] } })[0]!.props.cards;
    expect(cards).toHaveLength(2);
    expect((cards[0] as { title: string }).title).toBe('B');
  });

  it('reorderSectionListItems : valide et réordonne', async () => {
    const prisma = primePrisma();
    const svc = new VitrinePageService(prisma as never);
    const result = await svc.reorderSectionListItems(
      'club-1',
      'page-1',
      'sec-list',
      'cards',
      [2, 0, 1],
      null,
    );
    const cards = (result.sectionsJson as unknown[])
      .map((s) => s as { props: { cards: unknown[] } })[0]!.props.cards;
    expect((cards as Array<{ title: string }>).map((c) => c.title)).toEqual([
      'C',
      'A',
      'B',
    ]);
  });

  it('reorderSectionListItems : rejette newOrder invalide', async () => {
    const prisma = primePrisma();
    const svc = new VitrinePageService(prisma as never);
    await expect(
      svc.reorderSectionListItems(
        'club-1',
        'page-1',
        'sec-list',
        'cards',
        [0, 0, 1],
        null,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('removeSectionListItem : index hors bornes', async () => {
    const prisma = primePrisma();
    const svc = new VitrinePageService(prisma as never);
    await expect(
      svc.removeSectionListItem(
        'club-1',
        'page-1',
        'sec-list',
        'cards',
        99,
        null,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('updateSectionListItem : rejette champ non-array', async () => {
    const prisma = makePrisma();
    prisma.vitrinePage.findFirst.mockResolvedValue(
      pageWithSections([
        { id: 'sec-1', type: 'hero', props: { title: 'x' } },
      ]),
    );
    prisma.vitrinePage.findUnique.mockResolvedValue(
      pageWithSections([
        { id: 'sec-1', type: 'hero', props: { title: 'x' } },
      ]),
    );
    const svc = new VitrinePageService(prisma as never);
    await expect(
      svc.updateSectionListItem(
        'club-1',
        'page-1',
        'sec-1',
        'title',
        0,
        {},
        null,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
