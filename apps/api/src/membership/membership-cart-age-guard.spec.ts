import { BadRequestException } from '@nestjs/common';
import { MembershipCartService } from './membership-cart.service';

/**
 * Une formule ne peut être choisie que si l'identité en a l'ÂGE.
 *
 * Le chemin de LECTURE filtrait déjà (`viewerEligibleMembershipFormulas`) :
 * l'écran ne proposait que des formules valides. Le chemin d'ÉCRITURE ne
 * vérifiait que l'appartenance au club. Une sélection périmée — l'id d'une
 * formule cochée avant qu'on ne corrige la date de naissance — passait donc
 * sans un mot.
 *
 * Constaté en production le 2026-08-26 :
 *   - Joachim Morel, 13 ans, portait « Cotisation Adulte » (14+) EN PLUS de
 *     « Cotisation Enfant » : 65 €/mois de cotisation pour une personne ;
 *   - Rhayan Poticadou, 5 ans, portait « Cotisation Enfant » (6–13) au lieu
 *     de « Cotisation Baby » : facturé 30 € au lieu de 25 €.
 *
 * L'écran a été corrigé aussi, mais il ne peut pas être la garantie : il
 * peut être périmé, une version mobile déjà installée ne se corrige pas, et
 * la mutation est appelable directement.
 *
 * Ces tests vérifient qu'AUCUNE écriture n'a lieu, pas seulement qu'un
 * `throw` est prononcé.
 */
const CLUB = 'club-1';
const SAISON = {
  id: 'saison-1',
  clubId: CLUB,
  isActive: true,
  startsOn: new Date('2026-09-01'),
};

/** Catalogue SKSR : tranches d'âge exclusives. */
const ADULTE = {
  id: 'p-adulte',
  label: 'Cotisation Adulte',
  minAge: 14,
  maxAge: null,
  monthlyAmountCents: 3500,
  gradeFilters: [],
};
const ENFANT = {
  id: 'p-enfant',
  label: 'Cotisation Enfant',
  minAge: 6,
  maxAge: 13,
  monthlyAmountCents: 3000,
  gradeFilters: [],
};
const BABY = {
  id: 'p-baby',
  label: 'Cotisation Baby',
  minAge: 4,
  maxAge: 5,
  monthlyAmountCents: 2500,
  gradeFilters: [],
};
const CATALOGUE = [ADULTE, ENFANT, BABY];

function makeService() {
  const prisma = {
    clubSeason: { findFirst: jest.fn(async () => SAISON) },
    membershipProduct: {
      findMany: jest.fn(async ({ where }: { where: { id?: { in: string[] } } }) =>
        CATALOGUE.filter((p) => where.id?.in.includes(p.id) ?? true),
      ),
    },
    membershipCartPendingItem: {
      findFirst: jest.fn(async () => null),
      create: jest.fn(async () => ({ id: 'pending-1' })),
      update: jest.fn(async () => ({ id: 'pending-1' })),
    },
  };

  const service = Object.create(
    MembershipCartService.prototype,
  ) as MembershipCartService;
  Object.assign(service, { prisma });
  // Résolution du panier et anti-doublon : hors sujet ici, et ils
  // s'exécutent APRÈS le contrôle d'âge dans le chemin nominal.
  Object.assign(service, {
    getOrOpenCart: jest.fn(async () => ({ id: 'cart-1' })),
    computePendingTakenProductIds: jest.fn(async () => new Set<string>()),
  });

  return { service, prisma };
}

/** 13 ans à la date de référence de la saison (2026-09-01). */
const NE_EN_2013 = new Date('2013-05-22');
/** 5 ans. */
const NE_EN_2021 = new Date('2021-03-10');
/** 40 ans. */
const NE_EN_1986 = new Date('1986-01-15');

function entree(birthDate: Date, membershipProductIds: string[]) {
  return {
    firstName: 'Joachim',
    lastName: 'Morel',
    civility: 'MR' as const,
    birthDate,
    email: 'joachim@example.com',
    membershipProductIds,
  };
}

describe('addPendingItemToActiveCart — âge respecté', () => {
  it('accepte la formule correspondant à la tranche d’âge', async () => {
    const { service, prisma } = makeService();

    await service.addPendingItemToActiveCart(
      CLUB,
      'famille-1',
      entree(NE_EN_2013, [ENFANT.id]),
    );

    expect(prisma.membershipCartPendingItem.create).toHaveBeenCalled();
  });

  it('accepte un adulte sur la formule adulte', async () => {
    const { service, prisma } = makeService();

    await service.addPendingItemToActiveCart(
      CLUB,
      'famille-1',
      entree(NE_EN_1986, [ADULTE.id]),
    );

    expect(prisma.membershipCartPendingItem.create).toHaveBeenCalled();
  });
});

describe('addPendingItemToActiveCart — âge non respecté', () => {
  it('REFUSE le cumul Adulte + Enfant pour un enfant de 13 ans', async () => {
    // Le cas exact de Joachim Morel en production.
    const { service, prisma } = makeService();

    await expect(
      service.addPendingItemToActiveCart(
        CLUB,
        'famille-1',
        entree(NE_EN_2013, [ADULTE.id, ENFANT.id]),
      ),
    ).rejects.toThrow(BadRequestException);

    expect(prisma.membershipCartPendingItem.create).not.toHaveBeenCalled();
  });

  it('REFUSE une formule unique mais hors tranche', async () => {
    // Le cas de Rhayan Poticadou : pas un doublon visible, une formule
    // seule et fausse — 5 ans facturé au tarif Enfant.
    const { service, prisma } = makeService();

    await expect(
      service.addPendingItemToActiveCart(
        CLUB,
        'famille-1',
        entree(NE_EN_2021, [ENFANT.id]),
      ),
    ).rejects.toThrow(BadRequestException);

    expect(prisma.membershipCartPendingItem.create).not.toHaveBeenCalled();
  });

  it('nomme la formule fautive dans le message', async () => {
    // Un refus qui ne dit pas QUOI corriger renvoie le payeur au support.
    const { service } = makeService();

    await expect(
      service.addPendingItemToActiveCart(
        CLUB,
        'famille-1',
        entree(NE_EN_2021, [ENFANT.id]),
      ),
    ).rejects.toThrow(/Cotisation Enfant/);
  });

  it('REFUSE deux fois la même formule', async () => {
    const { service, prisma } = makeService();

    await expect(
      service.addPendingItemToActiveCart(
        CLUB,
        'famille-1',
        entree(NE_EN_2013, [ENFANT.id, ENFANT.id]),
      ),
    ).rejects.toThrow(BadRequestException);

    expect(prisma.membershipCartPendingItem.create).not.toHaveBeenCalled();
  });

  it('REFUSE une formule d’un autre club', async () => {
    const { service, prisma } = makeService();

    await expect(
      service.addPendingItemToActiveCart(
        CLUB,
        'famille-1',
        entree(NE_EN_2013, ['p-dun-autre-club']),
      ),
    ).rejects.toThrow(BadRequestException);

    expect(prisma.membershipCartPendingItem.create).not.toHaveBeenCalled();
  });
});
