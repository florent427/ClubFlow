import { ClubPaymentMethod, InvoiceStatus } from '@prisma/client';
import { INVOICE, makeWorld, type World } from '../../test/shop-order-world';

/**
 * Qui a saisi cet encaissement ?
 *
 * Le modèle `Payment` ne gardait aucun auteur : seule la remise de chèques en
 * avait un (audit du 2026-09-14, point 2.6). Une erreur de caisse ne se
 * remontait donc à personne, et le trésorier n'avait personne à qui demander.
 * Un encaissement sans geste humain — carte, prélèvement — n'en a toujours
 * pas : c'est la différence qui fait sens.
 */
const stage = () =>
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
  });

const paiement = (h: World) =>
  h.payments.find((p) => p.invoiceId === 'inv-stage');

describe('l’auteur d’un encaissement', () => {
  it('une saisie à la main garde le compte qui l’a faite', async () => {
    const h = stage();

    await h.paymentsService.recordManualPayment(
      'club-1',
      {
        invoiceId: 'inv-stage',
        amountCents: 3000,
        method: ClubPaymentMethod.MANUAL_CASH,
      },
      'user-tresorier',
    );

    expect(paiement(h)).toMatchObject({
      amountCents: 3000,
      recordedByUserId: 'user-tresorier',
    });
  });

  it('une avance saisie au guichet aussi', async () => {
    const h = stage();

    await h.paymentsService.recordPayerCreditDeposit(
      'club-1',
      {
        memberId: 'm-1',
        amountCents: 2000,
        method: ClubPaymentMethod.MANUAL_CASH,
      },
      'user-tresorier',
    );

    const avance = h.payments.find((p) => p.invoiceId !== 'inv-stage');
    expect(avance).toMatchObject({
      amountCents: 2000,
      recordedByUserId: 'user-tresorier',
    });
  });

  it('un encaissement par carte n’a pas d’auteur : personne ne l’a saisi', async () => {
    const h = stage();

    await h.stripePaymentSucceeded({ invoiceId: 'inv-stage', amountCents: 3000 });

    expect(paiement(h)?.recordedByUserId ?? null).toBeNull();
  });
});
