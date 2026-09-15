import { Logger } from '@nestjs/common';
import {
  ClubPaymentMethod,
  InvoiceStatus,
  MembershipCartStatus,
  ShopOrderStatus,
  ShopStockMovementKind,
} from '@prisma/client';
import {
  ADJUSTMENT,
  CART,
  INVOICE,
  LINE,
  PAYMENT,
  PENDING,
  SUPPLEMENT,
  T1,
  VARIANT,
  makeWorld,
  type World,
} from '../../test/shop-order-world';

/**
 * Annuler une facture sous son verrou (ADR-0022, §3).
 *
 * Six chemins passent une facture VOID : l'annulation depuis la facturation, la
 * réouverture d'un panier d'adhésion, l'annulation d'une commande par le club ou
 * par l'adhérent, « Annuler et rembourser » et l'annulation d'un article.
 * Chacun prend le verrou de ses factures dans sa transaction, puis relit leur
 * statut et leurs paiements avant d'écrire. Sans ce verrou, une annulation
 * passe entre la relecture d'un règlement et son commit, et le paiement reste
 * sur une facture annulée.
 *
 * L'encaissement carte (webhook Stripe) prend le même verrou et relit la facture
 * dessous. Mais l'argent est déjà chez le club : face à une facture annulée, il
 * n'écrit rien, journalise un ENCAISSEMENT ORPHELIN et répond sans erreur, sinon
 * Stripe rejouerait sa livraison en boucle.
 *
 * Le monde (`test/shop-order-world.ts`) reproduit `pg_advisory_xact_lock` par un
 * verrou par clé levé à la fin de la transaction, défait les écritures d'une
 * transaction qui lève, et prend l'état d'une lecture au début de la requête,
 * avant sa latence. `atMoment` place la seconde opération à l'instant que l'ADR
 * redoute : juste avant l'écriture de la première, ses relectures faites. Elle
 * y tourne jusqu'à se terminer ou buter sur un verrou.
 */

/** Kimono taille 140 : l'article pris au premier échange, réservé. */
const KIMONO = () =>
  VARIANT({ id: 'v-2', productId: 'p-2', label: '140', onHand: 2, available: 1 });

/**
 * Commande en attente après un échange : sa facture, et celle du reste à payer,
 * que le règlement vise. Les quatre chemins boutique l'annulent.
 */
const commandeEchangee = () =>
  makeWorld({
    orders: [
      PENDING({
        totalCents: 5500,
        lines: [
          LINE({ cancelledQty: 1 }),
          LINE({
            id: 'line-2',
            productId: 'p-2',
            variantId: 'v-2',
            label: 'Kimono — 140',
            quantity: 1,
            unitPriceCents: 3500,
            createdAt: T1,
          }),
        ],
      }),
    ],
    variants: [VARIANT({ onHand: 5, available: 4 }), KIMONO()],
    invoices: [INVOICE({ status: InvoiceStatus.OPEN }), SUPPLEMENT()],
    adjustments: [ADJUSTMENT()],
  });

const annulerCommande = (h: World) => h.shop.cancelOrder('club-1', 'order-1');
const annulerCommandeAdherent = (h: World) =>
  h.shop.cancelOrderForViewer('club-1', { memberId: 'm-1' }, 'order-1');
const annulerEtRembourser = (h: World) =>
  h.refunds.cancelAndRefund('club-1', 'u-admin', {
    orderId: 'order-1',
    reason: 'Désistement',
  });
/** Le kimono rendu : le reste à payer s'annule, la facture de la commande est réduite. */
const annulerLeKimono = (h: World) =>
  h.adjust.adjust('club-1', 'u-admin', {
    orderId: 'order-1',
    lineId: 'line-2',
    quantity: 1,
    reason: 'Kimono rendu',
  });

/** Un acompte en espèces : la facture reste ouverte, rien d'autre ne bouge. */
const regler = (h: World, invoiceId: string) =>
  h.paymentsService.recordManualPayment('club-1', {
    invoiceId,
    amountCents: 1000,
    method: ClubPaymentMethod.MANUAL_CASH,
  });

const statut = (h: World, invoiceId: string) =>
  h.invoices.find((i) => i.id === invoiceId)!.status;
const encaisse = (h: World, invoiceId: string) =>
  h.payments.filter((p) => p.invoiceId === invoiceId).map((p) => p.amountCents);

/** Un acompte par carte, que Stripe annonce au webhook : la facture reste ouverte. */
const reglerParCarte = (h: World, invoiceId: string) =>
  h.stripePaymentSucceeded({ invoiceId, amountCents: 1000 });

/** Ce que le trésorier lit quand l'argent arrive sur une facture qui ne l'attend plus. */
const orphelin = (invoiceId: string, amountCents: number) =>
  `[stripe] ENCAISSEMENT ORPHELIN : paymentIntent pi_carte (${amountCents} cts) reçu pour la facture ${invoiceId} du club club-1, qui n'est pas OPEN. Aucun Payment créé — remboursement probablement dû.`;

/** Le journal d'erreurs, muet pendant les tests, où se lit un encaissement orphelin. */
let journal: jest.SpyInstance;
beforeEach(() => {
  journal = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
});
afterEach(() => journal.mockRestore());

type Annulation = {
  chemin: string;
  monde: () => World;
  /** La facture que le règlement vise et que l'annulation passe VOID. */
  facture: string;
  annuler: (h: World) => Promise<unknown>;
  /** Le refus de l'annulation qui voit le règlement commité. */
  refus: RegExp;
  /** Ce que l'annulation écrit hors de la facture : a-t-elle eu lieu ? */
  annulee: (h: World) => boolean;
};

const ANNULATIONS: Annulation[] = [
  {
    chemin: 'voidInvoice — annulation depuis la facturation',
    monde: () =>
      makeWorld({
        orders: [],
        variants: [],
        invoices: [
          INVOICE({
            id: 'inv-stage',
            shopOrderId: null,
            status: InvoiceStatus.OPEN,
            amountCents: 3000,
            label: 'Stage d’été',
          }),
        ],
      }),
    facture: 'inv-stage',
    annuler: (h) => h.paymentsService.voidInvoice('club-1', 'inv-stage', 'Stage annulé'),
    refus: /Un règlement vient d’être enregistré sur cette facture/,
    annulee: (h) => statut(h, 'inv-stage') === InvoiceStatus.VOID,
  },
  {
    chemin: 'reopenCart — réouverture d’un panier d’adhésion',
    monde: () =>
      makeWorld({
        orders: [],
        variants: [],
        invoices: [
          INVOICE({
            id: 'inv-adhesion',
            shopOrderId: null,
            status: InvoiceStatus.OPEN,
            amountCents: 12000,
            label: 'Adhésion 2026-2027',
          }),
        ],
        carts: [CART()],
      }),
    facture: 'inv-adhesion',
    annuler: (h) => h.cartService.reopenCart('club-1', 'cart-1'),
    refus: /Un règlement a déjà été encaissé sur cette adhésion/,
    annulee: (h) => h.carts[0].status === MembershipCartStatus.OPEN,
  },
  {
    chemin: 'cancelOrder — annulation d’une commande par le club',
    monde: commandeEchangee,
    facture: 'inv-sup',
    annuler: annulerCommande,
    refus: /un règlement a été encaissé/,
    annulee: (h) => h.orders[0].status === ShopOrderStatus.CANCELLED,
  },
  {
    chemin: 'cancelOrderForViewer — annulation par l’adhérent',
    monde: commandeEchangee,
    facture: 'inv-sup',
    annuler: annulerCommandeAdherent,
    refus: /un règlement a déjà été encaissé/,
    annulee: (h) => h.orders[0].status === ShopOrderStatus.CANCELLED,
  },
  {
    chemin: 'cancelAndRefund — « Annuler et rembourser »',
    monde: commandeEchangee,
    facture: 'inv-sup',
    annuler: annulerEtRembourser,
    refus: /règlement vient d’être enregistré/,
    annulee: (h) => h.orders[0].status === ShopOrderStatus.CANCELLED,
  },
  {
    chemin: 'adjust — annulation d’un article',
    monde: commandeEchangee,
    facture: 'inv-sup',
    annuler: annulerLeKimono,
    refus: /règlement vient d’être enregistré/,
    annulee: (h) => h.adjustments.length === 2,
  },
];

describe.each(ANNULATIONS)('$chemin : une annulation et un règlement simultanés', (c) => {
  it('règlement d’abord : l’annulation attend son commit, voit le paiement et refuse', async () => {
    const h = c.monde();
    h.raceWindow(2);
    const annulation = h.atMoment('payment', () => c.annuler(h));

    const [reglement] = await Promise.allSettled([regler(h, c.facture)]);

    expect(reglement.status).toBe('fulfilled');
    expect(await annulation.outcome()).toEqual({
      status: 'rejected',
      reason: expect.objectContaining({ message: expect.stringMatching(c.refus) }),
    });
    expect(statut(h, c.facture)).toBe(InvoiceStatus.OPEN);
    expect(encaisse(h, c.facture)).toEqual([1000]);
    expect(c.annulee(h)).toBe(false);
  });

  it('annulation d’abord : le règlement attend son commit, voit la facture annulée et refuse', async () => {
    const h = c.monde();
    h.raceWindow(2);
    const reglement = h.atMoment('void', () => regler(h, c.facture));

    const [annulation] = await Promise.allSettled([c.annuler(h)]);

    expect(annulation.status).toBe('fulfilled');
    expect(await reglement.outcome()).toEqual({
      status: 'rejected',
      reason: expect.objectContaining({
        message: expect.stringMatching(/La facture vient de changer/),
      }),
    });
    expect(statut(h, c.facture)).toBe(InvoiceStatus.VOID);
    expect(encaisse(h, c.facture)).toEqual([]);
    expect(c.annulee(h)).toBe(true);
  });
});

describe.each(ANNULATIONS)('$chemin : une annulation et un encaissement carte simultanés', (c) => {
  it('carte d’abord : l’annulation attend son commit, voit le paiement et refuse', async () => {
    const h = c.monde();
    h.raceWindow(2);
    const annulation = h.atMoment('payment', () => c.annuler(h));

    const [carte] = await Promise.allSettled([reglerParCarte(h, c.facture)]);

    expect(carte).toEqual({ status: 'fulfilled', value: undefined });
    expect(await annulation.outcome()).toEqual({
      status: 'rejected',
      reason: expect.objectContaining({ message: expect.stringMatching(c.refus) }),
    });
    expect(statut(h, c.facture)).toBe(InvoiceStatus.OPEN);
    expect(encaisse(h, c.facture)).toEqual([1000]);
    expect(c.annulee(h)).toBe(false);
  });

  it('annulation d’abord : la carte attend son commit, voit la facture annulée, n’écrit rien et répond sans erreur', async () => {
    const h = c.monde();
    h.raceWindow(2);
    const carte = h.atMoment('void', () => reglerParCarte(h, c.facture));

    const [annulation] = await Promise.allSettled([c.annuler(h)]);

    expect(annulation.status).toBe('fulfilled');
    expect(await carte.outcome()).toEqual({ status: 'fulfilled', value: undefined });
    expect(statut(h, c.facture)).toBe(InvoiceStatus.VOID);
    expect(encaisse(h, c.facture)).toEqual([]);
    expect(c.annulee(h)).toBe(true);
    // L'argent est chez le club, sans facture pour le recevoir : le trésorier le lit.
    expect(journal).toHaveBeenCalledWith(orphelin(c.facture, 1000));
    // L'événement reste réservé : Stripe ne rejoue pas la livraison.
    expect(h.webhookEvents).toEqual(['evt_pi_carte']);
  });
});

describe('une commande soldée par carte et son annulation simultanées', () => {
  /** En attente : ses deux t-shirts réservés, sa facture de 40 € ouverte. */
  const commande = () =>
    makeWorld({
      orders: [PENDING()],
      variants: [VARIANT({ onHand: 5, available: 3 })],
      invoices: [INVOICE({ status: InvoiceStatus.OPEN })],
    });
  const solderParCarte = (h: World) =>
    h.stripePaymentSucceeded({ invoiceId: 'inv-1', amountCents: 4000 });

  it('carte d’abord : la commande est servie sous le verrou, et l’annulation la trouve payée', async () => {
    const h = commande();
    h.raceWindow(2);
    const annulation = h.atMoment('payment', () => annulerCommande(h));

    const [carte] = await Promise.allSettled([solderParCarte(h)]);

    expect(carte).toEqual({ status: 'fulfilled', value: undefined });
    expect(await annulation.outcome()).toEqual({
      status: 'rejected',
      reason: expect.objectContaining({ message: expect.stringMatching(/elle est déjà payée/) }),
    });
    expect(h.orders[0].status).toBe(ShopOrderStatus.PAID);
    expect(statut(h, 'inv-1')).toBe(InvoiceStatus.PAID);
    expect(encaisse(h, 'inv-1')).toEqual([4000]);
    // Les deux t-shirts ont quitté le placard, une seule fois.
    expect(h.variants[0]).toEqual(expect.objectContaining({ onHand: 3, available: 3 }));
    expect(h.movements.map((m) => m.kind)).toEqual([ShopStockMovementKind.FULFILL]);
  });

  it('annulation d’abord : la carte attend son commit, ne sert rien, n’écrit rien, et la réservation est rendue', async () => {
    const h = commande();
    h.raceWindow(2);
    const carte = h.atMoment('void', () => solderParCarte(h));

    const [annulation] = await Promise.allSettled([annulerCommande(h)]);

    expect(annulation.status).toBe('fulfilled');
    expect(await carte.outcome()).toEqual({ status: 'fulfilled', value: undefined });
    expect(h.orders[0].status).toBe(ShopOrderStatus.CANCELLED);
    expect(statut(h, 'inv-1')).toBe(InvoiceStatus.VOID);
    expect(encaisse(h, 'inv-1')).toEqual([]);
    expect(h.variants[0]).toEqual(expect.objectContaining({ onHand: 5, available: 5 }));
    expect(h.movements.map((m) => m.kind)).toEqual([ShopStockMovementKind.RELEASE]);
    expect(journal).toHaveBeenCalledWith(orphelin('inv-1', 4000));
  });
});

describe('défense en profondeur : un paiement écrit sans le verrou, juste avant l’annulation', () => {
  /**
   * Tout encaissement prend le verrou de la facture. Un paiement qui s'en
   * passerait, commité avant que l'annulation écrive, se verrait encore dans sa
   * garde « aucun encaissement » : l'écriture ne mord pas, et l'annulation le
   * dit.
   */
  const paiementSansVerrou = (h: World) => async () => {
    h.payments.push(
      PAYMENT({
        id: 'pay-carte',
        invoiceId: 'inv-sup',
        amountCents: 1500,
        method: ClubPaymentMethod.STRIPE_CARD,
        externalRef: 'pi_carte',
        financialAccountId: null,
        createdAt: T1,
      }),
    );
  };

  it.each([
    ['cancelOrder', annulerCommande],
    ['cancelOrderForViewer', annulerCommandeAdherent],
    ['cancelAndRefund', annulerEtRembourser],
    ['adjust', annulerLeKimono],
  ])('%s : aucune facture ne s’annule, rien n’est écrit', async (_chemin, annuler) => {
    const h = commandeEchangee();
    h.atMoment('void', paiementSansVerrou(h));

    await expect(annuler(h)).rejects.toThrow(/vient de changer/);

    expect(h.events).toEqual(['rollback']);
    expect(h.invoices.map((i) => [i.id, i.status])).toEqual([
      ['inv-1', InvoiceStatus.OPEN],
      ['inv-sup', InvoiceStatus.OPEN],
    ]);
    expect(h.orders[0].status).toBe(ShopOrderStatus.PENDING);
    expect(h.orders[0].lines.map((l) => l.cancelledQty)).toEqual([1, 0]);
    expect(h.creditNotesOf()).toEqual([]);
    expect(h.adjustments).toHaveLength(1);
    expect(encaisse(h, 'inv-sup')).toEqual([1500]);
  });
});
