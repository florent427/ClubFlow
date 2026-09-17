/* eslint-disable @typescript-eslint/no-explicit-any */
import { BadRequestException, Logger } from '@nestjs/common';
import { ClubPaymentMethod, InvoicePurpose, InvoiceStatus, type Club } from '@prisma/client';
import Stripe from 'stripe';
import {
  camillePayeuse,
  CLUB,
  compte,
  COMPTE_CLUB,
  monde,
  portail,
  type Monde,
} from '../../test/payer-credit-world';
import { StripeCheckoutService } from './stripe-checkout.service';
import { StripeConnectService } from './stripe-connect.service';

/**
 * L'argent du crédit par carte (ADR-0022) : « Créditer mon compte » au portail
 * et dans l'appli (lot 3), et le remboursement par carte d'une avance (part
 * carte du lot 4). Sur le vrai calcul du crédit, les vraies imputations, les
 * verrous simulés et la vraie porte du webhook, signature comprise.
 *
 * Seul le client Stripe est simulé : la session, le remboursement et la
 * lecture du déjà-remboursé. Ses webhooks restent les vrais.
 */

jest.mock('stripe');
const StripeSimule = Stripe as unknown as jest.Mock;
const StripeReel = jest.requireActual('stripe');
(Stripe as any).webhooks = (StripeReel.default ?? StripeReel).webhooks;

const sessionsCreate = jest.fn();
const refundsCreate = jest.fn();
const paymentIntentsRetrieve = jest.fn();

beforeEach(() => {
  process.env.STRIPE_SECRET_KEY = 'sk_test_monde';
  process.env.MEMBER_PORTAL_ORIGIN = 'https://portail.test';
  sessionsCreate.mockReset();
  refundsCreate.mockReset();
  paymentIntentsRetrieve.mockReset();
  StripeSimule.mockImplementation(() => ({
    checkout: { sessions: { create: sessionsCreate } },
    refunds: { create: refundsCreate },
    paymentIntents: { retrieve: paymentIntentsRetrieve },
  }));
  sessionsCreate.mockResolvedValue({ id: 'cs_avance', url: 'https://checkout.stripe.test/cs_avance' });
});

afterEach(() => {
  jest.restoreAllMocks();
});

const clubDe = (w: Monde) => w.clubs[0] as Club;
const checkoutDe = (w: Monde) =>
  new StripeCheckoutService(w.prisma as never, new StripeConnectService(w.prisma as never));
const recus = (w: Monde) => w.invoices.filter((i) => i.purpose === InvoicePurpose.PAYER_CREDIT_DEPOSIT);

describe('« Créditer mon compte » : la session Stripe (ADR-0022, lot 3)', () => {
  it('un payeur crédite SON compte, jamais le profil actif, et le webhook en fait une avance', async () => {
    const w = monde();
    camillePayeuse(w);
    const paulSurLeProfilDeCamille = compte('u-paul', { memberId: 'm-camille' });

    const session = await portail(w, checkoutDe(w)).viewerCreatePayerCreditCheckoutSession(
      paulSurLeProfilDeCamille,
      clubDe(w),
      2500,
    );

    expect(session.url).toBe('https://checkout.stripe.test/cs_avance');
    const [params, options] = sessionsCreate.mock.calls[0];
    expect(options).toEqual({ stripeAccount: COMPTE_CLUB });
    expect(params.line_items[0].price_data.unit_amount).toBe(2500);
    // Ce que Stripe renverra au webhook : la metadata du paymentIntent.
    await w.avanceCarte({ ref: {}, amountCents: 2500, metadata: params.payment_intent_data.metadata });
    expect(await w.credit({ contactId: 'c-paul' })).toBe(2500);
    expect(await w.credit({ memberId: 'm-camille' })).toBe(0);
  });

  it('de 1 € à 1 000 € : hors bornes, refusé avant Stripe', async () => {
    const w = monde();
    const paul = compte('u-paul', { contactId: 'c-paul' });
    const resolver = portail(w, checkoutDe(w));

    // 250,5 cts : dans les bornes, mais pas un nombre entier de centimes.
    for (const cents of [99, 100_001, 0, 250.5]) {
      await expect(
        resolver.viewerCreatePayerCreditCheckoutSession(paul, clubDe(w), cents),
      ).rejects.toThrow(BadRequestException);
    }
    expect(sessionsCreate).not.toHaveBeenCalled();

    await resolver.viewerCreatePayerCreditCheckoutSession(paul, clubDe(w), 100);
    await resolver.viewerCreatePayerCreditCheckoutSession(paul, clubDe(w), 100_000);
    expect(sessionsCreate.mock.calls.map(([p]) => p.line_items[0].price_data.unit_amount)).toEqual([
      100, 100_000,
    ]);
  });

  it('un profil qui ne paie pour aucun foyer ne crédite rien', async () => {
    const w = monde();

    await expect(
      portail(w, checkoutDe(w)).viewerCreatePayerCreditCheckoutSession(
        compte('u-camille', { memberId: 'm-camille' }),
        clubDe(w),
        2500,
      ),
    ).rejects.toThrow('Seul le payeur du foyer');
    expect(sessionsCreate).not.toHaveBeenCalled();
  });

  it('un club dont Stripe n’encaisse pas : ni proposé au portail, ni accepté', async () => {
    const w = monde();
    const paul = compte('u-paul', { contactId: 'c-paul' });
    const resolver = portail(w, checkoutDe(w));
    expect((await resolver.viewerPayerCredit(paul, clubDe(w))).cardTopUpAvailable).toBe(true);

    w.clubs[0].stripeChargesEnabled = false;

    expect((await resolver.viewerPayerCredit(paul, clubDe(w))).cardTopUpAvailable).toBe(false);
    await expect(resolver.viewerCreatePayerCreditCheckoutSession(paul, clubDe(w), 2500)).rejects.toThrow(
      BadRequestException,
    );
    expect(sessionsCreate).not.toHaveBeenCalled();
  });

  it('retour de paiement : les factures du portail sur le web, le lien profond dans l’appli', async () => {
    const w = monde();
    const paul = compte('u-paul', { contactId: 'c-paul' });
    const resolver = portail(w, checkoutDe(w));

    const web = await resolver.viewerCreatePayerCreditCheckoutSession(paul, clubDe(w), 2500);
    const appli = await resolver.viewerCreatePayerCreditCheckoutSession(paul, clubDe(w), 2500, true);

    expect(sessionsCreate.mock.calls[0][0].success_url).toBe('https://portail.test/factures?club=club-demo&paid=1');
    expect(web.paymentReturnUrl).toBe('https://portail.test/factures?club=club-demo&paid=1');
    expect(sessionsCreate.mock.calls[1][0].success_url).toBe('https://portail.test/app-return.html?paid=1');
    expect(appli.paymentReturnUrl).toBe('clubflow://payment-return');
  });
});

describe('Avance par carte encaissée : le webhook (ADR-0022, lot 3)', () => {
  it('reçu PAYÉ et paiement carte dans une transaction ; écriture et frais après le commit', async () => {
    const w = monde();

    await w.avanceCarte({ ref: { contactId: 'c-paul' }, amountCents: 2500 });

    expect(recus(w).map((r) => [r.status, r.amountCents, r.payerCreditContactId, r.stripePaymentIntentId, r.label])).toEqual([
      [InvoiceStatus.PAID, 2500, 'c-paul', 'pi_avance', 'Avance — Paul Payeur'],
    ]);
    const paiement = w.payments.find((p) => p.externalRef === 'pi_avance')!;
    expect(paiement).toMatchObject({
      method: ClubPaymentMethod.STRIPE_CARD,
      amountCents: 2500,
      paidByContactId: 'c-paul',
      stripeAccountId: COMPTE_CLUB,
      invoiceId: recus(w)[0].id,
    });
    expect(await w.credit({ contactId: 'c-paul' })).toBe(2500);
    expect(w.events).toEqual([
      'commit',
      'écriture « Stripe — Avance — Paul Payeur » compte null',
      `frais ${paiement.id}`,
    ]);
  });

  it('rejeu du même événement, nouvel événement du même paymentIntent, livraisons simultanées : un seul reçu', async () => {
    const w = monde();
    await w.avanceCarte({ ref: { contactId: 'c-paul' }, amountCents: 2500 });
    await w.avanceCarte({ ref: { contactId: 'c-paul' }, amountCents: 2500 });
    await w.avanceCarte({ ref: { contactId: 'c-paul' }, amountCents: 2500, eventId: 'evt_second' });
    expect(recus(w)).toHaveLength(1);

    w.fenetreDeCourse(5);
    await Promise.all([
      w.avanceCarte({ ref: { contactId: 'c-paul' }, amountCents: 1000, paymentIntentId: 'pi_double', eventId: 'evt_a' }),
      w.avanceCarte({ ref: { contactId: 'c-paul' }, amountCents: 1000, paymentIntentId: 'pi_double', eventId: 'evt_b' }),
    ]);

    expect(recus(w)).toHaveLength(2);
    expect(w.payments.filter((p) => p.method === ClubPaymentMethod.STRIPE_CARD)).toHaveLength(2);
    expect(await w.credit({ contactId: 'c-paul' })).toBe(3500);
  });

  it('venue d’un autre compte connecté, ou de la plateforme : rien n’est crédité, l’encaissement est signalé', async () => {
    const w = monde();
    const erreurs = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);

    await w.avanceCarte({ ref: { contactId: 'c-paul' }, amountCents: 2500, compte: 'acct_autre' });
    await w.avanceCarte({ ref: { contactId: 'c-paul' }, amountCents: 2500, compte: null, eventId: 'evt_plateforme' });

    expect(recus(w)).toEqual([]);
    expect(await w.credit({ contactId: 'c-paul' })).toBe(0);
    expect(erreurs.mock.calls.map(([m]) => String(m))).toEqual([
      expect.stringContaining('ENCAISSEMENT ORPHELIN : avance par carte pi_avance (2500 cts) reçue du compte acct_autre'),
      expect.stringContaining('ENCAISSEMENT ORPHELIN : avance par carte pi_avance (2500 cts) reçue du compte plateforme'),
    ]);
  });

  it('personne introuvable, ou metadata illisibles : signalé, sans erreur que Stripe rejouerait', async () => {
    const w = monde();
    const erreurs = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);

    await expect(
      w.avanceCarte({ ref: { memberId: 'm-inconnu' }, amountCents: 2500 }),
    ).resolves.toBeUndefined();
    await expect(
      w.avanceCarte({
        ref: {},
        amountCents: 2500,
        eventId: 'evt_illisible',
        metadata: { purpose: 'PAYER_CREDIT_DEPOSIT', clubId: CLUB, memberId: 'm-camille', contactId: 'c-paul' },
      }),
    ).resolves.toBeUndefined();

    expect(recus(w)).toEqual([]);
    expect(erreurs.mock.calls.map(([m]) => String(m))).toEqual([
      expect.stringContaining('pour une personne introuvable du club club-1'),
      expect.stringContaining('sans club ni personne lisibles'),
    ]);
    expect(w.webhookEvents.size).toBe(2);
  });
});

/** Paul a versé 50 € par carte, puis en a utilisé 30 : il lui reste 20 €. */
async function avanceEntameeDe20Euros(w: Monde) {
  await w.avanceCarte({ ref: { contactId: 'c-paul' }, amountCents: 5000 });
  const facture = w.facture({ amountCents: 3000 });
  await w.svc.applyPayerCredit(CLUB, { invoiceId: facture, contactId: 'c-paul' });
  paymentIntentsRetrieve.mockResolvedValue({
    latest_charge: { id: 'ch_avance', amount_refunded: 0, amount_captured: 5000, refunds: { data: [] } },
  });
  const paiementCarte = w.payments.find((p) => p.externalRef === 'pi_avance' && p.amountCents > 0)!;
  return { paiementCarte, recu: paiementCarte.invoiceId as string };
}

const rembourser = (w: Monde, paymentId: string, amountCents?: number) =>
  w.remboursements.refundPayment({ clubId: CLUB, paymentId, amountCents: amountCents ?? null, reason: 'Départ du club' });

describe('Rembourser une avance par carte (ADR-0022, part carte du lot 4)', () => {
  it('sans montant : au plus le crédit disponible, enregistré dès que Stripe l’accepte', async () => {
    const w = monde();
    const { paiementCarte, recu } = await avanceEntameeDe20Euros(w);
    refundsCreate.mockResolvedValue({ id: 're_1', amount: 2000, status: 'succeeded' });

    const res = await rembourser(w, paiementCarte.id);

    expect(res).toEqual({ refundId: 're_1', amountCents: 2000 });
    expect(refundsCreate).toHaveBeenCalledWith(
      expect.objectContaining({ payment_intent: 'pi_avance', amount: 2000 }),
      expect.objectContaining({ stripeAccount: COMPTE_CLUB }),
    );
    expect(w.payments.filter((p) => p.amountCents < 0).map((p) => [p.amountCents, p.stripeRefundId, p.refundedPaymentId, p.invoiceId])).toEqual([
      [-2000, 're_1', paiementCarte.id, recu],
    ]);
    const avoirs = w.invoices.filter((i) => i.isCreditNote);
    expect(avoirs.map((a) => [a.parentInvoiceId, a.amountCents])).toEqual([[recu, 2000]]);
    expect(await w.credit({ contactId: 'c-paul' })).toBe(0);
    // La contre-passation vise l'encaissement remboursé, après le commit.
    expect(
      (w.accounting.createContraEntryForCreditNote as jest.Mock).mock.calls.map((c) => c.slice(0, 3)),
    ).toEqual([[CLUB, avoirs[0].id, paiementCarte.id]]);
  });

  it('au-delà du crédit disponible, ou crédit épuisé : refusé, rien chez Stripe', async () => {
    const w = monde();
    const { paiementCarte } = await avanceEntameeDe20Euros(w);

    await expect(rembourser(w, paiementCarte.id, 2500)).rejects.toThrow(
      'Au plus 20,00 € : crédit disponible 20,00 €, remboursable sur cet encaissement 50,00 €.',
    );
    const autre = w.facture({ amountCents: 2000 });
    await w.svc.applyPayerCredit(CLUB, { invoiceId: autre, contactId: 'c-paul' });
    await expect(rembourser(w, paiementCarte.id)).rejects.toThrow(
      'Rien à rembourser : le crédit disponible de Paul Payeur est de 0,00 €.',
    );

    expect(refundsCreate).not.toHaveBeenCalled();
    expect(w.payments.filter((p) => p.amountCents < 0)).toEqual([]);
  });

  it('le webhook qui confirme ce remboursement ne l’écrit pas une seconde fois', async () => {
    const w = monde();
    const { paiementCarte } = await avanceEntameeDe20Euros(w);
    refundsCreate.mockResolvedValue({ id: 're_1', amount: 2000, status: 'succeeded' });
    await rembourser(w, paiementCarte.id);

    await w.chargeRemboursee({
      eventId: 'evt_re_1',
      capturedCents: 5000,
      refunds: [{ id: 're_1', amountCents: 2000, paymentId: paiementCarte.id }],
    });

    expect(w.payments.filter((p) => p.amountCents < 0)).toHaveLength(1);
    expect(w.invoices.filter((i) => i.isCreditNote)).toHaveLength(1);
    expect(await w.credit({ contactId: 'c-paul' })).toBe(0);
  });

  it('en attente chez Stripe : rien d’écrit ; le webhook l’enregistre quand il aboutit', async () => {
    const w = monde();
    const { paiementCarte } = await avanceEntameeDe20Euros(w);
    refundsCreate.mockResolvedValue({ id: 're_1', amount: 2000, status: 'pending' });

    await rembourser(w, paiementCarte.id);
    expect(w.payments.filter((p) => p.amountCents < 0)).toEqual([]);
    expect(await w.credit({ contactId: 'c-paul' })).toBe(2000);

    await w.chargeRemboursee({
      eventId: 'evt_re_1',
      capturedCents: 5000,
      refunds: [{ id: 're_1', amountCents: 2000, paymentId: paiementCarte.id }],
    });
    expect(w.payments.filter((p) => p.amountCents < 0).map((p) => p.amountCents)).toEqual([-2000]);
    expect(await w.credit({ contactId: 'c-paul' })).toBe(0);
  });

  it('une imputation simultanée attend le remboursement : le crédit ne sert pas deux fois', async () => {
    const w = monde();
    const { paiementCarte } = await avanceEntameeDe20Euros(w);
    const autre = w.facture({ amountCents: 2000 });
    let accepter!: () => void;
    const stripeRepond = new Promise<void>((r) => {
      accepter = r;
    });
    let stripeAppele!: () => void;
    const appelStripe = new Promise<void>((r) => {
      stripeAppele = r;
    });
    refundsCreate.mockImplementation(async () => {
      stripeAppele();
      await stripeRepond;
      return { id: 're_1', amount: 2000, status: 'succeeded' };
    });

    const remboursement = rembourser(w, paiementCarte.id);
    await appelStripe;
    const imputation = w.svc.applyPayerCredit(CLUB, { invoiceId: autre, contactId: 'c-paul' });
    await new Promise((r) => setTimeout(r, 20));
    accepter();

    // allSettled : si le remboursement échoue, l'imputation ne reste pas un rejet orphelin qui tue Jest.
    const [rembourse, impute] = await Promise.allSettled([remboursement, imputation]);
    expect(rembourse).toEqual({ status: 'fulfilled', value: { refundId: 're_1', amountCents: 2000 } });
    expect(impute).toMatchObject({
      status: 'rejected',
      reason: expect.objectContaining({ message: 'Paul Payeur n’a pas de crédit disponible.' }),
    });
    expect(w.imputations(autre)).toEqual([]);
    expect(await w.credit({ contactId: 'c-paul' })).toBe(0);
  });

  it('Stripe accepte mais l’enregistrement échoue : le trésorier voit le remboursement, le webhook l’écrit', async () => {
    const w = monde();
    const { paiementCarte } = await avanceEntameeDe20Euros(w);
    refundsCreate.mockResolvedValue({ id: 're_1', amount: 2000, status: 'succeeded' });
    jest.spyOn(w.creditNotes, 'create').mockRejectedValueOnce(new Error('base indisponible'));
    const erreurs = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);

    await expect(rembourser(w, paiementCarte.id)).resolves.toEqual({ refundId: 're_1', amountCents: 2000 });
    expect(w.payments.filter((p) => p.amountCents < 0)).toEqual([]);
    expect(erreurs).toHaveBeenCalledWith(expect.stringContaining('re_1 créé chez Stripe'));

    await w.chargeRemboursee({
      eventId: 'evt_re_1',
      capturedCents: 5000,
      refunds: [{ id: 're_1', amountCents: 2000, paymentId: paiementCarte.id }],
    });
    expect(w.payments.filter((p) => p.amountCents < 0).map((p) => p.amountCents)).toEqual([-2000]);
    expect(await w.credit({ contactId: 'c-paul' })).toBe(0);
  });
});
