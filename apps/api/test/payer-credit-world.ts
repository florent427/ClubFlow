/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  ClubPaymentMethod,
  FamilyMemberLinkRole,
  InvoicePurpose,
  InvoiceStatus,
} from '@prisma/client';
import { CreditNotesService } from '../src/payments/credit-notes.service';
import { readPayerCredit } from '../src/payments/payer-credit-balance';
import { resolvePayerCreditHolder, type PayerCreditHolderRef } from '../src/payments/payer-credit-holder';
import { PaymentsService } from '../src/payments/payments.service';

/**
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

export type Row = Record<string, any>;

export function correspond(
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

export const CLUB = 'club-1';
const INVOICE = [
  'id', 'clubId', 'familyId', 'householdGroupId', 'shopOrderId', 'shopAdjustmentId', 'purpose',
  'isCreditNote', 'parentInvoiceId', 'status', 'amountCents', 'payerCreditMemberId', 'payerCreditContactId',
] as const;
const PAYMENT = [
  'id', 'clubId', 'invoiceId', 'amountCents', 'method', 'paidByMemberId', 'paidByContactId', 'refundedPaymentId',
] as const;

export function monde() {
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
  // Relation `contact` d'un lien : un lien sans contact ne correspond à aucun filtre.
  const contactDuLien = (lien: Row, clause: Row) => {
    const contact = contacts.find((c) => c.id === lien.contactId);
    return !!contact && correspond(contact, clause, ['userId']);
  };
  const relationsDuLien = { family: familleDuLien, contact: contactDuLien };
  // `include: { family: { include: { householdGroup: true } } }` du périmètre payeur.
  const avecFamille = (lien: Row, include: any): Row => {
    if (!include) return lien;
    if (!include.family) throw new Error(`Inclusion non simulée : ${Object.keys(include).join(', ')}`);
    const famille = families.find((f) => f.id === lien.familyId)!;
    if (famille.householdGroupId) throw new Error('Groupe foyer non simulé');
    return { ...lien, family: { ...famille, householdGroup: null } };
  };

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
        findFirst: async ({ where, include }: any) => {
          const lien = links.find((l) =>
            correspond(l, where, ['memberId', 'contactId', 'familyId', 'linkRole'], relationsDuLien),
          );
          return lien ? avecFamille(lien, include) : null;
        },
        findMany: async ({ where, include }: any) =>
          links
            .filter((l) =>
              correspond(l, where, ['memberId', 'contactId', 'familyId', 'linkRole'], relationsDuLien),
            )
            .map((l) => avecFamille(l, include)),
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
    prisma,
    svc,
    members,
    contacts,
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

export type Monde = ReturnType<typeof monde>;
