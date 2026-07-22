import Stripe from 'stripe';
import { StripeCheckoutService } from './stripe-checkout.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { StripeConnectService } from './stripe-connect.service';

jest.mock('stripe');

const retrieve = jest.fn();
const expire = jest.fn();
(Stripe as unknown as jest.Mock).mockImplementation(() => ({
  checkout: { sessions: { retrieve, expire } },
}));

/**
 * Fermeture de la session Stripe quand une facture cesse d'être due.
 *
 * ── Le trou que ces tests verrouillent ────────────────────────────────────
 * Annuler une commande relâchait le stock et passait la facture en VOID, mais
 * laissait la session Checkout PAYABLE. Un onglet resté ouvert suffisait à
 * encaisser pour une commande annulée : l'argent tombait sur le compte du club
 * sans qu'aucun Payment ne soit créé, et il fallait rembourser à la main.
 *
 * Ce que ces tests exigent, et que la seule lecture du code ne garantit pas :
 *  - la session est fermée sur LE COMPTE QUI LA PORTE, pas sur le compte
 *    courant du club (les deux peuvent diverger) ;
 *  - un échec Stripe ne fait JAMAIS échouer l'annulation, mais ne passe jamais
 *    sous silence non plus ;
 *  - une session déjà PAYÉE est signalée comme telle — c'est le seul cas où de
 *    l'argent est réellement en jeu.
 */
describe('StripeCheckoutService.expireCheckoutSessionForInvoice', () => {
  let prisma: {
    invoice: { findFirst: jest.Mock; updateMany: jest.Mock };
  };
  let service: StripeCheckoutService;
  let errors: string[];

  /** Facture par défaut : une session ouverte, sur le compte `acct_session`. */
  function makeService(
    invoice: Record<string, unknown> | null = {
      stripeCheckoutSessionId: 'cs_123',
      stripeCheckoutAccountId: 'acct_session',
    },
  ) {
    prisma = {
      invoice: {
        findFirst: jest.fn().mockResolvedValue(invoice),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    service = new StripeCheckoutService(
      prisma as unknown as PrismaService,
      {} as unknown as StripeConnectService,
    );
    errors = [];
    jest
      .spyOn(service['logger'], 'error')
      .mockImplementation((m: unknown) => void errors.push(String(m)));
    return service;
  }

  beforeEach(() => {
    retrieve.mockReset();
    expire.mockReset();
    process.env.STRIPE_SECRET_KEY = 'sk_test_x';
    retrieve.mockResolvedValue({ status: 'open', payment_status: 'unpaid' });
    expire.mockResolvedValue({ id: 'cs_123', status: 'expired' });
  });

  it('ferme la session ouverte et efface la trace', async () => {
    const svc = makeService();

    await expect(
      svc.expireCheckoutSessionForInvoice('club-1', 'inv-1'),
    ).resolves.toBe('expired');

    expect(expire).toHaveBeenCalledWith('cs_123', {
      stripeAccount: 'acct_session',
    });
    // Trace effacée : un second passage ne doit pas retenter une session morte.
    expect(prisma.invoice.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          stripeCheckoutSessionId: null,
          stripeCheckoutAccountId: null,
        },
      }),
    );
    expect(errors).toHaveLength(0);
  });

  it('expire sur le compte FIGÉ sur la facture, pas sur un autre', async () => {
    // Le club a pu rebrancher un autre compte Stripe depuis la création de la
    // session. Une session ne s'expire que depuis le compte qui la porte :
    // viser le compte courant échouerait silencieusement.
    const svc = makeService({
      stripeCheckoutSessionId: 'cs_123',
      stripeCheckoutAccountId: 'acct_ancien',
    });

    await svc.expireCheckoutSessionForInvoice('club-1', 'inv-1');

    expect(retrieve).toHaveBeenCalledWith('cs_123', {
      stripeAccount: 'acct_ancien',
    });
    expect(expire).toHaveBeenCalledWith('cs_123', {
      stripeAccount: 'acct_ancien',
    });
  });

  it('ne touche pas à Stripe quand la facture n’a aucune session (sur place)', async () => {
    const svc = makeService({
      stripeCheckoutSessionId: null,
      stripeCheckoutAccountId: null,
    });

    await expect(
      svc.expireCheckoutSessionForInvoice('club-1', 'inv-1'),
    ).resolves.toBe('none');

    expect(retrieve).not.toHaveBeenCalled();
    expect(expire).not.toHaveBeenCalled();
    // Absence de session ≠ échec : rien à signaler.
    expect(errors).toHaveLength(0);
  });

  it('n’essaie pas d’expirer une session qui n’est plus ouverte', async () => {
    retrieve.mockResolvedValue({ status: 'expired', payment_status: 'unpaid' });
    const svc = makeService();

    await expect(
      svc.expireCheckoutSessionForInvoice('club-1', 'inv-1'),
    ).resolves.toBe('already-consumed');

    // Stripe REFUSE d'expirer une session non-`open` : tenter quand même
    // produirait une erreur qu'on devrait ensuite interpréter à l'aveugle.
    expect(expire).not.toHaveBeenCalled();
    // Expiration naturelle sans paiement : aucun argent en jeu, rien à crier.
    expect(errors).toHaveLength(0);
  });

  it('CRIE quand la session a déjà été PAYÉE — de l’argent est en jeu', async () => {
    retrieve.mockResolvedValue({ status: 'complete', payment_status: 'paid' });
    const svc = makeService();

    await expect(
      svc.expireCheckoutSessionForInvoice('club-1', 'inv-1'),
    ).resolves.toBe('already-consumed');

    expect(errors).toHaveLength(1);
    // Le message doit nommer de quoi agir : facture, club, compte à rembourser.
    expect(errors[0]).toContain('inv-1');
    expect(errors[0]).toContain('club-1');
    expect(errors[0]).toContain('acct_session');
    expect(errors[0]).toMatch(/remboursement/i);
    // Trace CONSERVÉE : la session n'a pas été fermée par nous, l'effacer
    // reviendrait à perdre le fil de l'encaissement à rembourser.
    expect(prisma.invoice.updateMany).not.toHaveBeenCalled();
  });

  it('ne lève JAMAIS quand Stripe est en panne, mais le journalise', async () => {
    // La garantie (commande annulée, stock relâché) est déjà commitée quand on
    // arrive ici. Lever ferait remonter une erreur à l'adhérent pour une
    // annulation qui a pourtant réussi.
    retrieve.mockRejectedValue(new Error('Stripe down'));
    const svc = makeService();

    await expect(
      svc.expireCheckoutSessionForInvoice('club-1', 'inv-1'),
    ).resolves.toBe('failed');

    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('Stripe down');
    // Le message doit dire la CONSÉQUENCE, pas seulement l'échec technique :
    // la session reste payable, donc le trou reste ouvert pour cette facture.
    expect(errors[0]).toMatch(/PAYABLE/);
    // Trace conservée : une prochaine tentative reste possible.
    expect(prisma.invoice.updateMany).not.toHaveBeenCalled();
  });

  it('ne lève pas non plus si l’expiration elle-même échoue', async () => {
    expire.mockRejectedValue(new Error('rate limited'));
    const svc = makeService();

    await expect(
      svc.expireCheckoutSessionForInvoice('club-1', 'inv-1'),
    ).resolves.toBe('failed');

    expect(errors[0]).toContain('rate limited');
    expect(prisma.invoice.updateMany).not.toHaveBeenCalled();
  });

  it('cherche la facture DANS le club demandé (pas de fuite inter-tenant)', async () => {
    const svc = makeService();

    await svc.expireCheckoutSessionForInvoice('club-1', 'inv-1');

    expect(prisma.invoice.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: 'inv-1', clubId: 'club-1' }),
      }),
    );
  });
});
