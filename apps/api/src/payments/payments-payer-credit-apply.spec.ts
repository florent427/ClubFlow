/* eslint-disable @typescript-eslint/no-explicit-any */
import { BadRequestException } from '@nestjs/common';
import {
  ClubPaymentMethod,
  FamilyMemberLinkRole,
  InvoicePurpose,
  InvoiceStatus,
} from '@prisma/client';
import { CLUB, monde } from '../../test/payer-credit-world';

/**
 * Régler une facture avec le crédit (ADR-0022, §3), et ce qui l'entoure : la
 * saisie manuelle sous verrou, le crédit rendu par un avoir.
 */

describe('applyPayerCredit — régler une facture avec le crédit (ADR-0022, §3)', () => {
  it('au solde : facture PAYÉE, écriture de crédit après le commit, échéancier clos', async () => {
    const w = monde();
    w.avance({ memberId: 'm-camille' }, 5000);
    const f = w.facture({ amountCents: 5000 });

    const r = await w.svc.applyPayerCredit(CLUB, { invoiceId: f, memberId: 'm-camille' });

    expect(w.imputations(f)).toEqual([
      expect.objectContaining({ amountCents: 5000, paidByMemberId: 'm-camille', paidByContactId: null }),
    ]);
    expect(w.statut(f)).toBe(InvoiceStatus.PAID);
    expect(w.events).toEqual([
      'commit',
      `échéancier clos ${f}`,
      'écriture « Crédit — Cotisation 2026 » compte null',
    ]);
    expect(r).toMatchObject({ invoiceStatus: InvoiceStatus.PAID, invoiceBalanceCents: 0, creditBalanceCents: 0 });
    expect(await w.credit({ contactId: 'c-camille' })).toBe(0);
  });

  it('crédit insuffisant : il règle ce qu’il peut, la facture reste ouverte', async () => {
    const w = monde();
    w.avance({ contactId: 'c-paul' }, 3000);
    const f = w.facture({ amountCents: 4000 });

    const r = await w.svc.applyPayerCredit(CLUB, { invoiceId: f, contactId: 'c-paul' });

    expect(w.imputations(f).map((p) => p.amountCents)).toEqual([3000]);
    expect(w.statut(f)).toBe(InvoiceStatus.OPEN);
    expect(w.scheduleEngine.closeScheduleForInvoice).not.toHaveBeenCalled();
    expect(r).toMatchObject({ invoiceStatus: InvoiceStatus.OPEN, invoiceBalanceCents: 1000, creditBalanceCents: 0 });
  });

  it('refuse un montant au-delà du crédit, ou au-delà du reste dû', async () => {
    const w = monde();
    w.avance({ contactId: 'c-paul' }, 3000);
    w.avance({ memberId: 'm-camille' }, 9000);
    const f = w.facture({ amountCents: 4000 });

    await expect(
      w.svc.applyPayerCredit(CLUB, { invoiceId: f, contactId: 'c-paul', amountCents: 3500 }),
    ).rejects.toThrow('Au plus 30,00 €');
    await expect(
      w.svc.applyPayerCredit(CLUB, { invoiceId: f, memberId: 'm-camille', amountCents: 4500 }),
    ).rejects.toThrow('Au plus 40,00 €');
    expect(w.imputations()).toEqual([]);
  });

  it('sans crédit, ou avec un crédit négatif à régulariser : refus', async () => {
    const w = monde();
    const f = w.facture({ amountCents: 4000 });
    const autre = w.facture({ amountCents: 1500, status: InvoiceStatus.PAID });
    // Zoé a versé 10 € et en a utilisé 15 : son crédit est de −5 €.
    w.avance({ memberId: 'm-zoe' }, 1000);
    w.payments.push({
      id: 'dette', clubId: CLUB, invoiceId: autre, amountCents: 1500, method: ClubPaymentMethod.PAYER_CREDIT,
      externalRef: null, paidByMemberId: 'm-zoe', paidByContactId: null, refundedPaymentId: null,
      createdAt: new Date(Date.UTC(2026, 8, 2)),
    });

    await expect(w.svc.applyPayerCredit(CLUB, { invoiceId: f, memberId: 'm-zoe' })).rejects.toThrow(
      'pas de crédit disponible',
    );
    await expect(w.svc.applyPayerCredit(CLUB, { invoiceId: f, contactId: 'c-paul' })).rejects.toThrow(
      'pas de crédit disponible',
    );
  });

  it('refuse une facture soldée, un avoir ou un reçu d’avance', async () => {
    const w = monde();
    w.avance({ memberId: 'm-camille' }, 9000);
    const soldee = w.facture({ status: InvoiceStatus.PAID });
    const avoir = w.facture({ isCreditNote: true, status: InvoiceStatus.PAID });
    const recu = w.invoices.find((i) => i.purpose === InvoicePurpose.PAYER_CREDIT_DEPOSIT)!.id;

    for (const invoiceId of [soldee, avoir, recu]) {
      await expect(
        w.svc.applyPayerCredit(CLUB, { invoiceId, memberId: 'm-camille' }),
      ).rejects.toBeInstanceOf(BadRequestException);
    }
    expect(w.imputations()).toEqual([]);
  });

  it('règle au nom du profil autorisé : le membre du foyer, sinon le contact payeur du même compte', async () => {
    const w = monde();
    w.avance({ memberId: 'm-camille' }, 1000);
    w.avance({ contactId: 'c-jo' }, 1000);
    const f = w.facture({ amountCents: 9000 });

    // Camille désignée par son contact, sans lien au foyer : c'est son membre qui paie.
    await w.svc.applyPayerCredit(CLUB, { invoiceId: f, contactId: 'c-camille' });
    // Jo désigné par son membre, hors du foyer : c'est son contact payeur qui paie.
    await w.svc.applyPayerCredit(CLUB, { invoiceId: f, memberId: 'm-jo' });

    expect(w.imputations(f).map((p) => [p.paidByMemberId, p.paidByContactId])).toEqual([
      ['m-camille', null],
      [null, 'c-jo'],
    ]);
  });

  it('une personne sans lien avec la facture ne la règle pas', async () => {
    const w = monde();
    w.avance({ memberId: 'm-lea' }, 5000);
    const f = w.facture({ amountCents: 5000 });

    await expect(w.svc.applyPayerCredit(CLUB, { invoiceId: f, memberId: 'm-lea' })).rejects.toThrow(
      'ne peut pas régler cette facture',
    );
    expect(await w.credit({ memberId: 'm-lea' })).toBe(5000);
  });

  it('facture boutique sans foyer : son acheteur la règle, et la commande est servie', async () => {
    const w = monde();
    w.avance({ contactId: 'c-sam' }, 2500);
    const f = w.facture({ familyId: null, shopOrderId: 'so-1', amountCents: 2500, label: 'Commande boutique — Sam' });

    await w.svc.applyPayerCredit(CLUB, { invoiceId: f, contactId: 'c-sam' });

    expect(w.statut(f)).toBe(InvoiceStatus.PAID);
    expect(w.shop.fulfillPaidShopOrderInTx).toHaveBeenCalledWith(expect.anything(), CLUB, 'so-1');
  });

  it('adhésion sans foyer : le membre facturé la règle', async () => {
    const w = monde();
    w.avance({ memberId: 'm-lea' }, 3000);
    const f = w.facture({ familyId: null, amountCents: 3000 });
    w.invoiceLines.push({ id: 'ligne-1', invoiceId: f, memberId: 'm-lea' });

    await w.svc.applyPayerCredit(CLUB, { invoiceId: f, memberId: 'm-lea' });

    expect(w.statut(f)).toBe(InvoiceStatus.PAID);
  });
});

describe('applyPayerCredit — concurrence (ADR-0022, §3)', () => {
  it('deux imputations simultanées d’une même personne ne dépensent pas deux fois son crédit', async () => {
    const w = monde();
    w.avance({ memberId: 'm-camille' }, 5000);
    const f1 = w.facture({ amountCents: 5000 });
    const f2 = w.facture({ amountCents: 5000 });
    w.fenetreDeCourse(15);

    const issues = await Promise.allSettled([
      w.svc.applyPayerCredit(CLUB, { invoiceId: f1, memberId: 'm-camille', amountCents: 5000 }),
      // Le contact du même compte : même personne, même verrou.
      w.svc.applyPayerCredit(CLUB, { invoiceId: f2, contactId: 'c-camille', amountCents: 5000 }),
    ]);

    expect(issues.map((i) => i.status).sort()).toEqual(['fulfilled', 'rejected']);
    expect(w.imputations().reduce((s, p) => s + p.amountCents, 0)).toBe(5000);
    expect(await w.credit({ memberId: 'm-camille' })).toBe(0);
  });

  it('deux personnes ne surpaient pas une même facture', async () => {
    const w = monde();
    w.avance({ memberId: 'm-camille' }, 4000);
    w.avance({ contactId: 'c-paul' }, 4000);
    const f = w.facture({ amountCents: 4000 });
    w.fenetreDeCourse(15);

    const issues = await Promise.allSettled([
      w.svc.applyPayerCredit(CLUB, { invoiceId: f, memberId: 'm-camille', amountCents: 4000 }),
      w.svc.applyPayerCredit(CLUB, { invoiceId: f, contactId: 'c-paul', amountCents: 4000 }),
    ]);

    expect(issues.map((i) => i.status).sort()).toEqual(['fulfilled', 'rejected']);
    expect(w.imputations(f).reduce((s, p) => s + p.amountCents, 0)).toBe(4000);
  });

  it('une facture annulée avant la relecture sous verrou ne se règle plus', async () => {
    const w = monde();
    w.avance({ memberId: 'm-camille' }, 5000);
    const f = w.facture({ amountCents: 5000 });
    w.fenetreDeCourse(15);

    const imputation = w.svc.applyPayerCredit(CLUB, { invoiceId: f, memberId: 'm-camille' });
    // Annulée pendant que l'imputation lit encore la facture, hors transaction :
    // le premier contrôle l'a vue ouverte, seule la relecture la voit annulée.
    await new Promise((r) => setTimeout(r, 5));
    w.invoices.find((i) => i.id === f)!.status = InvoiceStatus.VOID;

    await expect(imputation).rejects.toThrow('vient d’être soldée ou annulée');
    expect(w.imputations()).toEqual([]);
    expect(w.statut(f)).toBe(InvoiceStatus.VOID);
    expect(await w.credit({ memberId: 'm-camille' })).toBe(5000);
  });
});

describe('listPayerCreditCandidates — qui peut régler avec son crédit', () => {
  it('les personnes autorisées qui ont du crédit, une fois chacune', async () => {
    const w = monde();
    w.avance({ memberId: 'm-camille' }, 2000);
    w.avance({ contactId: 'c-camille' }, 1000);
    w.avance({ contactId: 'c-paul' }, 3000);
    w.avance({ memberId: 'm-lea' }, 5000);
    // Camille est aussi payeuse par son contact : une seule ligne pour elle.
    w.links.push({
      id: 'l-5',
      familyId: 'fam-1',
      memberId: null,
      contactId: 'c-camille',
      linkRole: FamilyMemberLinkRole.PAYER,
    });
    const f = w.facture({ amountCents: 9000 });

    const candidats = await w.svc.listPayerCreditCandidates(CLUB, f);

    // Léa n'a aucun lien avec la facture ; Zoé et Jo n'ont pas de crédit.
    expect(candidats).toEqual([
      { memberId: 'm-camille', contactId: null, displayName: 'Camille Titulaire', balanceCents: 3000 },
      { memberId: null, contactId: 'c-paul', displayName: 'Paul Payeur', balanceCents: 3000 },
    ]);
  });

  it('personne sur une facture soldée, et l’acheteur sur une facture boutique', async () => {
    const w = monde();
    w.avance({ memberId: 'm-camille' }, 2000);
    w.avance({ contactId: 'c-sam' }, 1500);
    const soldee = w.facture({ status: InvoiceStatus.PAID });
    const boutique = w.facture({ familyId: null, shopOrderId: 'so-1', amountCents: 2500 });

    expect(await w.svc.listPayerCreditCandidates(CLUB, soldee)).toEqual([]);
    expect(await w.svc.listPayerCreditCandidates(CLUB, boutique)).toEqual([
      { memberId: null, contactId: 'c-sam', displayName: 'Sam Acheteur', balanceCents: 1500 },
    ]);
  });
});

describe('recordManualPayment — sous le verrou de la facture (ADR-0022, §3)', () => {
  it('deux saisies simultanées ne surpaient pas la facture', async () => {
    const w = monde();
    const f = w.facture({ amountCents: 4000 });
    w.fenetreDeCourse(15);

    const issues = await Promise.allSettled([
      w.svc.recordManualPayment(CLUB, { invoiceId: f, amountCents: 3000, method: ClubPaymentMethod.MANUAL_CASH }),
      w.svc.recordManualPayment(CLUB, { invoiceId: f, amountCents: 3000, method: ClubPaymentMethod.MANUAL_TRANSFER }),
    ]);

    expect(issues.map((i) => i.status).sort()).toEqual(['fulfilled', 'rejected']);
    expect(w.payments.filter((p) => p.invoiceId === f).reduce((s, p) => s + p.amountCents, 0)).toBe(3000);
  });

  it('une facture annulée avant la relecture sous verrou ne s’encaisse plus', async () => {
    const w = monde();
    const f = w.facture({ amountCents: 4000 });
    w.fenetreDeCourse(15);

    const saisie = w.svc.recordManualPayment(CLUB, {
      invoiceId: f,
      amountCents: 3000,
      method: ClubPaymentMethod.MANUAL_CASH,
    });
    await new Promise((r) => setTimeout(r, 5));
    w.invoices.find((i) => i.id === f)!.status = InvoiceStatus.VOID;

    await expect(saisie).rejects.toThrow('La facture vient de changer');
    expect(w.payments.filter((p) => p.invoiceId === f)).toEqual([]);
    expect(w.statut(f)).toBe(InvoiceStatus.VOID);
  });

  it('le solde, avoirs déduits, passe la facture PAYÉE', async () => {
    const w = monde();
    const f = w.facture({ amountCents: 2500 });
    w.facture({ isCreditNote: true, parentInvoiceId: f, status: InvoiceStatus.PAID, amountCents: 500 });

    await w.svc.recordManualPayment(CLUB, { invoiceId: f, amountCents: 2000, method: ClubPaymentMethod.MANUAL_CASH });

    // Comparé au montant nominal (20 € ≠ 25 €), la facture restait ouverte.
    expect(w.statut(f)).toBe(InvoiceStatus.PAID);
  });
});

describe('createCreditNote — le crédit rendu (ADR-0022, §3)', () => {
  it('avoir total sur une facture réglée par crédit : le crédit revient, contre-passé sur l’imputation', async () => {
    const w = monde();
    w.avance({ memberId: 'm-camille' }, 5000);
    const f = w.facture({ amountCents: 5000 });
    await w.svc.applyPayerCredit(CLUB, { invoiceId: f, memberId: 'm-camille' });
    const imputation = w.imputations(f)[0];

    const avoir = await w.svc.createCreditNote(CLUB, f, 'Inscription annulée', 5000);

    expect(w.imputations(f).map((p) => [p.amountCents, p.refundedPaymentId, p.paidByMemberId])).toEqual([
      [5000, null, 'm-camille'],
      [-5000, imputation.id, 'm-camille'],
    ]);
    expect(await w.credit({ contactId: 'c-camille' })).toBe(5000);
    expect(w.accounting.createContraEntryForCreditNote).toHaveBeenCalledTimes(1);
    expect(w.accounting.createContraEntryForCreditNote).toHaveBeenCalledWith(CLUB, avoir.id, imputation.id, null, 5000);
  });

  it('un avoir qui éteint le reste dû ne rend rien', async () => {
    const w = monde();
    w.avance({ contactId: 'c-paul' }, 3000);
    const f = w.facture({ amountCents: 4000 });
    await w.svc.applyPayerCredit(CLUB, { invoiceId: f, contactId: 'c-paul' });

    const avoir = await w.svc.createCreditNote(CLUB, f, 'Geste commercial', 1000);

    expect(w.imputations(f).map((p) => p.amountCents)).toEqual([3000]);
    expect(await w.credit({ contactId: 'c-paul' })).toBe(0);
    expect(w.accounting.createContraEntryForCreditNote).toHaveBeenCalledWith(CLUB, avoir.id, undefined, undefined, undefined);
  });

  it('avoir au-delà du reste dû : seule la part payée revient au crédit, la contre-passation se partage', async () => {
    const w = monde();
    w.avance({ contactId: 'c-paul' }, 3000);
    const f = w.facture({ amountCents: 4000 });
    await w.svc.applyPayerCredit(CLUB, { invoiceId: f, contactId: 'c-paul' });
    const imputation = w.imputations(f)[0];

    const avoir = await w.svc.createCreditNote(CLUB, f, 'Stage annulé', 2500);

    // 40 € dus, 30 € payés, avoir de 25 € : il reste 15 € dus, 15 € sont rendus.
    expect(w.imputations(f).map((p) => p.amountCents)).toEqual([3000, -1500]);
    expect(await w.credit({ contactId: 'c-paul' })).toBe(1500);
    expect(w.accounting.createContraEntryForCreditNote.mock.calls).toEqual([
      [CLUB, avoir.id, imputation.id, null, 1500],
      [CLUB, avoir.id, null, null, 1000],
    ]);
  });

  it('facture payée en espèces et par crédit : le crédit est rendu d’abord, le reste suit l’espèce', async () => {
    const w = monde();
    w.avance({ memberId: 'm-camille' }, 3000);
    const f = w.facture({ amountCents: 5000 });
    await w.svc.recordManualPayment(CLUB, { invoiceId: f, amountCents: 2000, method: ClubPaymentMethod.MANUAL_CASH });
    await w.svc.applyPayerCredit(CLUB, { invoiceId: f, memberId: 'm-camille' });

    const avoir = await w.svc.createCreditNote(CLUB, f, 'Départ du club', 5000);

    expect(await w.credit({ memberId: 'm-camille' })).toBe(3000);
    expect(w.accounting.createContraEntryForCreditNote.mock.calls.map((c: unknown[]) => c.slice(1))).toEqual([
      [avoir.id, w.imputations(f)[0].id, null, 3000],
      [avoir.id, null, null, 2000],
    ]);
  });

  it('deux avoirs successifs rendent chaque imputation une fois, la plus récente d’abord', async () => {
    const w = monde();
    w.avance({ memberId: 'm-camille' }, 5000);
    const f = w.facture({ amountCents: 5000 });
    await w.svc.applyPayerCredit(CLUB, { invoiceId: f, memberId: 'm-camille', amountCents: 3000 });
    await w.svc.applyPayerCredit(CLUB, { invoiceId: f, memberId: 'm-camille', amountCents: 2000 });
    const [ancienne, recente] = w.imputations(f);

    await w.svc.createCreditNote(CLUB, f, 'Premier remboursement', 2000);
    await w.svc.createCreditNote(CLUB, f, 'Second remboursement', 3000);

    expect(
      w.imputations(f).filter((p) => p.amountCents < 0).map((p) => [p.amountCents, p.refundedPaymentId]),
    ).toEqual([
      [-2000, recente.id],
      [-3000, ancienne.id],
    ]);
    expect(await w.credit({ memberId: 'm-camille' })).toBe(5000);
  });
});
