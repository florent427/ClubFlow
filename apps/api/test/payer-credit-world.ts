/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  ClubPaymentMethod,
  FamilyMemberLinkRole,
  InvoicePurpose,
  InvoiceStatus,
  Prisma,
} from '@prisma/client';
import Stripe from 'stripe';
import { CreditNotesService } from '../src/payments/credit-notes.service';
import { readPayerCredit } from '../src/payments/payer-credit-balance';
import { resolvePayerCreditHolder, type PayerCreditHolderRef } from '../src/payments/payer-credit-holder';
import { payerCreditTopUpMetadata } from '../src/payments/payer-credit-top-up';
import type { RequestUser } from '../src/common/types/request-user';
import { InvoicePayerScopeService } from '../src/payments/invoice-payer-scope.service';
import { PayerCreditService } from '../src/payments/payer-credit.service';
import { PaymentsService } from '../src/payments/payments.service';
import { StripeCheckoutService } from '../src/payments/stripe-checkout.service';
import { StripeRefundsService } from '../src/payments/stripe-refunds.service';
import { ViewerPayerCreditResolver } from '../src/payments/viewer-payer-credit.resolver';

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
        if (op === 'gt') return row[cle] > (valeur as number);
        throw new Error(`Opérateur non simulé : ${cle}.${op}`);
      });
    }
    return row[cle] === clause;
  });
}

export const CLUB = 'club-1';
/** Compte connecté du club : les événements Stripe du club en viennent. */
export const COMPTE_CLUB = 'acct_club';
const SECRET_WEBHOOK = 'whsec_monde_credit';
const INVOICE = [
  'id', 'clubId', 'familyId', 'householdGroupId', 'shopOrderId', 'shopAdjustmentId', 'purpose',
  'isCreditNote', 'parentInvoiceId', 'status', 'amountCents', 'payerCreditMemberId', 'payerCreditContactId',
  'stripePaymentIntentId',
] as const;
const PAYMENT = [
  'id', 'clubId', 'invoiceId', 'amountCents', 'method', 'paidByMemberId', 'paidByContactId', 'refundedPaymentId',
  'externalRef', 'stripeRefundId',
] as const;

/** La violation d'unicité que lève PostgreSQL, telle que Prisma la rend. */
const doublon = (champs: string) =>
  new Prisma.PrismaClientKnownRequestError(`Unique constraint failed on the fields: (${champs})`, {
    code: 'P2002',
    clientVersion: 'monde',
  });

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
  const clubs: Row[] = [
    { id: CLUB, slug: 'club-demo', name: 'Club Démo', stripeAccountId: COMPTE_CLUB, stripeChargesEnabled: true },
  ];
  const webhookEvents = new Set<string>();
  const invoiceLines: Row[] = [];
  const invoices: Row[] = [];
  const payments: Row[] = [];
  // Fiches chèque : `depositFinancialAccountId` est le compte bancaire de leur remise.
  const cheques: Row[] = [];
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
      club: {
        findUnique: async ({ where }: any) => clubs.find((c) => correspond(c, where, ['id'])) ?? null,
        findFirst: async ({ where }: any) =>
          clubs.find((c) => correspond(c, where, ['id', 'stripeAccountId'])) ?? null,
      },
      // Réservation d'un événement Stripe : la clé primaire arbitre les livraisons.
      stripeWebhookEvent: {
        create: async ({ data }: any) => {
          if (webhookEvents.has(data.id)) throw doublon('id');
          webhookEvents.add(data.id);
          return { id: data.id };
        },
        delete: async ({ where }: any) => {
          webhookEvents.delete(where.id);
          return { id: where.id };
        },
      },
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
          // `stripePaymentIntentId @unique` : une seconde facture du même
          // paymentIntent est refusée, même avant le commit de la première.
          if (
            data.stripePaymentIntentId &&
            invoices.some((i) => i.stripePaymentIntentId === data.stripePaymentIntentId)
          ) {
            throw doublon('stripePaymentIntentId');
          }
          const row: Row = {
            shopOrderId: null,
            shopAdjustmentId: null,
            purpose: InvoicePurpose.CHARGE,
            payerCreditMemberId: null,
            payerCreditContactId: null,
            isCreditNote: false,
            parentInvoiceId: null,
            stripePaymentIntentId: null,
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
        findFirst: async ({ where, include }: any) => {
          const p = payments.find((x) => correspond(x, where, PAYMENT));
          if (!p) return null;
          const lu: Row = include?.invoice ? { ...p, invoice: { ...invoices.find((i) => i.id === p.invoiceId)! } } : { ...p };
          if (include?.cheque) {
            const c = cheques.find((x) => x.paymentId === p.id);
            lu.cheque = c
              ? {
                  id: c.id,
                  number: c.number,
                  status: c.status,
                  depositId: c.depositId,
                  deposit: c.depositId ? { financialAccountId: c.depositFinancialAccountId } : null,
                }
              : null;
          }
          await pause();
          return lu;
        },
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
          // `@@unique([clubId, stripeRefundId])` : un remboursement ne s'écrit qu'une fois.
          if (
            data.stripeRefundId &&
            payments.some((p) => p.clubId === data.clubId && p.stripeRefundId === data.stripeRefundId)
          ) {
            throw doublon('clubId, stripeRefundId');
          }
          const row: Row = {
            externalRef: null,
            refundedPaymentId: null,
            paidByMemberId: null,
            paidByContactId: null,
            stripeRefundId: null,
            stripeAccountId: null,
            financialAccountId: null,
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
      cheque: {
        create: async () => ({}),
        // Écriture conditionnelle du chèque rendu : seul un chèque encore en portefeuille change.
        updateMany: async ({ where, data }: any) => {
          const lignes = cheques.filter((c) => correspond(c, where, ['id', 'clubId', 'status', 'depositId']));
          for (const c of lignes) {
            const avant = { ...c };
            Object.assign(c, data);
            ctx?.defaire.push(() => Object.assign(c, avant));
          }
          return { count: lignes.length };
        },
      },
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
  // Les frais d'un encaissement carte, lus chez Stripe après le commit.
  const stripeFees = {
    syncFeesForPayment: jest.fn(async (paymentId: string) => {
      events.push(`frais ${paymentId}`);
      return false;
    }),
  };
  // Le vrai service : son appel sortant passe par le client Stripe que le
  // test simule (`jest.mock('stripe')`), et le webhook l'utilise.
  const remboursements = new StripeRefundsService(prisma as never, creditNotes, {} as never);
  const svc = new PaymentsService(
    prisma as never,
    accounting as never,
    { getById: jest.fn() } as never,
    {} as never,
    {} as never,
    {} as never,
    scheduleEngine as never,
    stripeFees as never,
    remboursements,
    creditNotes,
    shop as never,
  );

  /**
   * Une livraison signée du webhook Stripe : signature, réservation de
   * l'événement, puis son traitement. La promesse rend ce que Stripe recevrait :
   * un rejet lui ferait rejouer la livraison.
   */
  const livrer = (event: Row) => {
    const payload = JSON.stringify(event);
    process.env.STRIPE_WEBHOOK_SECRET = SECRET_WEBHOOK;
    const signature = Stripe.webhooks.generateTestHeaderString({ payload, secret: SECRET_WEBHOOK });
    return svc.handleStripeWebhook(Buffer.from(payload), signature);
  };

  /**
   * Stripe annonce une avance par carte (« Créditer mon compte ») : le
   * paymentIntent porte les metadata que la session a posées.
   */
  const avanceCarte = (args: {
    ref: PayerCreditHolderRef;
    amountCents: number;
    paymentIntentId?: string;
    eventId?: string;
    /** Compte émetteur ; `null` = compte plateforme. Défaut : celui du club. */
    compte?: string | null;
    metadata?: Record<string, string>;
  }) => {
    const paymentIntentId = args.paymentIntentId ?? 'pi_avance';
    return livrer({
      id: args.eventId ?? `evt_${paymentIntentId}`,
      object: 'event',
      type: 'payment_intent.succeeded',
      account: args.compte === undefined ? COMPTE_CLUB : args.compte,
      data: {
        object: {
          id: paymentIntentId,
          object: 'payment_intent',
          metadata:
            args.metadata ??
            payerCreditTopUpMetadata({ clubId: CLUB, ref: args.ref, stripeAccountId: COMPTE_CLUB }),
          amount_received: args.amountCents,
          amount: args.amountCents,
        },
      },
    });
  };

  /**
   * Stripe confirme les remboursements d'une charge (`charge.refunded`). Un
   * remboursement lancé depuis ClubFlow désigne son encaissement en metadata.
   */
  const chargeRemboursee = (args: {
    eventId: string;
    paymentIntentId?: string;
    capturedCents: number;
    refunds: Array<{ id: string; amountCents: number; paymentId?: string; status?: string }>;
  }) =>
    livrer({
      id: args.eventId,
      object: 'event',
      type: 'charge.refunded',
      account: COMPTE_CLUB,
      data: {
        object: {
          id: 'ch_avance',
          object: 'charge',
          payment_intent: args.paymentIntentId ?? 'pi_avance',
          amount_captured: args.capturedCents,
          metadata: { clubId: CLUB },
          refunds: {
            object: 'list',
            data: args.refunds.map((r) => ({
              id: r.id,
              object: 'refund',
              amount: r.amountCents,
              status: r.status ?? 'succeeded',
              metadata: r.paymentId ? { paymentId: r.paymentId } : {},
            })),
          },
        },
      },
    });

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
  function avance(
    ref: PayerCreditHolderRef,
    amountCents: number,
    options: {
      method?: ClubPaymentMethod;
      financialAccountId?: string | null;
      cheque?: {
        number: string;
        status: string;
        depositId?: string | null;
        depositFinancialAccountId?: string | null;
      };
    } = {},
  ): { recu: string; versement: string } {
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
    const versement = nouvelId('versement');
    payments.push({
      id: versement,
      clubId: CLUB,
      invoiceId: recu,
      amountCents,
      method: options.method ?? ClubPaymentMethod.MANUAL_CASH,
      externalRef: null,
      financialAccountId: options.financialAccountId ?? null,
      paidByMemberId: ref.memberId ?? null,
      paidByContactId: ref.contactId ?? null,
      refundedPaymentId: null,
      createdAt: maintenant(),
    });
    if (options.cheque) {
      cheques.push({
        id: nouvelId('cheque'),
        clubId: CLUB,
        paymentId: versement,
        depositId: null,
        depositFinancialAccountId: null,
        notes: null,
        ...options.cheque,
      });
    }
    return { recu, versement };
  }

  async function credit(ref: PayerCreditHolderRef): Promise<number> {
    const holder = await resolvePayerCreditHolder(prisma as never, CLUB, ref);
    return (await readPayerCredit(prisma as never, CLUB, holder)).balanceCents;
  }

  return {
    prisma,
    svc,
    remboursements,
    creditNotes,
    stripeFees,
    livrer,
    avanceCarte,
    chargeRemboursee,
    clubs,
    webhookEvents,
    members,
    contacts,
    invoices,
    payments,
    cheques,
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

export function compte(
  userId: string,
  profil: { memberId?: string; contactId?: string },
): RequestUser {
  return {
    userId,
    email: `${userId}@exemple.test`,
    activeProfileMemberId: profil.memberId ?? null,
    activeProfileContactId: profil.contactId ?? null,
  };
}

export function portail(w: Monde, checkout?: StripeCheckoutService): ViewerPayerCreditResolver {
  // Les foyers du monde n'ont pas de groupe étendu : le périmètre ne doit pas
  // les chercher.
  const families = {
    viewerPayerFamilyIdsInHouseholdGroup: async () => {
      throw new Error('Groupe foyer non simulé');
    },
    viewerInvitedFamilyIdsInHouseholdGroup: async () => {
      throw new Error('Groupe foyer non simulé');
    },
  };
  return new ViewerPayerCreditResolver(
    w.prisma as never,
    new PayerCreditService(w.prisma as never),
    w.svc,
    new InvoicePayerScopeService(w.prisma as never, families as never),
    checkout ?? ({} as StripeCheckoutService),
  );
}

/** Camille devient payeuse du foyer : son profil s'ouvre alors à Paul, l'autre payeur. */
export function camillePayeuse(w: Monde): void {
  const lien = w.links.find((l) => l.memberId === 'm-camille')!;
  lien.linkRole = FamilyMemberLinkRole.PAYER;
}
