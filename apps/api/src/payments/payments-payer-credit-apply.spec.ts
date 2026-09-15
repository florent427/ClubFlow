/* eslint-disable @typescript-eslint/no-explicit-any */
import { BadRequestException } from '@nestjs/common';
import {
  ClubPaymentMethod,
  FamilyMemberLinkRole,
  InvoicePurpose,
  InvoiceStatus,
} from '@prisma/client';
import { CreditNotesService } from './credit-notes.service';
import { readPayerCredit } from './payer-credit-balance';
import { resolvePayerCreditHolder, type PayerCreditHolderRef } from './payer-credit-holder';
import { PaymentsService } from './payments.service';

/**
 * Régler une facture avec le crédit (ADR-0022, §3), et ce qui l'entoure : la
 * saisie manuelle sous verrou, le crédit rendu par un avoir.
 *
 * Le monde simulé applique les `where` comme Prisma (clause absente = aucun
 * filtre, clause inconnue = erreur). Il reproduit `pg_advisory_xact_lock` par
 * un verrou par clé, levé à la fin de la transaction, et défait les écritures
 * d'une transaction qui lève.
 *
 * Une lecture prend l'état au début de la requête, et sa réponse arrive après
 * la latence (`fenetreDeCourse`) : pendant ce temps, une autre transaction
 * écrit. Lue après la latence, la dernière lecture avant l'écriture ne laissait
 * aucune fenêtre, et retirer le verrou de la facture passait inaperçu.
 */

type Row = Record<string, any>;

function correspond(
  row: Row,
  where: Row,
  champs: readonly string[],
  relations: Record<string, (row: Row, clause: Row) => boolean> = {},
): boolean {
  return Object.entries(where).every(([cle, clause]) => {
    if (clause === undefined) return true;
    if (cle === 'OR') {
      return (clause as Row[]).some((c) => correspond(row, c, champs, relations));
    }
    if (cle in relations) return relations[cle](row, clause);
    if (!champs.includes(cle)) throw new Error(`Clause non simulée : ${cle}`);
    if (clause !== null && typeof clause === 'object' && !(clause instanceof Date)) {
      return Object.entries(clause as Row).every(([op, valeur]) => {
        if (op === 'in') return (valeur as unknown[]).includes(row[cle]);
        if (op === 'not') return row[cle] !== valeur;
        throw new Error(`Opérateur non simulé : ${cle}.${op}`);
      });
    }
    return row[cle] === clause;
  });
}

const CLUB = 'club-1';
const INVOICE = [
  'id', 'clubId', 'familyId', 'householdGroupId', 'shopOrderId', 'shopAdjustmentId', 'purpose',
  'isCreditNote', 'parentInvoiceId', 'status', 'amountCents', 'payerCreditMemberId', 'payerCreditContactId',
] as const;
const PAYMENT = [
  'id', 'clubId', 'invoiceId', 'amountCents', 'method', 'paidByMemberId', 'paidByContactId', 'refundedPaymentId',
] as const;

function monde() {
  let seq = 0;
  const nouvelId = (prefixe: string) => `${prefixe}-${++seq}`;
  let horloge = 0;
  const maintenant = () => new Date(Date.UTC(2026, 8, 1, 10, 0, ++horloge));

  const members: Row[] = [
    { id: 'm-camille', clubId: CLUB, userId: 'u-camille', firstName: 'Camille', lastName: 'Titulaire', status: 'ACTIVE' },
    { id: 'm-jo', clubId: CLUB, userId: 'u-jo', firstName: 'Jo', lastName: 'Horsfoyer', status: 'ACTIVE' },
    { id: 'm-lea', clubId: CLUB, userId: null, firstName: 'Léa', lastName: 'Ailleurs', status: 'ACTIVE' },
    { id: 'm-zoe', clubId: CLUB, userId: null, firstName: 'Zoé', lastName: 'Sanscrédit', status: 'ACTIVE' },
  ];
  const contacts: Row[] = [
    { id: 'c-camille', clubId: CLUB, userId: 'u-camille', firstName: 'Camille', lastName: 'Titulaire' },
    { id: 'c-paul', clubId: CLUB, userId: 'u-paul', firstName: 'Paul', lastName: 'Payeur' },
    { id: 'c-jo', clubId: CLUB, userId: 'u-jo', firstName: 'Jo', lastName: 'Horsfoyer' },
    { id: 'c-sam', clubId: CLUB, userId: 'u-sam', firstName: 'Sam', lastName: 'Acheteur' },
  ];
  const families: Row[] = [{ id: 'fam-1', clubId: CLUB, householdGroupId: null }];
  const links: Row[] = [
    { id: 'l-1', familyId: 'fam-1', memberId: 'm-camille', contactId: null, linkRole: FamilyMemberLinkRole.MEMBER },
    { id: 'l-2', familyId: 'fam-1', memberId: null, contactId: 'c-paul', linkRole: FamilyMemberLinkRole.PAYER },
    { id: 'l-3', familyId: 'fam-1', memberId: 'm-zoe', contactId: null, linkRole: FamilyMemberLinkRole.MEMBER },
    { id: 'l-4', familyId: 'fam-1', memberId: null, contactId: 'c-jo', linkRole: FamilyMemberLinkRole.PAYER },
  ];
  const shopOrders: Row[] = [{ id: 'so-1', clubId: CLUB, memberId: null, contactId: 'c-sam' }];
  const invoiceLines: Row[] = [];
  const invoices: Row[] = [];
  const payments: Row[] = [];
  const events: string[] = [];

  let delaiLectureMs = 0;
  // Latence d'une lecture : à attendre APRÈS avoir pris l'état lu.
  const pause = () =>
    delaiLectureMs ? new Promise<void>((r) => setTimeout(r, delaiLectureMs)) : Promise.resolve();

  const verrous = new Map<string, Promise<void>>();
  async function acquerir(cle: string): Promise<() => void> {
    const precedent = verrous.get(cle) ?? Promise.resolve();
    let liberer!: () => void;
    const attente = new Promise<void>((r) => {
      liberer = r;
    });
    verrous.set(cle, precedent.then(() => attente));
    await precedent;
    return liberer;
  }

  const familleDuLien = (lien: Row, clause: Row) =>
    correspond(families.find((f) => f.id === lien.familyId)!, clause, ['householdGroupId', 'clubId']);

  type Ctx = { liberer: Array<() => void>; defaire: Array<() => void> } | null;

  function client(ctx: Ctx) {
    return {
      $executeRaw: async (strings: TemplateStringsArray, ...values: unknown[]) => {
        const sql = strings.join('?');
        if (!ctx) throw new Error('Verrou pris hors transaction');
        const cle = sql.includes("'clubflow:invoice'")
          ? `facture ${String(values[0])}`
          : sql.includes("'clubflow:payer-credit'")
            ? `personne ${String(values[0])}`
            : null;
        if (!cle) throw new Error(`SQL brut non modélisé : ${sql}`);
        ctx.liberer.push(await acquerir(cle));
        return 0;
      },
      member: {
        findFirst: async ({ where }: any) =>
          members.find((m) => correspond(m, where, ['id', 'clubId', 'userId', 'status'])) ?? null,
      },
      contact: {
        findFirst: async ({ where }: any) =>
          contacts.find((c) => correspond(c, where, ['id', 'clubId', 'userId'])) ?? null,
        findMany: async ({ where }: any) =>
          contacts.filter((c) => correspond(c, where, ['clubId', 'userId'])),
      },
      family: {
        findFirst: async ({ where }: any) =>
          families.find((f) => correspond(f, where, ['id', 'clubId'])) ?? null,
      },
      familyMember: {
        findFirst: async ({ where }: any) =>
          links.find((l) =>
            correspond(l, where, ['memberId', 'contactId', 'familyId', 'linkRole'], { family: familleDuLien }),
          ) ?? null,
        findMany: async ({ where }: any) =>
          links.filter((l) =>
            correspond(l, where, ['memberId', 'contactId', 'familyId', 'linkRole'], { family: familleDuLien }),
          ),
      },
      clubModule: { findUnique: async () => ({ enabled: false }) },
      shopOrder: {
        findFirst: async ({ where }: any) =>
          shopOrders.find((o) => correspond(o, where, ['id', 'clubId'])) ?? null,
      },
      shopOrderAdjustment: {
        findFirst: async ({ where }: any) => {
          correspond({}, {}, []);
          if (!where.id) throw new Error('Ajustement sans identifiant');
          return null;
        },
      },
      invoiceLine: {
        findFirst: async ({ where }: any) =>
          invoiceLines.find((l) => correspond(l, where, ['invoiceId', 'memberId'])) ?? null,
        findMany: async ({ where }: any) =>
          invoiceLines.filter((l) => correspond(l, where, ['invoiceId', 'memberId'])),
      },
      invoice: {
        findFirst: async ({ where, select }: any) => {
          const inv = invoices.find((i) => correspond(i, where, INVOICE));
          const lu = !inv
            ? null
            : select?.payments
              ? { ...inv, payments: payments.filter((p) => p.invoiceId === inv.id).map((p) => ({ ...p })) }
              : { ...inv };
          await pause();
          return lu;
        },
        findMany: async ({ where }: any) =>
          invoices
            .filter((i) => correspond(i, where, INVOICE))
            .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
            .map((i) => ({
              id: i.id,
              label: i.label,
              createdAt: i.createdAt,
              payments: payments.filter((p) => p.invoiceId === i.id).map((p) => ({ ...p })),
            })),
        aggregate: async ({ where }: any) => {
          const lignes = invoices.filter((i) => correspond(i, where, INVOICE));
          return { _sum: { amountCents: lignes.length ? lignes.reduce((s, i) => s + i.amountCents, 0) : null } };
        },
        create: async ({ data }: any) => {
          const row: Row = {
            shopOrderId: null,
            shopAdjustmentId: null,
            purpose: InvoicePurpose.CHARGE,
            payerCreditMemberId: null,
            payerCreditContactId: null,
            isCreditNote: false,
            parentInvoiceId: null,
            ...data,
            id: nouvelId(data.isCreditNote ? 'avoir' : 'facture'),
            createdAt: maintenant(),
          };
          invoices.push(row);
          ctx?.defaire.push(() => invoices.splice(invoices.indexOf(row), 1));
          return { ...row };
        },
        update: async ({ where, data }: any) => {
          const inv = invoices.find((i) => i.id === where.id)!;
          const avant = { ...inv };
          Object.assign(inv, data);
          ctx?.defaire.push(() => Object.assign(inv, avant));
          return { ...inv };
        },
      },
      payment: {
        aggregate: async ({ where }: any) => {
          const lignes = payments.filter((p) => correspond(p, where, PAYMENT));
          const somme = lignes.length ? lignes.reduce((s, p) => s + p.amountCents, 0) : null;
          await pause();
          return { _sum: { amountCents: somme } };
        },
        findMany: async ({ where }: any) => {
          const lus = payments
            .filter((p) => correspond(p, where, PAYMENT))
            .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
            .map((p) => ({
              id: p.id,
              amountCents: p.amountCents,
              createdAt: p.createdAt,
              invoice: { id: p.invoiceId, label: invoices.find((i) => i.id === p.invoiceId)!.label },
            }));
          await pause();
          return lus;
        },
        create: async ({ data }: any) => {
          const row: Row = {
            externalRef: null,
            refundedPaymentId: null,
            paidByMemberId: null,
            paidByContactId: null,
            ...data,
            id: nouvelId('paiement'),
            createdAt: maintenant(),
          };
          payments.push(row);
          ctx?.defaire.push(() => payments.splice(payments.indexOf(row), 1));
          return { ...row };
        },
      },
      paymentScheduleInstallment: {
        aggregate: async () => ({ _sum: { amountCents: null } }),
      },
      cheque: { create: async () => ({}) },
    };
  }

  const prisma = {
    ...client(null),
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) => {
      const ctx = { liberer: [] as Array<() => void>, defaire: [] as Array<() => void> };
      try {
        const out = await fn(client(ctx));
        events.push('commit');
        return out;
      } catch (err) {
        for (const annuler of ctx.defaire.reverse()) annuler();
        events.push('rollback');
        throw err;
      } finally {
        for (const r of ctx.liberer) r();
      }
    },
  };

  const shop = {
    fulfillPaidShopOrderInTx: jest.fn(async (_tx: unknown, _clubId: string, orderId: string) => {
      events.push(`commande servie ${orderId}`);
    }),
  };
  const scheduleEngine = {
    sumInFlightForInvoice: jest.fn(async () => 0),
    closeScheduleForInvoice: jest.fn(async (invoiceId: string) => {
      events.push(`échéancier clos ${invoiceId}`);
    }),
  };
  const accounting = {
    recordIncomeFromPayment: jest.fn(
      async (_clubId: string, _paymentId: string, label: string, _amount: number, account: string | null) => {
        events.push(`écriture « ${label} » compte ${account}`);
      },
    ),
    createContraEntryForCreditNote: jest.fn(async () => undefined),
  };
  const creditNotes = new CreditNotesService(prisma as never, accounting as never);
  const svc = new PaymentsService(
    prisma as never,
    accounting as never,
    { getById: jest.fn() } as never,
    {} as never,
    {} as never,
    {} as never,
    scheduleEngine as never,
    {} as never,
    {} as never,
    creditNotes,
    shop as never,
  );

  function facture(over: Row): string {
    const row: Row = {
      id: nouvelId('facture'),
      clubId: CLUB,
      familyId: 'fam-1',
      householdGroupId: null,
      shopOrderId: null,
      shopAdjustmentId: null,
      purpose: InvoicePurpose.CHARGE,
      isCreditNote: false,
      parentInvoiceId: null,
      status: InvoiceStatus.OPEN,
      amountCents: 5000,
      baseAmountCents: 5000,
      label: 'Cotisation 2026',
      clubSeasonId: null,
      payerCreditMemberId: null,
      payerCreditContactId: null,
      createdAt: maintenant(),
      ...over,
    };
    invoices.push(row);
    return row.id;
  }

  /** Une avance versée : un reçu payé et son encaissement (lot 1). */
  function avance(ref: PayerCreditHolderRef, amountCents: number): void {
    const recu = facture({
      familyId: null,
      purpose: InvoicePurpose.PAYER_CREDIT_DEPOSIT,
      status: InvoiceStatus.PAID,
      amountCents,
      baseAmountCents: amountCents,
      label: 'Avance',
      payerCreditMemberId: ref.memberId ?? null,
      payerCreditContactId: ref.contactId ?? null,
    });
    payments.push({
      id: nouvelId('versement'),
      clubId: CLUB,
      invoiceId: recu,
      amountCents,
      method: ClubPaymentMethod.MANUAL_CASH,
      externalRef: null,
      paidByMemberId: ref.memberId ?? null,
      paidByContactId: ref.contactId ?? null,
      refundedPaymentId: null,
      createdAt: maintenant(),
    });
  }

  async function credit(ref: PayerCreditHolderRef): Promise<number> {
    const holder = await resolvePayerCreditHolder(prisma as never, CLUB, ref);
    return (await readPayerCredit(prisma as never, CLUB, holder)).balanceCents;
  }

  return {
    svc,
    invoices,
    payments,
    events,
    shop,
    scheduleEngine,
    accounting,
    facture,
    avance,
    credit,
    invoiceLines,
    links,
    fenetreDeCourse(ms: number) {
      delaiLectureMs = ms;
    },
    statut: (id: string) => invoices.find((i) => i.id === id)!.status,
    imputations: (invoiceId?: string) =>
      payments.filter(
        (p) => p.method === ClubPaymentMethod.PAYER_CREDIT && (invoiceId === undefined || p.invoiceId === invoiceId),
      ),
  };
}

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
