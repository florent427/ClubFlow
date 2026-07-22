import { ViewerService } from './viewer.service';

/**
 * Orchestration de l'annulation d'une commande boutique : annuler PUIS fermer
 * la session Stripe.
 *
 * ── L'ordre est la propriété testée ───────────────────────────────────────
 * L'annulation (commande CANCELLED, stock relâché, facture VOID) est la
 * GARANTIE. La fermeture de la session Stripe est un effet de bord distant qui
 * peut échouer. Les mettre dans le mauvais ordre — ou laisser l'échec du second
 * remonter — ferait qu'un incident Stripe empêcherait de libérer du stock.
 * C'est le motif du pitfall `garantie-derriere-effet-de-bord`, et ces tests
 * existent pour qu'il ne se réintroduise pas.
 *
 * On instancie via le prototype plutôt que par le constructeur : `ViewerService`
 * a une quinzaine de dépendances dont cette méthode n'en touche que trois.
 * Passer par le constructeur coupleraient ces tests à l'ordre des paramètres,
 * qui change à chaque nouvelle dépendance.
 */
describe('ViewerService.viewerCancelShopOrder', () => {
  function makeService(opts?: {
    invoice?: { id: string } | null;
    cancelThrows?: Error;
    expireThrows?: Error;
  }) {
    const calls: string[] = [];

    const prisma = {
      invoice: {
        findFirst: jest.fn(async () => {
          calls.push('findInvoice');
          return opts?.invoice === undefined ? { id: 'inv-1' } : opts.invoice;
        }),
      },
    };
    const shop = {
      cancelOrderForViewer: jest.fn(async () => {
        calls.push('cancel');
        if (opts?.cancelThrows) throw opts.cancelThrows;
        return { id: 'order-1', status: 'CANCELLED' };
      }),
    };
    const stripeCheckout = {
      expireCheckoutSessionForInvoice: jest.fn(async () => {
        calls.push('expire');
        if (opts?.expireThrows) throw opts.expireThrows;
        return 'expired' as const;
      }),
    };

    const errors: string[] = [];
    const service = Object.assign(Object.create(ViewerService.prototype), {
      prisma,
      shop,
      stripeCheckout,
      logger: { error: (m: unknown) => void errors.push(String(m)) },
    }) as ViewerService;

    return { service, prisma, shop, stripeCheckout, calls, errors };
  }

  const ARGS = {
    clubId: 'club-1',
    activeProfile: { memberId: 'm-1', contactId: null },
    orderId: 'order-1',
  };

  it('annule PUIS ferme la session, dans cet ordre', async () => {
    const { service, stripeCheckout, calls } = makeService();

    const result = await service.viewerCancelShopOrder(ARGS);

    expect(calls).toEqual(['findInvoice', 'cancel', 'expire']);
    expect(stripeCheckout.expireCheckoutSessionForInvoice).toHaveBeenCalledWith(
      'club-1',
      'inv-1',
    );
    // La commande annulée est bien ce qu'on rend à l'appelant.
    expect(result).toEqual({ id: 'order-1', status: 'CANCELLED' });
  });

  it("l'annulation ABOUTIT même si la fermeture de session échoue", async () => {
    // LE test de ce fichier. Stripe injoignable ne doit pas empêcher un
    // adhérent d'annuler ni le stock d'être relâché : le trou qu'on ferme est
    // moins grave que du stock bloqué par une panne tierce.
    const { service, shop, errors } = makeService({
      expireThrows: new Error('Stripe down'),
    });

    await expect(service.viewerCancelShopOrder(ARGS)).resolves.toEqual({
      id: 'order-1',
      status: 'CANCELLED',
    });
    expect(shop.cancelOrderForViewer).toHaveBeenCalledTimes(1);
    // Survivre à l'échec ne veut pas dire le taire : la session peut être
    // restée payable, et personne ne le verra si on n'en dit rien.
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('Stripe down');
    expect(errors[0]).toMatch(/PAYABLE/);
  });

  it('ne ferme AUCUNE session si l’annulation a été refusée', async () => {
    // Commande d'un autre adhérent, ou déjà payée : `cancelOrderForViewer`
    // lève. Expirer la session serait alors un effet de bord sur une facture
    // qu'on n'avait pas le droit de toucher.
    const refus = new Error('Commande introuvable.');
    const { service, stripeCheckout } = makeService({ cancelThrows: refus });

    await expect(service.viewerCancelShopOrder(ARGS)).rejects.toThrow(refus);

    expect(
      stripeCheckout.expireCheckoutSessionForInvoice,
    ).not.toHaveBeenCalled();
  });

  it('annule sans appeler Stripe quand la commande n’a pas de facture', async () => {
    // Commande « réglée sur place » : aucune facture, donc aucune session.
    const { service, shop, stripeCheckout } = makeService({ invoice: null });

    await service.viewerCancelShopOrder(ARGS);

    expect(shop.cancelOrderForViewer).toHaveBeenCalledTimes(1);
    expect(
      stripeCheckout.expireCheckoutSessionForInvoice,
    ).not.toHaveBeenCalled();
  });

  it('cherche la facture de la commande DANS le club du viewer', async () => {
    const { service, prisma } = makeService();

    await service.viewerCancelShopOrder(ARGS);

    expect(prisma.invoice.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          shopOrderId: 'order-1',
          clubId: 'club-1',
        }),
      }),
    );
  });
});
