import { BadRequestException, ForbiddenException } from '@nestjs/common';
import {
  ChequeStatus,
  ClubPaymentMethod,
  InvoicePurpose,
  InvoiceStatus,
} from '@prisma/client';
import {
  CHEQUE,
  INVOICE,
  PAYMENT,
  makeWorld,
  type World,
} from '../../test/shop-order-world';

/**
 * Annuler un encaissement saisi par erreur.
 *
 * Le 2026-09-19, un chèque de 91,50 € a été saisi à 366 € en prod, et rien dans
 * l'application ne permettait de le reprendre : il a fallu corriger la base à
 * la main. Une annulation dit que l'argent n'a jamais été reçu : la dette
 * revient entière, sans avoir, la recette est contre-passée, et le chèque
 * encore en portefeuille est annulé.
 */

/** L'adhésion de Sonia : 366 €, soldée par un chèque saisi à tort à 366 €. */
const adhesion = (over: { cheque?: Partial<ReturnType<typeof CHEQUE>> } = {}) =>
  makeWorld({
    orders: [],
    variants: [],
    invoices: [
      INVOICE({
        id: 'inv-adh',
        shopOrderId: null,
        purpose: InvoicePurpose.CHARGE,
        status: InvoiceStatus.PAID,
        amountCents: 36600,
        label: 'Adhésion 2026-2027 — Sonia BENARD',
      }),
    ],
    payments: [
      PAYMENT({
        id: 'pay-cheque',
        invoiceId: 'inv-adh',
        amountCents: 36600,
        method: ClubPaymentMethod.MANUAL_CHECK,
        externalRef: '5704017',
        financialAccountId: 'fa-cheques',
        paidByMemberId: null,
      }),
    ],
    cheques: [
      CHEQUE({
        id: 'chq-sonia',
        paymentId: 'pay-cheque',
        number: '5704017',
        ...over.cheque,
      }),
    ],
  });

const annuler = (h: World, paymentId = 'pay-cheque', motif = 'Montant faux : 91,50 €') =>
  h.cancellations.cancel('club-1', 'user-tresorier', paymentId, motif);

const facture = (h: World) => h.invoices.find((i) => i.id === 'inv-adh')!;
const lignes = (h: World) =>
  h.payments.filter((p) => p.invoiceId === 'inv-adh').map((p) => p.amountCents);
const resteDu = (h: World) =>
  facture(h).amountCents - lignes(h).reduce((s, c) => s + c, 0);

describe('annuler un encaissement saisi par erreur', () => {
  it('le chèque mal saisi : la dette revient entière, sans avoir, et le chèque sort du portefeuille', async () => {
    const h = adhesion();
    h.accounting.paymentIncomeEntryState.mockResolvedValue({
      entryId: 'ecr-366',
      blockedBecause: null,
    });

    const annulation = await annuler(h);

    expect(annulation).toMatchObject({
      invoiceId: 'inv-adh',
      amountCents: -36600,
      method: ClubPaymentMethod.MANUAL_CHECK,
      refundedPaymentId: 'pay-cheque',
      cancellationReason: 'Montant faux : 91,50 €',
      recordedByUserId: 'user-tresorier',
      financialAccountId: 'fa-cheques',
    });
    expect(lignes(h)).toEqual([36600, -36600]);
    expect(facture(h).status).toBe(InvoiceStatus.OPEN);
    expect(resteDu(h)).toBe(36600);
    // Aucun avoir : rien n'est rendu, la dette reste.
    expect(h.invoices.filter((i) => i.isCreditNote)).toEqual([]);
    expect(h.cheques[0]).toMatchObject({
      status: ChequeStatus.CANCELLED,
      notes: 'Saisie annulée : Montant faux : 91,50 €',
    });
  });

  it('la recette est contre-passée DANS la transaction de l’annulation', async () => {
    const h = adhesion();
    h.accounting.paymentIncomeEntryState.mockResolvedValue({
      entryId: 'ecr-366',
      blockedBecause: null,
    });

    await annuler(h);

    expect(h.accounting.createContraEntry).toHaveBeenCalledTimes(1);
    const [club, user, entry, reason, tx] = h.accounting.createContraEntry.mock
      .calls[0] as unknown[];
    expect([club, user, entry, reason]).toEqual([
      'club-1',
      'user-tresorier',
      'ecr-366',
      'Annulation d’encaissement : Montant faux : 91,50 €',
    ]);
    // Le client de la transaction, pas celui de la base : la contre-passation
    // naît avec l'annulation, ou pas du tout.
    expect(tx).toBeDefined();
    expect(tx).not.toBe(h.db);
  });

  it('après l’annulation, le bon montant se saisit et la facture reste due du reste', async () => {
    const h = adhesion();
    await annuler(h);

    await h.paymentsService.recordManualPayment(
      'club-1',
      { invoiceId: 'inv-adh', amountCents: 9150, method: ClubPaymentMethod.MANUAL_CASH },
      'user-tresorier',
    );

    expect(resteDu(h)).toBe(27450);
    expect(facture(h).status).toBe(InvoiceStatus.OPEN);
  });

  it('sans recette (module comptable coupé), rien à contre-passer', async () => {
    const h = adhesion();

    await annuler(h);

    expect(h.accounting.createContraEntry).not.toHaveBeenCalled();
    expect(lignes(h)).toEqual([36600, -36600]);
  });
});

describe('ce qui ne s’annule pas ici', () => {
  const refus = async (h: World, attendu: string, paymentId?: string) => {
    const avant = JSON.stringify({ p: h.payments, c: h.cheques, i: h.invoices });
    await expect(annuler(h, paymentId)).rejects.toThrow(attendu);
    // Rien n'a bougé.
    expect(JSON.stringify({ p: h.payments, c: h.cheques, i: h.invoices })).toBe(avant);
    expect(h.accounting.createContraEntry).not.toHaveBeenCalled();
  };

  it('une seconde annulation du même encaissement', async () => {
    const h = adhesion();
    await annuler(h);
    h.accounting.createContraEntry.mockClear();

    await refus(h, 'Cet encaissement a déjà été annulé ou remboursé.');
  });

  it('la ligne d’annulation elle-même', async () => {
    const h = adhesion();
    const ligne = await annuler(h);
    h.accounting.createContraEntry.mockClear();

    await refus(h, 'Cette ligne est déjà une annulation ou un remboursement.', ligne.id);
  });

  it('un chèque déjà remis en banque', async () => {
    const h = adhesion({
      cheque: { status: ChequeStatus.DEPOSITED, depositId: 'remise-1' },
    });

    await refus(h, 'Ce chèque n’est plus en portefeuille : annule d’abord sa remise en banque.');
  });

  it('un paiement par carte : il se rembourse', async () => {
    const h = adhesion();
    h.payments[0].method = ClubPaymentMethod.STRIPE_CARD;

    await refus(
      h,
      'Seul un encaissement saisi à la main (espèces, chèque, virement) s’annule ici. Un paiement par carte se rembourse.',
    );
  });

  it('une commande boutique : elle s’annule avec la commande', async () => {
    const h = adhesion();
    facture(h).shopOrderId = 'order-1';

    await refus(
      h,
      'L’encaissement d’une commande boutique s’annule avec la commande, depuis la Boutique.',
    );
  });

  it('un reçu d’avance : il se rembourse depuis son reçu', async () => {
    const h = adhesion();
    facture(h).purpose = InvoicePurpose.PAYER_CREDIT_DEPOSIT;

    await refus(h, 'Une avance ne s’annule pas ici : rembourse-la depuis son reçu.');
  });

  it('une recette verrouillée ou rapprochée : le motif de la comptabilité est rendu tel quel', async () => {
    const h = adhesion();
    h.accounting.paymentIncomeEntryState.mockResolvedValue({
      entryId: 'ecr-366',
      blockedBecause: 'Cet encaissement est rapproché d’une ligne de relevé bancaire : défais d’abord le rapprochement.',
    });

    await refus(
      h,
      'Cet encaissement est rapproché d’une ligne de relevé bancaire : défais d’abord le rapprochement.',
    );
  });

  it('sans motif', async () => {
    const h = adhesion();

    await expect(
      h.cancellations.cancel('club-1', 'user-tresorier', 'pay-cheque', '   '),
    ).rejects.toThrow(BadRequestException);
    expect(lignes(h)).toEqual([36600]);
  });
});

describe('ce qui échoue en route défait tout', () => {
  it('une remise créée pendant les contrôles : le chèque ne s’annule plus, et rien n’est écrit', async () => {
    const h = adhesion();
    const transaction = h.db.$transaction;
    // Juste avant la transaction : la remise part, le chèque avec elle.
    h.db.$transaction = (fn: unknown) => {
      h.cheques[0].status = ChequeStatus.DEPOSITED;
      h.cheques[0].depositId = 'remise-1';
      return transaction(fn);
    };

    await expect(annuler(h)).rejects.toThrow(
      'Ce chèque vient d’être remis en banque : il ne s’annule plus ici.',
    );
    expect(lignes(h)).toEqual([36600]);
    expect(facture(h).status).toBe(InvoiceStatus.PAID);
  });

  it('une période close refuse la contre-passation : l’annulation entière est défaite', async () => {
    const h = adhesion();
    h.accounting.paymentIncomeEntryState.mockResolvedValue({
      entryId: 'ecr-366',
      blockedBecause: null,
    });
    h.accounting.createContraEntry.mockRejectedValueOnce(
      new ForbiddenException('La période 2026-09 est verrouillée.'),
    );

    await expect(annuler(h)).rejects.toThrow('La période 2026-09 est verrouillée.');

    expect(lignes(h)).toEqual([36600]);
    expect(h.cheques[0].status).toBe(ChequeStatus.PENDING);
    expect(facture(h).status).toBe(InvoiceStatus.PAID);
  });
});
