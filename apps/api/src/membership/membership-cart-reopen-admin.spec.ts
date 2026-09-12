import { MembershipCartAdminResolver } from './membership-cart.resolver';
import type { MembershipCartService } from './membership-cart.service';
import type { Club } from '@prisma/client';

/**
 * La réouverture depuis l'admin.
 *
 * La garantie « rien d'encaissé » vit dans le service et est couverte par
 * `membership-cart-reopen-guard.spec.ts` : elle protège les deux chemins. Ce
 * qui se joue ICI, c'est la TRACE. Le motif par défaut du service dit « par le
 * payeur » — c'était le seul chemin quand il a été écrit. Réutilisé tel quel
 * depuis l'admin, le `voidReason` de la facture annulée mentirait sur qui a
 * agi, et personne ne s'en apercevrait en relisant le back-office.
 */
describe('clubReopenMembershipCart — trace de qui a rouvert', () => {
  const club = { id: 'club-1' } as Club;

  function makeResolver() {
    const reopenCart = jest.fn(
      async (_clubId: string, _cartId: string, _reason?: string | null) => ({
        id: 'cart-1',
      }),
    );
    const service = {
      reopenCart,
      // Panier minimal mais COMPLET pour le mapper : il lit la saison, le
      // payeur et les dates. Un double amputé ferait échouer le test sur le
      // mapper au lieu de dire quoi que ce soit sur la trace.
      getCartFullForGraph: jest.fn(async () => ({
        cart: {
          id: 'cart-1',
          clubId: 'club-1',
          familyId: 'fam-1',
          clubSeasonId: 'season-1',
          clubSeason: { label: '2026-2027' },
          payerContactId: null,
          payerMemberId: null,
          payerMember: null,
          payerContact: null,
          status: 'OPEN',
          validatedAt: null,
          invoiceId: null,
          invoice: null,
          cancelledReason: null,
          notes: null,
          items: [],
          pendingItems: [],
          createdAt: new Date('2026-09-12T00:00:00Z'),
          updatedAt: new Date('2026-09-12T00:00:00Z'),
        },
        preview: {
          items: [],
          totalCents: 0,
          requiresManualAssignmentCount: 0,
          canValidate: false,
        },
        productsById: new Map(),
        clubOneTimeFees: [],
      })),
    } as unknown as MembershipCartService;
    return { resolver: new MembershipCartAdminResolver(service), reopenCart };
  }

  it('nomme le club quand aucun motif n’est donné', async () => {
    const { resolver, reopenCart } = makeResolver();

    await resolver.clubReopenMembershipCart(club, { cartId: 'cart-1' });

    expect(reopenCart).toHaveBeenCalledWith(
      'club-1',
      'cart-1',
      expect.stringContaining('club'),
    );
    expect(reopenCart).not.toHaveBeenCalledWith(
      'club-1',
      'cart-1',
      expect.stringContaining('payeur'),
    );
  });

  it('conserve le motif saisi par l’admin', async () => {
    const { resolver, reopenCart } = makeResolver();

    await resolver.clubReopenMembershipCart(club, {
      cartId: 'cart-1',
      reason: 'Formule mensuelle choisie par erreur',
    });

    expect(reopenCart).toHaveBeenCalledWith(
      'club-1',
      'cart-1',
      'Formule mensuelle choisie par erreur',
    );
  });

  it('ignore un motif vide plutôt que d’effacer la trace', async () => {
    const { resolver, reopenCart } = makeResolver();

    await resolver.clubReopenMembershipCart(club, {
      cartId: 'cart-1',
      reason: '   ',
    });

    const motif = reopenCart.mock.calls[0][2] as string;
    expect(motif.trim().length).toBeGreaterThan(0);
  });
});
