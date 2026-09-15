import { Logger } from '@nestjs/common';
import {
  ClubPaymentMethod,
  InvoiceStatus,
  ShopOrderStatus,
} from '@prisma/client';
import {
  INVOICE,
  ORDER,
  PAYMENT,
  T1,
  VARIANT,
  makeWorld,
  type World,
} from '../../test/shop-order-world';

/**
 * Les webhooks d'argent de Stripe sous le verrou de la facture (ADR-0022, §3),
 * face aux autres gestes sur la même facture.
 *
 * L'encaissement carte (`payment_intent.succeeded`) prend le verrou en tête de
 * sa transaction, puis relit dessous le paiement déjà enregistré pour son
 * paymentIntent, le statut et le reste dû. L'argent est déjà chez le club : ce
 * qui ne s'enregistre plus se journalise en ENCAISSEMENT ORPHELIN, et le webhook
 * répond sans erreur, sinon Stripe rejouerait sa livraison en boucle.
 *
 * Le remboursement confirmé (`charge.refunded`) prend le même verrou avant son
 * paiement négatif et son avoir.
 *
 * La carte contre les six annulations : invoice-void-lock.spec.ts. Même monde,
 * `test/shop-order-world.ts` : verrou par clé levé au commit, rollback de la
 * seule transaction qui lève, latence de lecture, et `atMoment` pour lancer un
 * geste juste avant l'écriture de l'autre.
 */

/** Un stage d'été à 30 €, hors boutique et hors panier. */
const STAGE = () =>
  INVOICE({
    id: 'inv-stage',
    shopOrderId: null,
    status: InvoiceStatus.OPEN,
    amountCents: 3000,
    label: 'Stage d’été',
  });

const stage = () => makeWorld({ orders: [], variants: [], invoices: [STAGE()] });

const especes = (h: World, amountCents: number) =>
  h.paymentsService.recordManualPayment('club-1', {
    invoiceId: 'inv-stage',
    amountCents,
    method: ClubPaymentMethod.MANUAL_CASH,
  });

const carte = (h: World, amountCents: number, eventId?: string) =>
  h.stripePaymentSucceeded({ invoiceId: 'inv-stage', amountCents, eventId });

const statut = (h: World) => h.invoices.find((i) => i.id === 'inv-stage')!.status;
const encaisse = (h: World) =>
  h.payments.filter((p) => p.invoiceId === 'inv-stage').map((p) => p.amountCents);

/** Ce que le trésorier lit quand l'argent arrive sur une facture qui ne l'attend plus. */
const orphelin = (amountCents: number, cause: string) =>
  `[stripe] ENCAISSEMENT ORPHELIN : paymentIntent pi_carte (${amountCents} cts) reçu pour la facture inv-stage du club club-1, ${cause}. Aucun Payment créé — remboursement probablement dû.`;

/** Le journal d'erreurs, muet pendant les tests, où se lit un encaissement orphelin. */
let journal: jest.SpyInstance;
beforeEach(() => {
  journal = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
});
afterEach(() => journal.mockRestore());

describe('un encaissement carte et une saisie simultanés', () => {
  it('saisie d’abord : la carte attend son commit, relit le reste dû et solde la facture', async () => {
    const h = stage();
    h.raceWindow(2);
    const paiementCarte = h.atMoment('payment', () => carte(h, 2000));

    await especes(h, 1000);

    expect(await paiementCarte.outcome()).toEqual({ status: 'fulfilled', value: undefined });
    expect(encaisse(h)).toEqual([1000, 2000]);
    expect(statut(h)).toBe(InvoiceStatus.PAID);
  });

  it('carte d’abord : la saisie attend son commit, voit l’encaissement et solde la facture', async () => {
    const h = stage();
    h.raceWindow(2);
    const saisie = h.atMoment('payment', () => especes(h, 1000));

    await expect(carte(h, 2000)).resolves.toBeUndefined();

    expect((await saisie.outcome()).status).toBe('fulfilled');
    expect(encaisse(h)).toEqual([2000, 1000]);
    expect(statut(h)).toBe(InvoiceStatus.PAID);
  });

  it('saisie qui solde d’abord : la carte n’écrit rien, le signale en ENCAISSEMENT ORPHELIN et répond sans erreur', async () => {
    const h = stage();
    h.raceWindow(2);
    const paiementCarte = h.atMoment('payment', () => carte(h, 3000));

    await especes(h, 3000);

    expect(await paiementCarte.outcome()).toEqual({ status: 'fulfilled', value: undefined });
    expect(encaisse(h)).toEqual([3000]);
    expect(statut(h)).toBe(InvoiceStatus.PAID);
    expect(journal).toHaveBeenCalledWith(orphelin(3000, "qui n'est pas OPEN"));
    // Réponse sans erreur : l'événement reste réservé, Stripe ne rejoue pas.
    expect(h.webhookEvents).toEqual(['evt_pi_carte']);
  });
});

describe('un encaissement carte relu sous le verrou', () => {
  it('facture ouverte dont un avoir a éteint le reste dû : aucun paiement, ENCAISSEMENT ORPHELIN, sans erreur', async () => {
    const h = makeWorld({
      orders: [],
      variants: [],
      invoices: [
        STAGE(),
        INVOICE({
          id: 'cn-1',
          shopOrderId: null,
          status: InvoiceStatus.PAID,
          amountCents: 2000,
          isCreditNote: true,
          parentInvoiceId: 'inv-stage',
          createdAt: T1,
        }),
      ],
      payments: [PAYMENT({ invoiceId: 'inv-stage', amountCents: 1000 })],
    });

    await expect(carte(h, 1000)).resolves.toBeUndefined();

    expect(encaisse(h)).toEqual([1000]);
    expect(statut(h)).toBe(InvoiceStatus.OPEN);
    expect(journal).toHaveBeenCalledWith(orphelin(1000, 'dont le solde est déjà nul'));
    expect(h.webhookEvents).toEqual(['evt_pi_carte']);
  });

  it('deux livraisons simultanées du même paymentIntent : un seul paiement, et la seconde n’est pas un orphelin', async () => {
    const h = stage();
    h.raceWindow(2);
    const seconde = h.atMoment('payment', () => carte(h, 3000, 'evt_2'));

    await expect(carte(h, 3000, 'evt_1')).resolves.toBeUndefined();

    expect(await seconde.outcome()).toEqual({ status: 'fulfilled', value: undefined });
    expect(encaisse(h)).toEqual([3000]);
    expect(statut(h)).toBe(InvoiceStatus.PAID);
    expect(journal).not.toHaveBeenCalled();
    // La seconde retente les frais du paiement déjà enregistré, sans recette de plus.
    const [paiement] = h.payments;
    expect(h.stripeFees.syncFeesForPayment.mock.calls).toEqual([[paiement.id], [paiement.id]]);
    expect(h.accounting.recordIncomeFromPayment).toHaveBeenCalledTimes(1);
  });
});

describe('un remboursement confirmé par Stripe et « Annuler et rembourser » simultanés', () => {
  it('remboursement d’abord : l’annulation attend son commit, voit le remboursement et refuse, rien n’est écrit', async () => {
    const h = makeWorld({
      orders: [ORDER()],
      variants: [VARIANT()],
      invoices: [INVOICE()],
      payments: [
        PAYMENT({
          method: ClubPaymentMethod.STRIPE_CARD,
          externalRef: 'pi_123',
          financialAccountId: 'fa-transit',
        }),
      ],
    });
    h.raceWindow(2);
    const annulation = h.atMoment('refund', () =>
      h.refunds.cancelAndRefund('club-1', 'u-admin', {
        orderId: 'order-1',
        reason: 'Rupture fournisseur',
      }),
    );

    // Le club rend 10 € depuis son tableau de bord Stripe.
    await h.refundConfirmations.applyRefundConfirmed({
      clubId: 'club-1',
      paymentIntentId: 'pi_123',
      refundId: 're_tableau_de_bord',
      amountCents: 1000,
      stripeAccountId: null,
      // La charge de 40 €, entièrement enregistrée : aucun excédent.
      charge: {
        capturedCents: 4000,
        refunds: [{ id: 're_tableau_de_bord', amountCents: 1000, fromApp: false }],
      },
    });

    expect(await annulation.outcome()).toEqual({
      status: 'rejected',
      reason: expect.objectContaining({
        message: expect.stringMatching(/Un règlement vient d’être enregistré sur cette commande/),
      }),
    });
    // Le plan, lu avant le remboursement, rendait encore les 40 € par carte : il
    // n'a rien écrit, et rien demandé à Stripe.
    expect(h.orders[0].status).toBe(ShopOrderStatus.PAID);
    expect(h.movements).toHaveLength(0);
    expect(h.stripeRefunds.refundPayment).not.toHaveBeenCalled();
    expect(h.refundsOf()).toEqual([
      expect.objectContaining({
        invoiceId: 'inv-1',
        amountCents: -1000,
        stripeRefundId: 're_tableau_de_bord',
        refundedPaymentId: 'pay-1',
      }),
    ]);
    expect(h.creditNotesOf()).toEqual([
      expect.objectContaining({ parentInvoiceId: 'inv-1', amountCents: 1000 }),
    ]);
  });
});
