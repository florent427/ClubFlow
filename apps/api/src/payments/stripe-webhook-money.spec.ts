import { Logger } from '@nestjs/common';
import {
  ClubPaymentMethod,
  FamilyMemberLinkRole,
  InvoiceStatus,
  MemberStatus,
} from '@prisma/client';
import {
  INVOICE,
  PAYMENT,
  T1,
  makeWorld,
  type World,
  type WorldInvoice,
} from '../../test/shop-order-world';

/**
 * L'argent qu'annonce un encaissement carte est toujours enregistré, ou signalé
 * au trésorier (ADR-0022, §3). Trois cas le laissaient chez le club sans l'un
 * ni l'autre :
 *
 * - le contrôle du payeur refusait après le paiement (fiche désactivée, sortie
 *   du foyer ou supprimée depuis l'ouverture du paiement) : le webhook levait,
 *   et Stripe rejouait en boucle ;
 * - un paiement supérieur au reste dû était tronqué sans trace, et rendre
 *   l'excédent depuis Stripe écrivait un avoir sur la facture ;
 * - le rejeu d'une livraison qui avait levé après le commit ne retentait pas le
 *   soldage de l'échéance, et prenait une facture soldée pour un ENCAISSEMENT
 *   ORPHELIN.
 *
 * Même monde que stripe-webhook-lock.spec.ts : les vraies portes du webhook,
 * `payment_intent.succeeded` et `charge.refunded`, sur un double de PostgreSQL.
 */

/** Un stage d'été à 30 €, sur le foyer de Camille (`m-1`, foyer `fam-1`). */
const STAGE = (over: Partial<WorldInvoice> = {}) =>
  INVOICE({
    id: 'inv-stage',
    shopOrderId: null,
    status: InvoiceStatus.OPEN,
    amountCents: 3000,
    label: 'Stage d’été',
    ...over,
  });

const stage = () => makeWorld({ orders: [], variants: [], invoices: [STAGE()] });

const especes = (h: World, amountCents: number) =>
  h.paymentsService.recordManualPayment('club-1', {
    invoiceId: 'inv-stage',
    amountCents,
    method: ClubPaymentMethod.MANUAL_CASH,
  });

/**
 * Stripe annonce un paiement carte du stage. La session du portail a pu y
 * désigner un payeur, l'échéancier une échéance.
 */
const carte = (
  h: World,
  amountCents: number,
  more: {
    paidByMemberId?: string;
    paidByContactId?: string;
    installmentId?: string;
  } = {},
) => h.stripePaymentSucceeded({ invoiceId: 'inv-stage', amountCents, ...more });

/** Dominique, parent non adhérent, désigné payeur du foyer de la facture. */
const payeurContact = (h: World) => {
  h.familyMembers.push({
    contactId: 'c-1',
    familyId: 'fam-1',
    linkRole: FamilyMemberLinkRole.PAYER,
  });
};

const statut = (h: World) => h.invoices.find((i) => i.id === 'inv-stage')!.status;
const encaisse = (h: World) =>
  h.payments.filter((p) => p.invoiceId === 'inv-stage').map((p) => p.amountCents);

/** Ce que le trésorier lit quand la carte apporte plus que le reste dû. */
const orphelinPartiel = (recu: number, enregistre: number) =>
  `[stripe] ENCAISSEMENT ORPHELIN PARTIEL : paymentIntent pi_carte (${recu} cts) reçu pour la facture inv-stage du club club-1, dont le reste dû n'était que de ${enregistre} cts. Payment de ${enregistre} cts créé ; ${recu - enregistre} cts sans Payment — remboursement de l'excédent probablement dû.`;

/** Ce qu'il lit quand le payeur de la session ne passe plus le contrôle. */
const payeurRefuse = (payeur: string, motif: string, suite: string) =>
  `[stripe] paymentIntent pi_carte (facture inv-stage, club club-1) : le payeur ${payeur} ne passe plus le contrôle — ${motif}. ${suite}`;

/** Les journaux, muets pendant les tests : les erreurs, où se lit un orphelin, et les avertissements. */
let journal: jest.SpyInstance;
let avertissements: jest.SpyInstance;
beforeEach(() => {
  journal = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  avertissements = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
});
afterEach(() => {
  journal.mockRestore();
  avertissements.mockRestore();
});

describe('un payeur que le contrôle refuse quand Stripe annonce l’argent', () => {
  it('fiche désactivée depuis l’ouverture du paiement : le paiement solde la facture à son nom, et le refus se lit', async () => {
    const h = stage();
    h.members[0].status = MemberStatus.INACTIVE;

    await expect(carte(h, 3000, { paidByMemberId: 'm-1' })).resolves.toBeUndefined();

    expect(h.payments).toEqual([
      expect.objectContaining({ invoiceId: 'inv-stage', amountCents: 3000, paidByMemberId: 'm-1' }),
    ]);
    expect(statut(h)).toBe(InvoiceStatus.PAID);
    expect(avertissements).toHaveBeenCalledWith(
      payeurRefuse('m-1', 'Payeur membre introuvable pour ce club', 'Paiement enregistré à son nom.'),
    );
    expect(journal).not.toHaveBeenCalled();
    // Réponse sans erreur : l'événement reste réservé, Stripe ne rejoue pas.
    expect(h.webhookEvents).toEqual(['evt_pi_carte']);
  });

  it('sortie du foyer de la facture : le paiement solde la facture à son nom', async () => {
    const h = stage();
    h.familyMembers.length = 0;

    await expect(carte(h, 3000, { paidByMemberId: 'm-1' })).resolves.toBeUndefined();

    expect(h.payments).toEqual([
      expect.objectContaining({ amountCents: 3000, paidByMemberId: 'm-1' }),
    ]);
    expect(statut(h)).toBe(InvoiceStatus.PAID);
    expect(avertissements).toHaveBeenCalledWith(
      payeurRefuse(
        'm-1',
        'Le payeur doit appartenir au foyer de la facture',
        'Paiement enregistré à son nom.',
      ),
    );
  });

  it('fiche absente du club : le paiement solde la facture sans payeur', async () => {
    const h = stage();

    await expect(carte(h, 3000, { paidByMemberId: 'm-supprime' })).resolves.toBeUndefined();

    expect(h.payments).toEqual([
      expect.objectContaining({ amountCents: 3000, paidByMemberId: null }),
    ]);
    expect(statut(h)).toBe(InvoiceStatus.PAID);
    expect(avertissements).toHaveBeenCalledWith(
      payeurRefuse(
        'm-supprime',
        'Payeur membre introuvable pour ce club',
        'Fiche absente du club : paiement enregistré sans payeur.',
      ),
    );
  });

  it('payeur du foyer : le paiement est à son nom, sans avertissement', async () => {
    const h = stage();

    await expect(carte(h, 3000, { paidByMemberId: 'm-1' })).resolves.toBeUndefined();

    expect(h.payments).toEqual([
      expect.objectContaining({ amountCents: 3000, paidByMemberId: 'm-1' }),
    ]);
    expect(avertissements).not.toHaveBeenCalled();
  });

  it('payeur contact du foyer : le paiement est à son nom, sans avertissement', async () => {
    const h = stage();
    payeurContact(h);

    await expect(carte(h, 3000, { paidByContactId: 'c-1' })).resolves.toBeUndefined();

    expect(h.payments).toEqual([
      expect.objectContaining({
        amountCents: 3000,
        paidByMemberId: null,
        paidByContactId: 'c-1',
      }),
    ]);
    expect(statut(h)).toBe(InvoiceStatus.PAID);
    expect(avertissements).not.toHaveBeenCalled();
  });

  it('contact qui n’est plus payeur du foyer : le paiement solde la facture à son nom', async () => {
    const h = stage();

    await expect(carte(h, 3000, { paidByContactId: 'c-1' })).resolves.toBeUndefined();

    expect(h.payments).toEqual([
      expect.objectContaining({ amountCents: 3000, paidByContactId: 'c-1' }),
    ]);
    expect(avertissements).toHaveBeenCalledWith(
      payeurRefuse(
        'c-1',
        'Le contact payeur doit être désigné pour le foyer de la facture',
        'Paiement enregistré à son nom.',
      ),
    );
  });

  it('contact absent du club : le paiement solde la facture sans payeur', async () => {
    const h = stage();

    await expect(
      carte(h, 3000, { paidByContactId: 'c-supprime' }),
    ).resolves.toBeUndefined();

    expect(h.payments).toEqual([
      expect.objectContaining({ amountCents: 3000, paidByContactId: null }),
    ]);
    expect(avertissements).toHaveBeenCalledWith(
      payeurRefuse(
        'c-supprime',
        'Payeur contact introuvable pour ce club',
        'Fiche absente du club : paiement enregistré sans payeur.',
      ),
    );
  });

  it('une lecture en panne n’est pas un refus : le webhook lève, et le rejeu de Stripe enregistre', async () => {
    const h = stage();
    h.db.member.findFirst.mockRejectedValueOnce(new Error('base indisponible'));

    await expect(carte(h, 3000, { paidByMemberId: 'm-1' })).rejects.toThrow('base indisponible');
    expect(h.payments).toEqual([]);
    // La réservation est rendue : Stripe peut rejouer.
    expect(h.webhookEvents).toEqual([]);

    await expect(carte(h, 3000, { paidByMemberId: 'm-1' })).resolves.toBeUndefined();
    expect(h.payments).toEqual([
      expect.objectContaining({ amountCents: 3000, paidByMemberId: 'm-1' }),
    ]);
  });
});

describe('un paiement carte supérieur au reste dû', () => {
  it('une saisie commitée pendant le paiement : la carte solde le reste dû, et l’excédent se lit en ENCAISSEMENT ORPHELIN PARTIEL', async () => {
    const h = stage();
    h.raceWindow(2);
    const paiementCarte = h.atMoment('payment', () => carte(h, 3000));

    await especes(h, 1000);

    expect(await paiementCarte.outcome()).toEqual({ status: 'fulfilled', value: undefined });
    expect(encaisse(h)).toEqual([1000, 2000]);
    expect(statut(h)).toBe(InvoiceStatus.PAID);
    expect(journal).toHaveBeenCalledWith(orphelinPartiel(3000, 2000));
    // Réponse sans erreur : l'événement reste réservé, Stripe ne rejoue pas.
    expect(h.webhookEvents).toEqual(['evt_pi_carte']);
  });

  it('un avoir émis pendant le paiement : même signalement', async () => {
    const h = makeWorld({
      orders: [],
      variants: [],
      invoices: [
        STAGE(),
        INVOICE({
          id: 'cn-1',
          shopOrderId: null,
          status: InvoiceStatus.PAID,
          amountCents: 500,
          isCreditNote: true,
          parentInvoiceId: 'inv-stage',
          createdAt: T1,
        }),
      ],
    });

    await expect(carte(h, 3000)).resolves.toBeUndefined();

    expect(encaisse(h)).toEqual([2500]);
    expect(statut(h)).toBe(InvoiceStatus.PAID);
    expect(journal).toHaveBeenCalledWith(orphelinPartiel(3000, 2500));
  });

  it('montant égal au reste dû : aucun signalement', async () => {
    const h = stage();

    await expect(carte(h, 3000)).resolves.toBeUndefined();

    expect(encaisse(h)).toEqual([3000]);
    expect(journal).not.toHaveBeenCalled();
  });
});

describe('rendre l’excédent depuis Stripe', () => {
  /** Le stage soldé : 10 € en espèces, puis 30 € par carte, dont 20 € enregistrés. */
  const solde = () =>
    makeWorld({
      orders: [],
      variants: [],
      invoices: [STAGE({ status: InvoiceStatus.PAID })],
      payments: [
        PAYMENT({ id: 'pay-especes', invoiceId: 'inv-stage', amountCents: 1000 }),
        PAYMENT({
          id: 'pay-carte',
          invoiceId: 'inv-stage',
          amountCents: 2000,
          method: ClubPaymentMethod.STRIPE_CARD,
          externalRef: 'pi_carte',
          financialAccountId: 'fa-transit',
          createdAt: T1,
        }),
      ],
    });

  /** Les remboursements de la charge de 30 €, que chaque livraison reprend tous. */
  const rendus = (
    h: World,
    eventId: string,
    refunds: Array<{ id: string; amountCents: number; paymentId?: string }>,
  ) => h.stripeChargeRefunded({ eventId, capturedCents: 3000, refunds });

  const rendusSurLaFacture = (h: World) => h.refundsOf().map((p) => p.amountCents);
  const avoirs = (h: World) => h.creditNotesOf().map((c) => c.amountCents);

  it('le tableau de bord rend les 10 € d’excédent : ni paiement négatif, ni avoir', async () => {
    const h = solde();

    await expect(
      rendus(h, 'evt_1', [{ id: 're_excedent', amountCents: 1000 }]),
    ).resolves.toBeUndefined();

    expect(h.refundsOf()).toEqual([]);
    expect(h.creditNotesOf()).toEqual([]);
    expect(statut(h)).toBe(InvoiceStatus.PAID);
  });

  it('le tableau de bord rend 15 € : l’excédent d’abord, puis 5 € de l’encaissement avec leur avoir', async () => {
    const h = solde();

    await rendus(h, 'evt_1', [{ id: 're_15', amountCents: 1500 }]);

    expect(h.refundsOf()).toEqual([
      expect.objectContaining({
        invoiceId: 'inv-stage',
        amountCents: -500,
        stripeRefundId: 're_15',
        refundedPaymentId: 'pay-carte',
      }),
    ]);
    expect(h.creditNotesOf()).toEqual([
      expect.objectContaining({ parentInvoiceId: 'inv-stage', amountCents: 500 }),
    ]);
  });

  it('un remboursement lancé depuis ClubFlow rend l’encaissement qu’il désigne, même quand l’excédent reste à rendre', async () => {
    const h = solde();

    await rendus(h, 'evt_1', [{ id: 're_app', amountCents: 500, paymentId: 'pay-carte' }]);
    expect(rendusSurLaFacture(h)).toEqual([-500]);
    expect(avoirs(h)).toEqual([500]);

    // L'excédent, rendu ensuite depuis le tableau de bord, n'écrit rien de plus.
    await rendus(h, 'evt_2', [
      { id: 're_excedent', amountCents: 1000 },
      { id: 're_app', amountCents: 500, paymentId: 'pay-carte' },
    ]);
    expect(rendusSurLaFacture(h)).toEqual([-500]);
    expect(avoirs(h)).toEqual([500]);
  });

  it('chaque livraison reprend tous les remboursements : l’excédent n’est rendu qu’une fois, quel que soit l’ordre', async () => {
    const h = solde();

    await rendus(h, 'evt_1', [{ id: 're_a', amountCents: 1000 }]);
    await rendus(h, 'evt_2', [
      { id: 're_b', amountCents: 1000 },
      { id: 're_a', amountCents: 1000 },
    ]);
    await rendus(h, 'evt_3', [
      { id: 're_a', amountCents: 1000 },
      { id: 're_b', amountCents: 1000 },
    ]);

    // 20 € rendus : 10 € d'excédent, 10 € de l'encaissement, et un seul avoir.
    expect(rendusSurLaFacture(h)).toEqual([-1000]);
    expect(avoirs(h)).toEqual([1000]);
  });

  it('deux livraisons simultanées, chacune commençant par un autre remboursement : l’excédent n’est déduit qu’une fois', async () => {
    const h = solde();
    h.raceWindow(2);
    const seconde = h.atMoment('refund', () =>
      rendus(h, 'evt_b', [
        { id: 're_b', amountCents: 1000 },
        { id: 're_a', amountCents: 1000 },
      ]),
    );

    await expect(
      rendus(h, 'evt_a', [
        { id: 're_a', amountCents: 1000 },
        { id: 're_b', amountCents: 1000 },
      ]),
    ).resolves.toBeUndefined();

    expect((await seconde.outcome()).status).toBe('fulfilled');
    expect(rendusSurLaFacture(h)).toEqual([-1000]);
    expect(avoirs(h)).toEqual([1000]);
  });
});

describe('le rejeu d’une livraison qui a levé après le commit', () => {
  it('dernière échéance, facture soldée : le rejeu retente le soldage de l’échéance, sans ENCAISSEMENT ORPHELIN', async () => {
    const h = stage();
    h.scheduleEngine.markInstallmentPaid.mockRejectedValueOnce(new Error('base indisponible'));

    await expect(carte(h, 3000, { installmentId: 'inst-3' })).rejects.toThrow('base indisponible');
    // Le paiement est commité et solde la facture ; la réservation est rendue.
    expect(encaisse(h)).toEqual([3000]);
    expect(statut(h)).toBe(InvoiceStatus.PAID);
    expect(h.webhookEvents).toEqual([]);

    await expect(carte(h, 3000, { installmentId: 'inst-3' })).resolves.toBeUndefined();

    const [paiement] = h.payments;
    expect(h.scheduleEngine.markInstallmentPaid.mock.calls).toEqual([
      ['inst-3', paiement.id],
      ['inst-3', paiement.id],
    ]);
    expect(encaisse(h)).toEqual([3000]);
    expect(journal).not.toHaveBeenCalled();
    // Ni recette de plus ; les frais, jamais atteints par la première livraison, sont tentés.
    expect(h.accounting.recordIncomeFromPayment).toHaveBeenCalledTimes(1);
    expect(h.stripeFees.syncFeesForPayment.mock.calls).toEqual([[paiement.id]]);
    expect(h.webhookEvents).toEqual(['evt_pi_carte']);
  });

  it('échéance intermédiaire, facture encore due : le rejeu retente le soldage de l’échéance', async () => {
    const h = stage();
    h.scheduleEngine.markInstallmentPaid.mockRejectedValueOnce(new Error('base indisponible'));

    await expect(carte(h, 1000, { installmentId: 'inst-1' })).rejects.toThrow('base indisponible');
    expect(statut(h)).toBe(InvoiceStatus.OPEN);

    await expect(carte(h, 1000, { installmentId: 'inst-1' })).resolves.toBeUndefined();

    const [paiement] = h.payments;
    expect(h.scheduleEngine.markInstallmentPaid.mock.calls).toEqual([
      ['inst-1', paiement.id],
      ['inst-1', paiement.id],
    ]);
    expect(encaisse(h)).toEqual([1000]);
    expect(statut(h)).toBe(InvoiceStatus.OPEN);
    expect(journal).not.toHaveBeenCalled();
  });

  it('facture introuvable : ENCAISSEMENT ORPHELIN, et réponse sans erreur', async () => {
    const h = stage();

    await expect(
      h.stripePaymentSucceeded({ invoiceId: 'inv-disparue', amountCents: 3000 }),
    ).resolves.toBeUndefined();

    expect(h.payments).toEqual([]);
    expect(journal).toHaveBeenCalledWith(
      `[stripe] ENCAISSEMENT ORPHELIN : paymentIntent pi_carte (3000 cts) reçu pour la facture inv-disparue du club club-1, introuvable. Aucun Payment créé — remboursement probablement dû.`,
    );
    expect(h.webhookEvents).toEqual(['evt_pi_carte']);
  });
});
