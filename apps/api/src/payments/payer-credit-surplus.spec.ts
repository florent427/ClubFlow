import { ClubPaymentMethod, InvoicePurpose, InvoiceStatus } from '@prisma/client';
import { CLUB, monde, type Monde } from '../../test/payer-credit-world';

/**
 * Trop-perçu d'un encaissement (ADR-0022, tâche 4.1) : ce qui dépasse le reste
 * dû va au crédit d'une personne, dans la même transaction que le règlement.
 * Espèces ou virement seulement : un chèque ne règle qu'une pièce.
 */

const PAUL = { contactId: 'c-paul' } as const;

const recus = (w: Monde) =>
  w.invoices
    .filter((i) => i.purpose === InvoicePurpose.PAYER_CREDIT_DEPOSIT)
    .map((i) => [i.amountCents, i.status, i.payerCreditContactId]);
const paiementsDe = (w: Monde, invoiceId: string) =>
  w.payments.filter((p) => p.invoiceId === invoiceId).map((p) => [p.amountCents, p.method]);

describe('Trop-perçu d’un encaissement mis au crédit (ADR-0022, tâche 4.1)', () => {
  it('espèces : la facture se solde de son reste dû, le surplus devient une avance de la personne, en une transaction', async () => {
    const w = monde();
    const f = w.facture({ amountCents: 5000 });
    const commitsAvant = w.events.filter((e) => e === 'commit').length;

    await w.svc.recordManualPayment(CLUB, {
      invoiceId: f,
      amountCents: 7000,
      method: ClubPaymentMethod.MANUAL_CASH,
      surplusCreditContactId: 'c-paul',
    });

    expect(w.statut(f)).toBe(InvoiceStatus.PAID);
    expect(paiementsDe(w, f)).toEqual([[5000, ClubPaymentMethod.MANUAL_CASH]]);
    expect(recus(w)).toEqual([[2000, InvoiceStatus.PAID, 'c-paul']]);
    const recu = w.invoices.find((i) => i.purpose === InvoicePurpose.PAYER_CREDIT_DEPOSIT)!;
    expect(paiementsDe(w, recu.id)).toEqual([[2000, ClubPaymentMethod.MANUAL_CASH]]);
    expect(await w.credit(PAUL)).toBe(2000);
    // Une seule transaction, puis les deux écritures : la recette, et l'avance.
    const apres = w.events.slice(w.events.lastIndexOf('commit'));
    expect(w.events.filter((e) => e === 'commit').length - commitsAvant).toBe(1);
    expect(apres).toEqual(
      expect.arrayContaining([
        'écriture « Encaissement Cotisation 2026 » compte null',
        'écriture « Avance — Paul Payeur » compte null',
      ]),
    );
  });

  it('virement sur une banque : le surplus garde le compte de l’encaissement', async () => {
    const w = monde();
    const f = w.facture({ amountCents: 5000 });
    (w.svc as unknown as { financialAccounts: { getById: jest.Mock } }).financialAccounts.getById.mockResolvedValue({
      kind: 'BANK',
      isActive: true,
    });

    await w.svc.recordManualPayment(CLUB, {
      invoiceId: f,
      amountCents: 6000,
      method: ClubPaymentMethod.MANUAL_TRANSFER,
      financialAccountId: 'banque-1',
      surplusCreditContactId: 'c-paul',
    });

    expect(recus(w)).toEqual([[1000, InvoiceStatus.PAID, 'c-paul']]);
    expect(w.events).toContain('écriture « Avance — Paul Payeur » compte banque-1');
  });

  it('sans personne désignée, un montant trop élevé reste refusé', async () => {
    const w = monde();
    const f = w.facture({ amountCents: 5000 });

    await expect(
      w.svc.recordManualPayment(CLUB, { invoiceId: f, amountCents: 7000, method: ClubPaymentMethod.MANUAL_CASH }),
    ).rejects.toThrow('Montant trop élevé : reste à payer 5000 cts (centimes).');
    expect(w.payments).toEqual([]);
  });

  it('chèque : pas de surplus au crédit, rien n’est écrit', async () => {
    const w = monde();
    const f = w.facture({ amountCents: 5000 });

    await expect(
      w.svc.recordManualPayment(CLUB, {
        invoiceId: f,
        amountCents: 7000,
        method: ClubPaymentMethod.MANUAL_CHECK,
        surplusCreditContactId: 'c-paul',
      }),
    ).rejects.toThrow('Seul un encaissement en espèces ou par virement verse son surplus au crédit');
    expect(w.payments).toEqual([]);
    expect(recus(w)).toEqual([]);
  });

  it('montant égal au reste dû : la personne désignée ne reçoit rien', async () => {
    const w = monde();
    const f = w.facture({ amountCents: 5000 });

    await w.svc.recordManualPayment(CLUB, {
      invoiceId: f,
      amountCents: 5000,
      method: ClubPaymentMethod.MANUAL_CASH,
      surplusCreditContactId: 'c-paul',
    });

    expect(w.statut(f)).toBe(InvoiceStatus.PAID);
    expect(recus(w)).toEqual([]);
  });

  it('personne inconnue du club : refusé avant toute écriture', async () => {
    const w = monde();
    const f = w.facture({ amountCents: 5000 });

    await expect(
      w.svc.recordManualPayment(CLUB, {
        invoiceId: f,
        amountCents: 7000,
        method: ClubPaymentMethod.MANUAL_CASH,
        surplusCreditContactId: 'c-inconnu',
      }),
    ).rejects.toThrow();
    expect(w.payments).toEqual([]);
  });

  it('prélèvement en cours sur la facture : le surplus ne passe pas', async () => {
    const w = monde();
    const f = w.facture({ amountCents: 5000 });
    w.scheduleEngine.sumInFlightForInvoice.mockResolvedValue(1000);

    await expect(
      w.svc.recordManualPayment(CLUB, {
        invoiceId: f,
        amountCents: 7000,
        method: ClubPaymentMethod.MANUAL_CASH,
        surplusCreditContactId: 'c-paul',
      }),
    ).rejects.toThrow('est en cours de dénouement sur cette facture');
    expect(w.payments).toEqual([]);
  });

  it('le reste dû change avant la relecture sous verrou : la répartition confirmée est refusée, rien n’est écrit', async () => {
    const w = monde();
    const f = w.facture({ amountCents: 5000 });
    // Un encaissement de 10 € est commité entre les contrôles et la transaction.
    const transaction = w.prisma.$transaction;
    w.prisma.$transaction = async (fn) => {
      w.prisma.$transaction = transaction;
      w.payments.push({
        id: 'autre-saisie', clubId: CLUB, invoiceId: f, amountCents: 1000, method: ClubPaymentMethod.MANUAL_TRANSFER,
        externalRef: null, financialAccountId: null, paidByMemberId: null, paidByContactId: null,
        refundedPaymentId: null, createdAt: new Date(),
      });
      return transaction(fn);
    };

    await expect(
      w.svc.recordManualPayment(CLUB, {
        invoiceId: f,
        amountCents: 7000,
        method: ClubPaymentMethod.MANUAL_CASH,
        surplusCreditContactId: 'c-paul',
      }),
    ).rejects.toThrow('La facture vient de changer : reste à encaisser 40,00 €.');
    expect(paiementsDe(w, f)).toEqual([[1000, ClubPaymentMethod.MANUAL_TRANSFER]]);
    expect(recus(w)).toEqual([]);
  });

  it('le reste dû augmente avant la relecture sous verrou : refusé aussi, la facture ne resterait pas soldée', async () => {
    const w = monde();
    const f = w.facture({ amountCents: 5000 });
    w.payments.push({
      id: 'encaissement', clubId: CLUB, invoiceId: f, amountCents: 1000, method: ClubPaymentMethod.MANUAL_CASH,
      externalRef: null, financialAccountId: null, paidByMemberId: null, paidByContactId: null,
      refundedPaymentId: null, createdAt: new Date(),
    });
    // Reste dû lu : 40 €. Avant la transaction, ces 10 € sont rendus : il redevient 50 €.
    const transaction = w.prisma.$transaction;
    w.prisma.$transaction = async (fn) => {
      w.prisma.$transaction = transaction;
      w.payments.push({
        id: 'rendu', clubId: CLUB, invoiceId: f, amountCents: -1000, method: ClubPaymentMethod.MANUAL_CASH,
        externalRef: null, financialAccountId: null, paidByMemberId: null, paidByContactId: null,
        refundedPaymentId: 'encaissement', createdAt: new Date(),
      });
      return transaction(fn);
    };

    await expect(
      w.svc.recordManualPayment(CLUB, {
        invoiceId: f,
        amountCents: 7000,
        method: ClubPaymentMethod.MANUAL_CASH,
        surplusCreditContactId: 'c-paul',
      }),
    ).rejects.toThrow('La facture vient de changer : reste à encaisser 50,00 €.');
    expect(recus(w)).toEqual([]);
  });

  it('qui peut recevoir le surplus : les payeurs de la facture, crédit nul compris', async () => {
    const w = monde();
    const f = w.facture({ amountCents: 5000 });

    const sansCredit = await w.svc.listInvoicePayerPeople(CLUB, f);
    expect(sansCredit).toEqual(
      expect.arrayContaining([{ memberId: null, contactId: 'c-paul', displayName: 'Paul Payeur', balanceCents: 0 }]),
    );
    expect(sansCredit.map((p) => p.displayName)).not.toContain('Léa Ailleurs');
    expect(await w.svc.listPayerCreditCandidates(CLUB, f)).toEqual([]);

    w.avance(PAUL, 3000);
    expect(await w.svc.listPayerCreditCandidates(CLUB, f)).toEqual([
      { memberId: null, contactId: 'c-paul', displayName: 'Paul Payeur', balanceCents: 3000 },
    ]);
  });

  it('un échec pendant l’écriture de l’avance défait aussi le règlement', async () => {
    const w = monde();
    const f = w.facture({ amountCents: 5000 });
    jest
      .spyOn(w.svc as unknown as { createPayerCreditDepositInTx: () => Promise<unknown> }, 'createPayerCreditDepositInTx')
      .mockRejectedValueOnce(new Error('base indisponible'));

    await expect(
      w.svc.recordManualPayment(CLUB, {
        invoiceId: f,
        amountCents: 7000,
        method: ClubPaymentMethod.MANUAL_CASH,
        surplusCreditContactId: 'c-paul',
      }),
    ).rejects.toThrow('base indisponible');

    expect(w.payments).toEqual([]);
    expect(w.statut(f)).toBe(InvoiceStatus.OPEN);
    expect(recus(w)).toEqual([]);
  });
});
