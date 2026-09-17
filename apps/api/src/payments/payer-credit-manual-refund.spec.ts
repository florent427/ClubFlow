import { ClubPaymentMethod } from '@prisma/client';
import { CLUB, monde, type Monde } from '../../test/payer-credit-world';
import { PayerCreditRefundsService } from './payer-credit-refunds.service';

/**
 * Rembourser une avance hors carte (ADR-0022, tâche 4.2) : l'argent sort par le
 * moyen de l'avance, comme pour une commande boutique (ADR-0019), au plus le
 * crédit encore disponible, sous le verrou de la personne puis du reçu.
 */

const PAUL = { contactId: 'c-paul' } as const;

function service(w: Monde) {
  const financialAccounts = { getDefault: jest.fn(async () => ({ id: 'banque-club' })) };
  return new PayerCreditRefundsService(w.prisma as never, w.creditNotes, financialAccounts as never);
}

/** Paul a versé 50 €, puis en a utilisé 30 sur une facture : il lui reste 20 €. */
async function avanceEntamee(w: Monde, options: Parameters<Monde['avance']>[2] = {}) {
  const ids = w.avance(PAUL, 5000, options);
  const facture = w.facture({ amountCents: 3000 });
  await w.svc.applyPayerCredit(CLUB, { invoiceId: facture, contactId: 'c-paul' });
  return ids;
}

const remboursements = (w: Monde) =>
  w.payments
    .filter((p) => p.amountCents < 0)
    .map((p) => [p.amountCents, p.method, p.refundedPaymentId, p.invoiceId, p.financialAccountId]);
const avoirs = (w: Monde) => w.invoices.filter((i) => i.isCreditNote).map((a) => [a.parentInvoiceId, a.amountCents]);
const contrePassations = (w: Monde) =>
  (w.accounting.createContraEntryForCreditNote as jest.Mock).mock.calls.map((c) => c.slice(0, 4));

describe('Rembourser une avance hors carte (ADR-0022, tâche 4.2)', () => {
  it('espèces : au plus le crédit disponible, rendu en espèces ; contre-passation après le commit', async () => {
    const w = monde();
    const { recu, versement } = await avanceEntamee(w);
    (w.accounting.createContraEntryForCreditNote as jest.Mock).mockImplementation(async () => {
      w.events.push('contre-passation');
    });

    const res = await service(w).refundDeposit(CLUB, { paymentId: versement, amountCents: null, reason: 'Départ du club' });

    expect(res).toEqual(
      expect.objectContaining({ amountCents: 2000, kind: 'CASH', creditBalanceCents: 0 }),
    );
    expect(remboursements(w)).toEqual([[-2000, ClubPaymentMethod.MANUAL_CASH, versement, recu, null]]);
    expect(avoirs(w)).toEqual([[recu, 2000]]);
    expect(await w.credit(PAUL)).toBe(0);
    const avoir = w.invoices.find((i) => i.isCreditNote)!;
    expect(contrePassations(w)).toEqual([[CLUB, avoir.id, versement, null]]);
    expect(w.events.slice(-2)).toEqual(['commit', 'contre-passation']);
    expect(res.creditNoteId).toBe(avoir.id);
    expect(res.refundPaymentId).toBe(w.payments.find((p) => p.amountCents < 0)!.id);
  });

  it('virement : rendu par virement depuis la banque de l’encaissement', async () => {
    const w = monde();
    const { recu, versement } = await avanceEntamee(w, {
      method: ClubPaymentMethod.MANUAL_TRANSFER,
      financialAccountId: 'banque-releve',
    });

    const res = await service(w).refundDeposit(CLUB, { paymentId: versement, amountCents: 1500, reason: 'Trop versé' });

    expect(res.kind).toBe('TRANSFER');
    expect(remboursements(w)).toEqual([[-1500, ClubPaymentMethod.MANUAL_TRANSFER, versement, recu, 'banque-releve']]);
    expect(await w.credit(PAUL)).toBe(500);
  });

  it('chèque encore en portefeuille, rendu en entier : le chèque est rendu', async () => {
    const w = monde();
    const { recu, versement } = w.avance(PAUL, 2000, {
      method: ClubPaymentMethod.MANUAL_CHECK,
      cheque: { number: '4917', status: 'PENDING' },
    });

    const res = await service(w).refundDeposit(CLUB, { paymentId: versement, amountCents: null, reason: 'Chèque rendu' });

    expect(res.kind).toBe('CHEQUE_RETURN');
    expect(w.cheques.map((c) => [c.status, c.notes])).toEqual([['CANCELLED', 'Rendu : Chèque rendu']]);
    expect(remboursements(w)).toEqual([[-2000, ClubPaymentMethod.MANUAL_CHECK, versement, recu, null]]);
    expect(await w.credit(PAUL)).toBe(0);
  });

  it('chèque en portefeuille rendu en partie : reversé par virement depuis la banque du club, le chèque reste à remettre', async () => {
    const w = monde();
    const { recu, versement } = await avanceEntamee(w, {
      method: ClubPaymentMethod.MANUAL_CHECK,
      cheque: { number: '4918', status: 'PENDING' },
    });

    const res = await service(w).refundDeposit(CLUB, { paymentId: versement, amountCents: null, reason: 'Reliquat' });

    expect(res.kind).toBe('CHEQUE_PARTIAL');
    expect(w.cheques.map((c) => c.status)).toEqual(['PENDING']);
    expect(remboursements(w)).toEqual([[-2000, ClubPaymentMethod.MANUAL_TRANSFER, versement, recu, 'banque-club']]);
    const avoir = w.invoices.find((i) => i.isCreditNote)!;
    expect(contrePassations(w)).toEqual([[CLUB, avoir.id, versement, 'banque-club']]);
  });

  it('chèque déjà remis : remboursé par virement depuis la banque de sa remise', async () => {
    const w = monde();
    const { recu, versement } = await avanceEntamee(w, {
      method: ClubPaymentMethod.MANUAL_CHECK,
      cheque: { number: '4919', status: 'DEPOSITED', depositId: 'remise-1', depositFinancialAccountId: 'banque-remise' },
    });

    const res = await service(w).refundDeposit(CLUB, { paymentId: versement, amountCents: 1000, reason: 'Reliquat' });

    expect(res.kind).toBe('CHEQUE_DEPOSITED');
    expect(remboursements(w)).toEqual([[-1000, ClubPaymentMethod.MANUAL_TRANSFER, versement, recu, 'banque-remise']]);
    const avoir = w.invoices.find((i) => i.isCreditNote)!;
    expect(contrePassations(w)).toEqual([[CLUB, avoir.id, versement, 'banque-remise']]);
  });

  it('le plafond compte les remboursements déjà faits sur ce versement', async () => {
    const w = monde();
    const { versement } = w.avance(PAUL, 5000);
    const svc = service(w);
    await svc.refundDeposit(CLUB, { paymentId: versement, amountCents: 1000, reason: 'Premier rendu' });

    await expect(
      svc.refundDeposit(CLUB, { paymentId: versement, amountCents: 4500, reason: 'Second rendu' }),
    ).rejects.toThrow('Au plus 40,00 € : crédit disponible 40,00 €, remboursable sur cet encaissement 40,00 €.');
    // Un second versement de Paul fait monter le crédit, pas ce qui reste à rendre sur le premier.
    w.avance(PAUL, 3000);
    await expect(
      svc.refundDeposit(CLUB, { paymentId: versement, amountCents: 4500, reason: 'Second rendu' }),
    ).rejects.toThrow('Au plus 40,00 € : crédit disponible 70,00 €, remboursable sur cet encaissement 40,00 €.');
  });

  it('au-delà du crédit, crédit épuisé ou montant nul : refusé, rien d’écrit', async () => {
    const w = monde();
    const { versement } = await avanceEntamee(w);
    const svc = service(w);

    await expect(
      svc.refundDeposit(CLUB, { paymentId: versement, amountCents: 2500, reason: 'Trop' }),
    ).rejects.toThrow('Au plus 20,00 € : crédit disponible 20,00 €, remboursable sur cet encaissement 50,00 €.');
    await expect(
      svc.refundDeposit(CLUB, { paymentId: versement, amountCents: 0, reason: 'Rien' }),
    ).rejects.toThrow('Le montant doit être positif.');
    const autre = w.facture({ amountCents: 2000 });
    await w.svc.applyPayerCredit(CLUB, { invoiceId: autre, contactId: 'c-paul' });
    await expect(
      svc.refundDeposit(CLUB, { paymentId: versement, amountCents: null, reason: 'Épuisé' }),
    ).rejects.toThrow('Rien à rembourser : le crédit disponible de Paul Payeur est de 0,00 €.');

    expect(remboursements(w)).toEqual([]);
    expect(avoirs(w)).toEqual([]);
  });

  it('refusé : versement carte, encaissement d’une facture, remboursement, motif vide', async () => {
    const w = monde();
    const { versement } = w.avance(PAUL, 2000, { method: ClubPaymentMethod.STRIPE_CARD });
    const facture = w.facture({ amountCents: 2000 });
    w.payments.push({
      id: 'encaissement-facture', clubId: CLUB, invoiceId: facture, amountCents: 2000,
      method: ClubPaymentMethod.MANUAL_CASH, externalRef: null, financialAccountId: null,
      paidByMemberId: null, paidByContactId: 'c-paul', refundedPaymentId: null, createdAt: new Date(),
    });
    const { recu, versement: especes } = w.avance(PAUL, 1000);
    w.payments.push({
      id: 'deja-rendu', clubId: CLUB, invoiceId: recu, amountCents: -500,
      method: ClubPaymentMethod.MANUAL_CASH, externalRef: null, financialAccountId: null,
      paidByMemberId: null, paidByContactId: 'c-paul', refundedPaymentId: especes, createdAt: new Date(),
    });
    const svc = service(w);
    const ecrits = w.payments.length;

    await expect(svc.refundDeposit(CLUB, { paymentId: versement, amountCents: null, reason: 'Carte' })).rejects.toThrow(
      'Une avance versée par carte se rembourse sur la carte.',
    );
    await expect(
      svc.refundDeposit(CLUB, { paymentId: 'encaissement-facture', amountCents: null, reason: 'Facture' }),
    ).rejects.toThrow('Seul le versement d’une avance se rembourse au crédit');
    await expect(svc.refundDeposit(CLUB, { paymentId: 'deja-rendu', amountCents: null, reason: 'Négatif' })).rejects.toThrow(
      'Ce paiement est déjà un remboursement : remboursez le versement qu’il désigne.',
    );
    await expect(svc.refundDeposit(CLUB, { paymentId: especes, amountCents: null, reason: '   ' })).rejects.toThrow(
      'Motif obligatoire.',
    );
    await expect(svc.refundDeposit(CLUB, { paymentId: 'inconnu', amountCents: null, reason: 'x' })).rejects.toThrow(
      'Encaissement introuvable',
    );

    expect(w.payments).toHaveLength(ecrits);
    expect(avoirs(w)).toEqual([]);
  });

  it('chèque impayé : refusé avec la raison', async () => {
    const w = monde();
    const { versement } = w.avance(PAUL, 2000, {
      method: ClubPaymentMethod.MANUAL_CHECK,
      cheque: { number: '4920', status: 'UNPAID' },
    });

    await expect(
      service(w).refundDeposit(CLUB, { paymentId: versement, amountCents: null, reason: 'Impayé' }),
    ).rejects.toThrow('Le chèque n° 4920 est impayé ou annulé');
    expect(remboursements(w)).toEqual([]);
  });

  it('une imputation simultanée attend le remboursement : le crédit ne sert pas deux fois', async () => {
    const w = monde();
    const { versement } = await avanceEntamee(w);
    const autre = w.facture({ amountCents: 2000 });
    w.fenetreDeCourse(5);

    const [rembourse, impute] = await Promise.allSettled([
      service(w).refundDeposit(CLUB, { paymentId: versement, amountCents: null, reason: 'Départ' }),
      w.svc.applyPayerCredit(CLUB, { invoiceId: autre, contactId: 'c-paul' }),
    ]);

    expect(rembourse).toMatchObject({ status: 'fulfilled', value: { amountCents: 2000 } });
    expect(impute).toMatchObject({
      status: 'rejected',
      reason: expect.objectContaining({ message: 'Paul Payeur n’a pas de crédit disponible.' }),
    });
    expect(w.imputations(autre)).toEqual([]);
    expect(await w.credit(PAUL)).toBe(0);
  });

  it('un échec d’écriture défait tout : ni paiement négatif, ni chèque rendu, ni contre-passation', async () => {
    const w = monde();
    const { versement } = w.avance(PAUL, 2000, {
      method: ClubPaymentMethod.MANUAL_CHECK,
      cheque: { number: '4921', status: 'PENDING' },
    });
    jest.spyOn(w.creditNotes, 'create').mockRejectedValueOnce(new Error('base indisponible'));

    await expect(
      service(w).refundDeposit(CLUB, { paymentId: versement, amountCents: null, reason: 'Chèque rendu' }),
    ).rejects.toThrow('base indisponible');

    expect(remboursements(w)).toEqual([]);
    expect(w.cheques.map((c) => c.status)).toEqual(['PENDING']);
    expect(contrePassations(w)).toEqual([]);
    expect(await w.credit(PAUL)).toBe(2000);
  });
});
