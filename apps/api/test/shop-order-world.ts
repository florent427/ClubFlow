import { AsyncLocalStorage } from 'node:async_hooks';
import {
  ChequeStatus,
  ClubPaymentMethod,
  InvoiceStatus,
  MembershipCartStatus,
  ShopOrderAdjustmentKind,
  ShopOrderStatus,
} from '@prisma/client';
import { MembershipCartService } from '../src/membership/membership-cart.service';
import { CreditNotesService } from '../src/payments/credit-notes.service';
import { PaymentsService } from '../src/payments/payments.service';
import { ShopOrderAdjustmentsService } from '../src/payments/shop-order-adjustments.service';
import { ShopOrderMoneyService } from '../src/payments/shop-order-money.service';
import { ShopOrderRefundsService } from '../src/payments/shop-order-refunds.service';
import { ShopStockService } from '../src/shop/shop-stock.service';
import { ShopService } from '../src/shop/shop.service';

/**
 * Un monde de commandes boutique pour tester ce qui déplace l'argent et la
 * marchandise d'une commande — l'annulation remboursée (ADR-0019), l'échange
 * et l'annulation d'articles (ADR-0020) — de bout en bout : les vrais
 * `ShopService`, moteur de stock, service d'avoirs et `ShopOrderMoneyService`,
 * sur un double de PostgreSQL. S'y ajoutent l'encaissement manuel et
 * l'annulation d'une facture (`PaymentsService`), et la réouverture d'un panier
 * d'adhésion (`MembershipCartService`) : les courses entre un règlement et une
 * annulation (ADR-0022, §3).
 *
 * Le double APPLIQUE chaque clause des `where` et lève sur toute clause qu'il
 * ne sait pas simuler : un prédicat oublié par le code change le résultat au
 * lieu de passer inaperçu (cf. pitfalls/double-ignore-une-clause-du-where.md).
 * Seuls les effets distants sont simulés : Stripe, l'échéancier, la
 * comptabilité, l'attribution des précommandes.
 *
 * Les transactions se comportent comme sous PostgreSQL :
 * - `$transaction` passe son propre client. Ce qu'il écrit est défait si la
 *   transaction lève ; ce que `prisma` écrit pendant ce temps ne l'est pas
 *   (cf. pitfalls/double-transaction-rollback-trop-genereux.md) ;
 * - `pg_advisory_xact_lock`, par `$executeRaw` et dans une transaction
 *   seulement, est un verrou exclusif par clé, ré-entrant, levé à la fin de la
 *   transaction qui le tient ;
 * - une lecture prend l'état au début de la requête, et sa réponse arrive après
 *   la latence (`raceWindow`) : une autre transaction écrit pendant ce temps.
 *
 * Une différence à connaître : ce qu'une transaction en cours a écrit est
 * visible des autres, là où PostgreSQL le masque. Une course se place donc
 * juste AVANT l'écriture de la première opération, avec `atMoment`.
 *
 * Hors de `src/` : ce n'est pas une suite de tests, et ce n'est pas du code
 * livré (`tsconfig.build.json` exclut `test/`).
 */

export type WorldLine = {
  id: string;
  orderId: string;
  productId: string;
  variantId: string | null;
  quantity: number;
  unitPriceCents: number;
  label: string;
  awaitingStockQty: number;
  cancelledQty: number;
  createdAt: Date;
};

export type WorldOrder = {
  id: string;
  clubId: string;
  memberId: string | null;
  contactId: string | null;
  status: ShopOrderStatus;
  totalCents: number;
  note: string | null;
  createdAt: Date;
  updatedAt: Date;
  paidAt: Date | null;
  cancelledAt: Date | null;
  cancelReason: string | null;
  cancelledByUserId: string | null;
  termsAssetId: string | null;
  termsAcceptedAt: Date | null;
  fulfilledAt: Date | null;
  deliveredAt: Date | null;
  deliveredByUserId: string | null;
  deliverySignerName: string | null;
  deliverySignaturePng: string | null;
  deliveredLines: unknown;
  lines: WorldLine[];
};

export type WorldProduct = {
  id: string;
  name: string;
  priceCents: number;
  active: boolean;
  preorderEnabled: boolean;
};

export type WorldVariant = {
  id: string;
  clubId: string;
  productId: string;
  label: string | null;
  priceCents: number | null;
  active: boolean;
  trackStock: boolean;
  onHand: number;
  available: number;
  lowStockAlertedAt: Date | null;
  updatedAt: Date;
};

export type WorldInvoice = Record<string, any> & {
  id: string;
  clubId: string;
  shopOrderId: string | null;
  shopAdjustmentId: string | null;
  status: InvoiceStatus;
  amountCents: number;
  isCreditNote: boolean;
  parentInvoiceId: string | null;
  createdAt: Date;
};

export type WorldPayment = Record<string, any> & {
  id: string;
  clubId: string;
  invoiceId: string;
  amountCents: number;
  createdAt: Date;
};

export type WorldCheque = {
  id: string;
  clubId: string;
  paymentId: string;
  number: string | null;
  status: ChequeStatus;
  depositId: string | null;
  notes: string | null;
};

export type WorldAdjustment = Record<string, any> & {
  id: string;
  clubId: string;
  orderId: string;
  kind: ShopOrderAdjustmentKind;
  createdAt: Date;
  signedAt: Date | null;
};

/** Un panier d'adhésion : seulement ce que sa réouverture lit et écrit. */
export type WorldCart = {
  id: string;
  clubId: string;
  status: MembershipCartStatus;
  validatedAt: Date | null;
  invoiceId: string | null;
};

/**
 * L'instant où une course se place (ADR-0022, §3) : juste avant qu'un
 * encaissement s'écrive, ou qu'une facture passe VOID.
 */
export type Moment = 'payment' | 'void';

export const T0 = new Date('2026-09-01T10:00:00Z');
export const T1 = new Date('2026-09-05T10:00:00Z');

/**
 * En-tête PNG valide : la signature n'est pas décodée à l'échange, seulement
 * vérifiée comme étant bien un PNG.
 */
export const PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAMAASsJTYQAAAAASUVORK5CYII=';

export const LINE = (over: Partial<WorldLine> = {}): WorldLine => ({
  id: 'line-1',
  orderId: 'order-1',
  productId: 'p-1',
  variantId: 'v-1',
  quantity: 2,
  unitPriceCents: 2000,
  label: 'T-shirt — L',
  awaitingStockQty: 0,
  cancelledQty: 0,
  createdAt: T0,
  ...over,
});

/** Payée : les deux t-shirts ont quitté le placard. */
export const ORDER = (over: Partial<WorldOrder> = {}): WorldOrder => ({
  id: 'order-1',
  clubId: 'club-1',
  memberId: 'm-1',
  contactId: null,
  status: ShopOrderStatus.PAID,
  totalCents: 4000,
  note: null,
  createdAt: T0,
  updatedAt: T0,
  paidAt: T0,
  cancelledAt: null,
  cancelReason: null,
  cancelledByUserId: null,
  termsAssetId: null,
  termsAcceptedAt: null,
  fulfilledAt: T0,
  deliveredAt: null,
  deliveredByUserId: null,
  deliverySignerName: null,
  deliverySignaturePng: null,
  deliveredLines: null,
  lines: [LINE()],
  ...over,
});

/** En attente : les deux t-shirts sont réservés, toujours au placard. */
export const PENDING = (over: Partial<WorldOrder> = {}): WorldOrder =>
  ORDER({ status: ShopOrderStatus.PENDING, paidAt: null, fulfilledAt: null, ...over });

export const PRODUCT = (over: Partial<WorldProduct> = {}): WorldProduct => ({
  id: 'p-1',
  name: 'T-shirt',
  priceCents: 2000,
  active: true,
  preorderEnabled: false,
  ...over,
});

export const VARIANT = (over: Partial<WorldVariant> = {}): WorldVariant => ({
  id: 'v-1',
  clubId: 'club-1',
  productId: 'p-1',
  label: 'L',
  priceCents: null,
  active: true,
  trackStock: true,
  onHand: 3,
  available: 3,
  lowStockAlertedAt: null,
  updatedAt: T0,
  ...over,
});

export const INVOICE = (over: Partial<WorldInvoice> = {}): WorldInvoice => ({
  id: 'inv-1',
  clubId: 'club-1',
  shopOrderId: 'order-1',
  shopAdjustmentId: null,
  status: InvoiceStatus.PAID,
  amountCents: 4000,
  label: 'Boutique — commande',
  familyId: 'fam-1',
  householdGroupId: null,
  clubSeasonId: null,
  isCreditNote: false,
  parentInvoiceId: null,
  creditNoteReason: null,
  voidReason: null,
  createdAt: T0,
  ...over,
});

/** La facture du reste à payer de l'échange `adj-1`, pas encore réglée. */
export const SUPPLEMENT = (over: Partial<WorldInvoice> = {}): WorldInvoice =>
  INVOICE({
    id: 'inv-sup',
    shopOrderId: null,
    shopAdjustmentId: 'adj-1',
    status: InvoiceStatus.OPEN,
    amountCents: 1500,
    label: 'Échange boutique — reste à payer — Camille MARTIN',
    createdAt: T1,
    ...over,
  });

export const PAYMENT = (over: Partial<WorldPayment> = {}): WorldPayment => ({
  id: 'pay-1',
  clubId: 'club-1',
  invoiceId: 'inv-1',
  amountCents: 4000,
  method: ClubPaymentMethod.MANUAL_CASH,
  externalRef: null,
  refundedPaymentId: null,
  financialAccountId: 'fa-caisse',
  paidByMemberId: 'm-1',
  paidByContactId: null,
  createdAt: T0,
  ...over,
});

export const CHEQUE = (over: Partial<WorldCheque> = {}): WorldCheque => ({
  id: 'chq-1',
  clubId: 'club-1',
  paymentId: 'pay-1',
  number: '0012',
  status: ChequeStatus.PENDING,
  depositId: null,
  notes: null,
  ...over,
});

/** Un premier échange : un t-shirt L à 20 € contre un kimono à 35 €. */
export const ADJUSTMENT = (over: Partial<WorldAdjustment> = {}): WorldAdjustment => ({
  id: 'adj-1',
  clubId: 'club-1',
  orderId: 'order-1',
  kind: ShopOrderAdjustmentKind.EXCHANGE,
  reason: 'Taille trop petite',
  userId: 'u-admin',
  returnedLineId: 'line-1',
  returnedQty: 1,
  returnedLabel: 'T-shirt — L',
  returnedUnitPriceCents: 2000,
  goodsLost: false,
  newLineId: 'line-2',
  newQty: 1,
  newLabel: 'Kimono — 140',
  newUnitPriceCents: 3500,
  differenceCents: 1500,
  refundedCents: 0,
  cardRefundCents: 0,
  writtenOffCents: 0,
  wasDelivered: false,
  signerName: null,
  signaturePng: null,
  signedAt: null,
  createdAt: T1,
  ...over,
});

/** Le panier validé d'une adhésion, dont la facture attend son règlement. */
export const CART = (over: Partial<WorldCart> = {}): WorldCart => ({
  id: 'cart-1',
  clubId: 'club-1',
  status: MembershipCartStatus.VALIDATED,
  validatedAt: T0,
  invoiceId: 'inv-adhesion',
  ...over,
});

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** Échanges dont la facture du reste à payer porte un encaissement. */
const PAID_SUPPLEMENT = { supplementInvoice: { is: { payments: { some: {} } } } };

/** Le seul SQL brut de ces chemins : un verrou de règlement (ADR-0022, §3). */
const ADVISORY_LOCK =
  /^SELECT pg_advisory_xact_lock\(hashtext\('(clubflow:invoice|clubflow:payer-credit)'\), hashtext\(\?\)\)$/;

/**
 * Copie profonde qui garde des Date de ce contexte de test : celles que rend
 * structuredClone viennent d'un autre contexte, que toBeInstanceOf refuse.
 */
function clone<T>(value: T): T {
  if (value instanceof Date) return new Date(value.getTime()) as T;
  if (Array.isArray(value)) return value.map((v) => clone(v)) as unknown as T;
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, clone(v)]),
    ) as T;
  }
  return value;
}

function allowOnly(value: object, keys: string[]): void {
  for (const k of Object.keys(value)) {
    if (!keys.includes(k)) throw new Error(`clause non simulée : ${k}`);
  }
}

/** `null` ou `{ not: null }`, appliqués pour de vrai. */
function nullity(value: unknown, clause: any): boolean {
  if (clause === null) return value === null;
  if (clause && same(Object.keys(clause), ['not']) && clause.not === null) {
    return value !== null;
  }
  throw new Error('clause de nullité non simulée');
}

/** Égalité, ou `{ in: [...] }`. */
function oneOf(value: unknown, clause: any): boolean {
  if (clause !== null && typeof clause === 'object') {
    allowOnly(clause, ['in']);
    return clause.in.includes(value);
  }
  return value === clause;
}

/** Entier : égalité, `gt`, `gte`. */
function count(value: number, clause: any): boolean {
  if (clause === undefined) return true;
  if (typeof clause === 'number') return value === clause;
  allowOnly(clause, ['gt', 'gte']);
  return (
    (clause.gt === undefined || value > clause.gt) &&
    (clause.gte === undefined || value >= clause.gte)
  );
}

/** Une transaction ouverte : ce qu'elle a écrit, et les verrous qu'elle tient. */
type OpenTx = {
  id: number;
  undo: Array<() => void>;
  release: Array<() => void>;
};

/** La transaction du client qui a lancé la requête ; aucune pour `prisma`. */
const currentTx = new AsyncLocalStorage<OpenTx>();

/**
 * Écrit `{ increment }`, `{ decrement }` ou une valeur. Faite par le client
 * d'une transaction, l'écriture est défaite si celle-ci lève.
 */
function write(row: Record<string, any>, data: Record<string, any>): void {
  const tx = currentTx.getStore();
  if (tx) {
    const before = Object.keys(data).map(
      (key) => [key, key in row, clone(row[key])] as const,
    );
    tx.undo.push(() => {
      for (const [key, existed, value] of before) {
        if (existed) row[key] = value;
        else delete row[key];
      }
    });
  }
  for (const [key, value] of Object.entries(data)) {
    if (
      value !== null &&
      typeof value === 'object' &&
      !(value instanceof Date) &&
      ('increment' in value || 'decrement' in value)
    ) {
      row[key] += (value.increment ?? 0) - (value.decrement ?? 0);
    } else {
      row[key] = clone(value);
    }
  }
}

/** Ajoute une ligne. Faite par le client d'une transaction, elle part au rollback. */
function insert<T>(rows: T[], row: T): void {
  rows.push(row);
  const tx = currentTx.getStore();
  if (tx) {
    tx.undo.push(() => {
      const at = rows.indexOf(row);
      if (at >= 0) rows.splice(at, 1);
    });
  }
}

/** Les champs demandés par un `select` de colonnes. */
function pick(row: Record<string, any>, select: Record<string, any>) {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(select)) {
    if (value !== true) throw new Error(`relation non simulée : ${key}`);
    if (!(key in row)) throw new Error(`champ non simulé : ${key}`);
    out[key] = clone(row[key]);
  }
  return out;
}

export function makeWorld(seed: {
  orders: WorldOrder[];
  variants: WorldVariant[];
  products?: WorldProduct[];
  invoices?: WorldInvoice[];
  payments?: WorldPayment[];
  cheques?: WorldCheque[];
  deposits?: Array<{ id: string; financialAccountId: string }>;
  adjustments?: WorldAdjustment[];
  carts?: WorldCart[];
  /** Banque par défaut du club ; `null` : le club n'en a pas. */
  clubBankId?: string | null;
}) {
  const { orders, variants } = seed;
  const products = seed.products ?? [
    PRODUCT(),
    PRODUCT({ id: 'p-2', name: 'Kimono', priceCents: 3500 }),
  ];
  const invoices = seed.invoices ?? [];
  const payments = seed.payments ?? [];
  const cheques = seed.cheques ?? [];
  const deposits = seed.deposits ?? [];
  const adjustments = seed.adjustments ?? [];
  const carts = seed.carts ?? [];
  const movements: Array<Record<string, any>> = [];
  const clubs = [
    { id: 'club-1', name: 'Dojo Test', siret: null, address: '1 rue du Dojo' },
  ];
  const members = [
    {
      id: 'm-1',
      clubId: 'club-1',
      firstName: 'Camille',
      lastName: 'MARTIN',
      email: 'camille.martin@example.fr',
    },
  ];
  const families = [{ memberId: 'm-1', clubId: 'club-1', familyId: 'fam-1' }];
  /** Ordre des gestes : ce qui est APRÈS le commit se lit ici. */
  const events: string[] = [];
  let seq = 0;
  const uid = (p: string) => `${p}-n${++seq}`;
  let depth = 0;

  // --- Concurrence -----------------------------------------------------------

  let latencyMs = 0;
  /** Réponse d'une lecture : l'état est déjà pris, elle arrive après la latence. */
  const respond = async <T>(state: T): Promise<T> => {
    if (latencyMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, latencyMs));
    }
    return state;
  };

  let txSeq = 0;
  const lockQueues = new Map<string, Promise<void>>();
  const lockHolders = new Map<string, number>();
  /** Transactions qui tiennent ou attendent chaque clé. */
  const lockDemand = new Map<string, number>();
  let lockWatchers: Array<() => void> = [];
  /** La prochaine fois qu'une transaction bute sur un verrou tenu. */
  const nextLockWait = () =>
    new Promise<void>((resolve) => lockWatchers.push(resolve));

  /** `pg_advisory_xact_lock` : exclusif par clé, ré-entrant, levé en fin de transaction. */
  async function advisoryLock(key: string, tx: OpenTx): Promise<void> {
    if (lockHolders.get(key) === tx.id) return;
    const demand = lockDemand.get(key) ?? 0;
    lockDemand.set(key, demand + 1);
    const previous = lockQueues.get(key) ?? Promise.resolve();
    let release!: () => void;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    lockQueues.set(key, previous.then(() => held));
    if (demand > 0) {
      const watchers = lockWatchers;
      lockWatchers = [];
      for (const notify of watchers) notify();
    }
    await previous;
    lockHolders.set(key, tx.id);
    tx.release.push(() => {
      lockHolders.delete(key);
      lockDemand.set(key, (lockDemand.get(key) ?? 1) - 1);
      release();
    });
  }

  const armed = new Map<Moment, () => Promise<unknown>>();
  const launched = new Map<Moment, Promise<unknown>>();

  /**
   * Juste avant l'écriture d'un moment armé : lance son geste hors de toute
   * transaction, et le laisse tourner jusqu'à ce qu'il se termine ou bute sur
   * un verrou tenu. L'écriture reprend ensuite.
   */
  async function reach(moment: Moment): Promise<void> {
    const gesture = armed.get(moment);
    if (!gesture) return;
    armed.delete(moment);
    const blocked = nextLockWait();
    const run = currentTx.exit(() => gesture());
    launched.set(moment, run);
    await Promise.race([run.then(() => undefined, () => undefined), blocked]);
  }

  // --- Tables ----------------------------------------------------------------

  const paymentsOf = (invoiceId: string) =>
    payments.filter((p) => p.invoiceId === invoiceId);
  /** LA facture de la commande : `shopOrderId` est unique. */
  const mainInvoiceOf = (orderId: string) =>
    invoices.find((i) => i.shopOrderId === orderId) ?? null;
  const supplementOf = (adjustmentId: string) =>
    invoices.find((i) => i.shopAdjustmentId === adjustmentId) ?? null;
  const paidSupplementsOf = (orderId: string) =>
    adjustments.filter((a) => {
      const sup = a.orderId === orderId ? supplementOf(a.id) : null;
      return sup !== null && paymentsOf(sup.id).length > 0;
    });

  const paymentsWithCheques = (invoiceId: string) =>
    paymentsOf(invoiceId)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
      .map((p) => {
        const c = cheques.find((x) => x.paymentId === p.id);
        const d = deposits.find((x) => x.id === c?.depositId);
        return {
          ...clone(p),
          cheque: c
            ? {
                id: c.id,
                number: c.number,
                status: c.status,
                depositId: c.depositId,
                deposit: d ? { financialAccountId: d.financialAccountId } : null,
              }
            : null,
        };
      });

  // Les factures d'une commande : la sienne, ou celle du reste à payer de l'un
  // de ses échanges (ADR-0020).
  const invoiceBranch = (i: WorldInvoice, branch: any): boolean => {
    allowOnly(branch, ['shopOrderId', 'shopAdjustment']);
    if (branch.shopOrderId !== undefined) {
      return i.shopOrderId !== null && oneOf(i.shopOrderId, branch.shopOrderId);
    }
    allowOnly(branch.shopAdjustment, ['is']);
    allowOnly(branch.shopAdjustment.is, ['orderId']);
    const adj = adjustments.find((a) => a.id === i.shopAdjustmentId);
    return adj !== undefined && oneOf(adj.orderId, branch.shopAdjustment.is.orderId);
  };

  const invoiceMatches = (i: WorldInvoice, w: any): boolean => {
    allowOnly(w, [
      'id',
      'clubId',
      'shopOrderId',
      'status',
      'payments',
      'parentInvoiceId',
      'isCreditNote',
      'OR',
    ]);
    if (w.id !== undefined && i.id !== w.id) return false;
    if (w.clubId !== undefined && i.clubId !== w.clubId) return false;
    if (w.shopOrderId !== undefined && !oneOf(i.shopOrderId, w.shopOrderId)) return false;
    if (w.status !== undefined) {
      if (w.status !== null && typeof w.status === 'object') {
        allowOnly(w.status, ['not', 'in']);
        if (w.status.not !== undefined && i.status === w.status.not) return false;
        if (w.status.in !== undefined && !w.status.in.includes(i.status)) return false;
      } else if (i.status !== w.status) return false;
    }
    if (w.parentInvoiceId !== undefined && !oneOf(i.parentInvoiceId, w.parentInvoiceId)) {
      return false;
    }
    if (w.isCreditNote !== undefined && i.isCreditNote !== w.isCreditNote) return false;
    if (w.OR !== undefined && !w.OR.some((b: any) => invoiceBranch(i, b))) return false;
    if (w.payments !== undefined) {
      if (!same(w.payments, { none: {} })) throw new Error('clause payments non simulée');
      if (paymentsOf(i.id).length > 0) return false;
    }
    return true;
  };

  /** Ce que le `select` demande d'une facture, relations comprises. */
  const projectInvoice = (i: WorldInvoice, select: Record<string, any>) => {
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(select)) {
      if (key === 'shopAdjustment') {
        const adj = adjustments.find((a) => a.id === i.shopAdjustmentId);
        out[key] = adj ? pick(adj, value.select) : null;
      } else if (key === 'payments') {
        allowOnly(value, ['select']);
        out[key] = paymentsOf(i.id).map((p) => pick(p, value.select));
      } else if (key === 'creditNotes') {
        allowOnly(value, ['where', 'select']);
        out[key] = invoices
          .filter(
            (c) =>
              c.isCreditNote &&
              c.parentInvoiceId === i.id &&
              invoiceMatches(c, value.where ?? {}),
          )
          .map((c) => pick(c, value.select));
      } else {
        Object.assign(out, pick(i, { [key]: value }));
      }
    }
    return out;
  };

  const orderMatches = (o: WorldOrder, w: any): boolean => {
    allowOnly(w, [
      'id',
      'clubId',
      'status',
      'memberId',
      'contactId',
      'fulfilledAt',
      'deliveredAt',
      'OR',
      'adjustments',
    ]);
    if (w.id !== undefined && o.id !== w.id) return false;
    if (w.clubId !== undefined && o.clubId !== w.clubId) return false;
    if (w.status !== undefined && !oneOf(o.status, w.status)) return false;
    if (w.memberId !== undefined && o.memberId !== w.memberId) return false;
    if (w.contactId !== undefined && o.contactId !== w.contactId) return false;
    if (w.fulfilledAt !== undefined && !nullity(o.fulfilledAt, w.fulfilledAt)) return false;
    if (w.deliveredAt !== undefined && !nullity(o.deliveredAt, w.deliveredAt)) return false;
    if (w.OR !== undefined) {
      // Garde « aucun encaissement » (ADR-0019) : sans facture, ou facture
      // sans paiement.
      const inv = mainInvoiceOf(o.id);
      const any = w.OR.some((branch: any) => {
        allowOnly(branch, ['invoice']);
        const is = branch.invoice.is;
        return is === null ? inv === null : inv !== null && invoiceMatches(inv, is);
      });
      if (!any) return false;
    }
    if (w.adjustments !== undefined) {
      if (!same(w.adjustments, { none: PAID_SUPPLEMENT })) {
        throw new Error('clause adjustments non simulée');
      }
      if (paidSupplementsOf(o.id).length > 0) return false;
    }
    return true;
  };

  const lineMatches = (l: WorldLine, w: any): boolean => {
    allowOnly(w, ['id', 'orderId', 'cancelledQty', 'awaitingStockQty']);
    return (
      (w.id === undefined || l.id === w.id) &&
      (w.orderId === undefined || l.orderId === w.orderId) &&
      count(l.cancelledQty, w.cancelledQty) &&
      count(l.awaitingStockQty, w.awaitingStockQty)
    );
  };

  const variantMatches = (v: WorldVariant, w: any): boolean => {
    allowOnly(w, ['id', 'clubId', 'active', 'trackStock', 'onHand', 'available']);
    return (
      (w.id === undefined || v.id === w.id) &&
      (w.clubId === undefined || v.clubId === w.clubId) &&
      (w.active === undefined || v.active === w.active) &&
      (w.trackStock === undefined || v.trackStock === w.trackStock) &&
      count(v.onHand, w.onHand) &&
      count(v.available, w.available)
    );
  };

  const db: any = {
    club: {
      findUnique: jest.fn(async ({ where }: any) => {
        allowOnly(where, ['id']);
        return respond(clone(clubs.find((c) => c.id === where.id) ?? null));
      }),
    },
    shopOrder: {
      findFirst: jest.fn(async ({ where, include, select }: any) => {
        const o = orders.find((x) => orderMatches(x, where));
        if (!o) return respond(null);
        const row: Record<string, any> = clone(o);
        const relations = { ...(include ?? {}), ...(select ?? {}) };
        if (relations.invoice) {
          const inv = mainInvoiceOf(o.id);
          row.invoice = inv
            ? { id: inv.id, payments: paymentsOf(inv.id).map((p) => ({ id: p.id })) }
            : null;
        }
        if (relations.club) {
          row.club = pick(clubs.find((c) => c.id === o.clubId)!, relations.club.select);
        }
        // Aucunes CGV dans ce monde.
        if (relations.termsAsset) row.termsAsset = null;
        if (relations.adjustments) {
          if (!same(relations.adjustments.where, PAID_SUPPLEMENT)) {
            throw new Error('clause adjustments non simulée');
          }
          row.adjustments = paidSupplementsOf(o.id)
            .slice(0, relations.adjustments.take)
            .map((a) => ({ id: a.id }));
        }
        return respond(row);
      }),
      findFirstOrThrow: jest.fn(async ({ where }: any) => {
        const o = orders.find((x) => orderMatches(x, where));
        const row = o ? clone(o) : null;
        await respond(row);
        if (!row) throw new Error('commande introuvable');
        return row;
      }),
      findMany: jest.fn(async ({ where, orderBy }: any) => {
        allowOnly(where, ['clubId', 'memberId', 'contactId']);
        expect(orderBy).toEqual([{ createdAt: 'desc' }]);
        return respond(
          orders
            .filter((o) => orderMatches(o, where))
            .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
            .map((o) => clone(o)),
        );
      }),
      updateMany: jest.fn(async ({ where, data }: any) => {
        const hit = orders.filter((o) => orderMatches(o, where));
        for (const o of hit) write(o, data);
        return { count: hit.length };
      }),
      update: jest.fn(async ({ where, data }: any) => {
        allowOnly(where, ['id']);
        allowOnly(data, ['deliveredLines', 'totalCents']);
        const o = orders.find((x) => x.id === where.id);
        if (!o) throw new Error('commande introuvable');
        write(o, data);
        return clone(o);
      }),
    },
    shopOrderLine: {
      updateMany: jest.fn(async ({ where, data }: any) => {
        const hit = orders.flatMap((o) => o.lines).filter((l) => lineMatches(l, where));
        for (const l of hit) write(l, data);
        return { count: hit.length };
      }),
      create: jest.fn(async ({ data }: any) => {
        allowOnly(data, ['orderId', 'productId', 'variantId', 'quantity', 'unitPriceCents', 'label']);
        const order = orders.find((o) => o.id === data.orderId);
        if (!order) throw new Error('commande introuvable');
        const line: WorldLine = {
          id: uid('line'),
          awaitingStockQty: 0,
          cancelledQty: 0,
          createdAt: new Date(),
          ...data,
        };
        insert(order.lines, line);
        return clone(line);
      }),
      update: jest.fn(async ({ where, data }: any) => {
        allowOnly(where, ['id']);
        allowOnly(data, ['awaitingStockQty']);
        const line = orders.flatMap((o) => o.lines).find((l) => l.id === where.id);
        if (!line) throw new Error('ligne introuvable');
        write(line, data);
        return clone(line);
      }),
    },
    shopProductVariant: {
      findFirst: jest.fn(async ({ where, include, select }: any) => {
        const v = variants.find((x) => variantMatches(x, where));
        if (!v) return respond(null);
        if (select) return respond(pick(v, select));
        const row: Record<string, unknown> = clone(v);
        if (include) {
          allowOnly(include, ['product']);
          const p = products.find((x) => x.id === v.productId);
          row.product = p ? pick(p, include.product.select) : null;
        }
        return respond(row);
      }),
      updateMany: jest.fn(async ({ where, data }: any) => {
        const hit = variants.filter((v) => variantMatches(v, where));
        for (const v of hit) write(v, data);
        return { count: hit.length };
      }),
    },
    shopStockMovement: {
      create: jest.fn(async ({ data }: any) => {
        insert(movements, data);
        return { id: uid('mv'), ...data };
      }),
    },
    shopOrderAdjustment: {
      create: jest.fn(async ({ data }: any) => {
        const row: WorldAdjustment = {
          id: uid('adj'),
          createdAt: new Date(),
          refundedCents: 0,
          cardRefundCents: 0,
          writtenOffCents: 0,
          ...data,
        };
        insert(adjustments, row);
        return clone(row);
      }),
      update: jest.fn(async ({ where, data }: any) => {
        allowOnly(where, ['id']);
        const row = adjustments.find((a) => a.id === where.id);
        if (!row) throw new Error('ajustement introuvable');
        write(row, data);
        return clone(row);
      }),
      findMany: jest.fn(async ({ where, orderBy, select }: any) => {
        allowOnly(where, ['orderId']);
        let hit = adjustments.filter((a) => oneOf(a.orderId, where.orderId));
        if (orderBy !== undefined) {
          expect(orderBy).toEqual({ createdAt: 'asc' });
          hit = [...hit].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
        }
        const { supplementInvoice, ...columns } = select;
        return respond(
          hit.map((a) => {
            const sup = supplementOf(a.id);
            return {
              ...pick(a, columns),
              ...(supplementInvoice
                ? { supplementInvoice: sup ? pick(sup, supplementInvoice.select) : null }
                : {}),
            };
          }),
        );
      }),
      findFirst: jest.fn(async ({ where, include }: any) => {
        allowOnly(where, ['id', 'clubId', 'kind', 'signedAt']);
        const a = adjustments.find(
          (x) =>
            (where.id === undefined || x.id === where.id) &&
            (where.clubId === undefined || x.clubId === where.clubId) &&
            (where.kind === undefined || x.kind === where.kind) &&
            (where.signedAt === undefined || nullity(x.signedAt, where.signedAt)),
        );
        if (!a) return respond(null);
        const row: Record<string, unknown> = clone(a);
        if (include) {
          allowOnly(include, ['order']);
          const o = orders.find((x) => x.id === a.orderId)!;
          const { club, ...columns } = include.order.select;
          row.order = {
            ...pick(o, columns),
            ...(club ? { club: pick(clubs.find((c) => c.id === o.clubId)!, club.select) } : {}),
          };
        }
        return respond(row);
      }),
    },
    invoice: {
      findFirst: jest.fn(async ({ where, select, include }: any) => {
        const i = invoices.find((x) => invoiceMatches(x, where));
        if (!i) return respond(null);
        if (select) return respond(projectInvoice(i, select));
        const row: Record<string, unknown> = clone(i);
        if (include) {
          allowOnly(include, ['payments', 'paymentSchedule']);
          if (include.payments !== undefined) {
            if (include.payments !== true) throw new Error('include payments non simulé');
            row.payments = paymentsOf(i.id).map((p) => clone(p));
          }
          if (include.paymentSchedule !== undefined) {
            if (!same(include.paymentSchedule, { select: { status: true } })) {
              throw new Error('include paymentSchedule non simulé');
            }
            // Aucun échéancier dans ce monde.
            row.paymentSchedule = null;
          }
        }
        return respond(row);
      }),
      findMany: jest.fn(async ({ where, include, select, orderBy }: any) => {
        let hit = invoices.filter((i) => invoiceMatches(i, where));
        if (orderBy !== undefined) {
          expect(orderBy).toEqual({ createdAt: 'asc' });
          hit = [...hit].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
        }
        if (include) {
          allowOnly(include, ['payments']);
          return respond(hit.map((i) => ({ ...clone(i), payments: paymentsWithCheques(i.id) })));
        }
        return respond(hit.map((i) => (select ? projectInvoice(i, select) : clone(i))));
      }),
      count: jest.fn(async ({ where }: any) =>
        respond(invoices.filter((i) => invoiceMatches(i, where)).length),
      ),
      aggregate: jest.fn(async ({ where }: any) => {
        const hit = invoices.filter((i) => invoiceMatches(i, where));
        return respond({
          _sum: {
            amountCents: hit.length ? hit.reduce((s, i) => s + i.amountCents, 0) : null,
          },
        });
      }),
      create: jest.fn(async ({ data, select }: any) => {
        const row: WorldInvoice = {
          id: uid(data.isCreditNote ? 'cn' : 'inv'),
          shopOrderId: null,
          shopAdjustmentId: null,
          voidReason: null,
          isCreditNote: false,
          parentInvoiceId: null,
          createdAt: new Date(),
          ...data,
        };
        insert(invoices, row);
        return select ? pick(row, select) : clone(row);
      }),
      update: jest.fn(async ({ where, data }: any) => {
        allowOnly(where, ['id']);
        if (data.status === InvoiceStatus.VOID) await reach('void');
        const i = invoices.find((x) => x.id === where.id);
        if (!i) throw new Error('facture introuvable');
        write(i, data);
        return clone(i);
      }),
      updateMany: jest.fn(async ({ where, data }: any) => {
        if (data.status === InvoiceStatus.VOID) await reach('void');
        const hit = invoices.filter((i) => invoiceMatches(i, where));
        for (const i of hit) write(i, data);
        return { count: hit.length };
      }),
    },
    payment: {
      count: jest.fn(async ({ where }: any) => {
        allowOnly(where, ['invoiceId', 'clubId']);
        return respond(
          payments.filter(
            (p) => p.invoiceId === where.invoiceId && p.clubId === where.clubId,
          ).length,
        );
      }),
      aggregate: jest.fn(async ({ where, _sum }: any) => {
        allowOnly(where, ['invoiceId']);
        if (!same(_sum, { amountCents: true })) throw new Error('agrégat non simulé');
        const hit = payments.filter(
          (p) => where.invoiceId === undefined || p.invoiceId === where.invoiceId,
        );
        return respond({
          _sum: {
            amountCents: hit.length ? hit.reduce((s, p) => s + p.amountCents, 0) : null,
          },
        });
      }),
      create: jest.fn(async ({ data }: any) => {
        if (data.amountCents > 0) await reach('payment');
        const row: WorldPayment = {
          id: uid('pay'),
          externalRef: null,
          refundedPaymentId: null,
          createdAt: new Date(),
          ...data,
        };
        insert(payments, row);
        return clone(row);
      }),
    },
    // Aucun échéancier dans ce monde : aucun prélèvement en vol.
    paymentScheduleInstallment: {
      aggregate: jest.fn(async ({ where }: any) => {
        allowOnly(where, ['schedule', 'status', 'stripePaymentIntentId', 'paymentId']);
        return respond({ _sum: { amountCents: null } });
      }),
    },
    cheque: {
      updateMany: jest.fn(async ({ where, data }: any) => {
        allowOnly(where, ['id', 'clubId', 'status', 'depositId']);
        const hit = cheques.filter(
          (c) =>
            c.id === where.id &&
            c.clubId === where.clubId &&
            c.status === where.status &&
            (where.depositId === undefined || c.depositId === where.depositId),
        );
        for (const c of hit) write(c, data);
        return { count: hit.length };
      }),
    },
    member: {
      findMany: jest.fn(async ({ where, select }: any) => {
        allowOnly(where, ['id']);
        return respond(
          members.filter((m) => oneOf(m.id, where.id)).map((m) => pick(m, select)),
        );
      }),
      findFirst: jest.fn(async ({ where, select }: any) => {
        allowOnly(where, ['id', 'clubId']);
        const m = members.find((x) => x.id === where.id && x.clubId === where.clubId);
        return respond(m ? pick(m, select) : null);
      }),
    },
    contact: {
      findMany: jest.fn(async () => respond([])),
      findFirst: jest.fn(async () => respond(null)),
    },
    familyMember: {
      findFirst: jest.fn(async ({ where }: any) => {
        allowOnly(where, ['memberId', 'family']);
        const f = families.find(
          (x) => x.memberId === where.memberId && x.clubId === where.family.clubId,
        );
        return respond(f ? { familyId: f.familyId } : null);
      }),
    },
    membershipCart: {
      // Le panier de `getCartById` : seuls son statut et sa facture servent à
      // la réouverture, ses autres relations sont vides dans ce monde.
      findFirst: jest.fn(async ({ where, include }: any) => {
        allowOnly(where, ['id', 'clubId']);
        allowOnly(include ?? {}, [
          'items',
          'pendingItems',
          'payerContact',
          'payerMember',
          'family',
          'clubSeason',
          'invoice',
        ]);
        const c = carts.find(
          (x) =>
            (where.id === undefined || x.id === where.id) &&
            (where.clubId === undefined || x.clubId === where.clubId),
        );
        if (!c) return respond(null);
        const row: Record<string, unknown> = clone(c);
        if (include?.items) row.items = [];
        if (include?.pendingItems) row.pendingItems = [];
        for (const relation of ['payerContact', 'payerMember', 'family', 'clubSeason']) {
          if (include?.[relation]) row[relation] = null;
        }
        if (include?.invoice) {
          row.invoice = clone(invoices.find((i) => i.id === c.invoiceId) ?? null);
        }
        return respond(row);
      }),
      update: jest.fn(async ({ where, data }: any) => {
        allowOnly(where, ['id']);
        allowOnly(data, ['status', 'validatedAt', 'invoiceId']);
        const c = carts.find((x) => x.id === where.id);
        if (!c) throw new Error('panier introuvable');
        write(c, data);
        return clone(c);
      }),
    },
    $executeRaw: jest.fn(async (sql: TemplateStringsArray, ...values: unknown[]) => {
      const text = sql.join('?');
      const tx = currentTx.getStore();
      // Hors transaction, le verrou serait levé aussitôt pris.
      if (!tx) throw new Error(`Verrou pris hors transaction : ${text}`);
      const lock = ADVISORY_LOCK.exec(text);
      if (!lock || values.length !== 1) throw new Error(`SQL brut non simulé : ${text}`);
      await advisoryLock(`${lock[1]} ${String(values[0])}`, tx);
      return 0;
    }),
    $transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) => {
      const tx: OpenTx = { id: ++txSeq, undo: [], release: [] };
      depth += 1;
      try {
        const out = await fn(clientOf(tx));
        events.push('commit');
        return out;
      } catch (e) {
        for (const undo of tx.undo.reverse()) undo();
        events.push('rollback');
        throw e;
      } finally {
        depth -= 1;
        for (const release of tx.release) release();
      }
    }),
  };

  /** Le client d'une transaction : chacune de ses requêtes s'exécute dans celle-ci. */
  function clientOf(tx: OpenTx): unknown {
    const bind =
      (fn: (...args: any[]) => unknown) =>
      (...args: any[]) =>
        currentTx.run(tx, () => fn(...args));
    return new Proxy(db, {
      get(target, name: string) {
        // Un client de transaction n'en ouvre pas d'autre.
        if (name === '$transaction') return undefined;
        const value = target[name];
        if (typeof value === 'function') return bind(value);
        if (value === null || typeof value !== 'object') return value;
        return new Proxy(value, {
          get(table, method: string) {
            const fn = table[method];
            return typeof fn === 'function' ? bind(fn) : fn;
          },
        });
      },
    });
  }

  const trace = <A extends unknown[], R>(name: string, impl: (...args: A) => Promise<R>) =>
    jest.fn(async (...args: A) => {
      events.push(name);
      return impl(...args);
    });

  const preorders = {
    allocateQuietly: trace(
      'allocate',
      async (_clubId: string, _variantIds: Iterable<string>) => undefined,
    ),
  };
  const stock = new ShopStockService(db);
  const shop = new ShopService(db, stock, {} as never, preorders as never);
  const accounting = {
    createContraEntryForCreditNote: trace(
      'accounting',
      async (
        _clubId: string,
        _creditNoteId: string,
        _sourcePaymentId?: string | null,
        _refundFinancialAccountId?: string | null,
      ) => undefined,
    ),
    recordIncomeFromPayment: trace(
      'income',
      async (
        _clubId: string,
        _paymentId: string,
        _label: string,
        _amountCents: number,
        _financialAccountId?: string | null,
      ) => undefined,
    ),
  };
  const creditNotes = new CreditNotesService(db, accounting as never);
  const stripeRefunds = {
    refundPayment: trace(
      'stripe',
      async (args: { paymentId: string; amountCents?: number | null }) => ({
        refundId: 're_1',
        amountCents:
          args.amountCents ??
          payments.find((p) => p.id === args.paymentId)?.amountCents ??
          0,
      }),
    ),
  };
  const scheduleEngine = {
    sumInFlightForInvoice: jest.fn(async (_invoiceId: string) => 0),
    closeScheduleForInvoice: trace(
      'schedule',
      async (_invoiceId: string, _status: InvoiceStatus) => undefined,
    ),
  };
  const stripeCheckout = {
    expireCheckoutSessionForInvoice: trace(
      'expire',
      async (_clubId: string, _invoiceId: string) => 'expired' as const,
    ),
  };
  const financialAccounts = {
    getDefault: jest.fn(async (_clubId: string, _kind: string) =>
      seed.clubBankId === null ? null : { id: seed.clubBankId ?? 'fa-banque-club' },
    ),
  };
  const money = new ShopOrderMoneyService(
    db,
    creditNotes,
    stripeRefunds as never,
    scheduleEngine as never,
    stripeCheckout as never,
    financialAccounts as never,
  );
  const refunds = new ShopOrderRefundsService(db, shop, money, preorders as never);
  const adjust = new ShopOrderAdjustmentsService(db, shop, money, preorders as never);
  // Aucun payeur désigné dans ces scénarios : ni documents à signer, ni Stripe.
  const paymentsService = new PaymentsService(
    db,
    accounting as never,
    financialAccounts as never,
    {} as never,
    {} as never,
    {} as never,
    scheduleEngine as never,
    {} as never,
    stripeRefunds as never,
    creditNotes,
    shop,
  );
  const cartService = new MembershipCartService(
    db,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
  );

  /**
   * Un geste concurrent, APRÈS la lecture du plan et AVANT la transaction :
   * la lecture de l'échéancier est la dernière du plan.
   */
  const meanwhile = (fn: () => void) =>
    scheduleEngine.sumInFlightForInvoice.mockImplementationOnce(async () => {
      fn();
      return 0;
    });

  return {
    db,
    shop,
    stock,
    money,
    refunds,
    adjust,
    paymentsService,
    cartService,
    orders,
    variants,
    products,
    invoices,
    payments,
    cheques,
    movements,
    adjustments,
    carts,
    events,
    preorders,
    accounting,
    stripeRefunds,
    scheduleEngine,
    stripeCheckout,
    financialAccounts,
    meanwhile,
    /** Latence de chaque lecture, en millisecondes : 0 par défaut. */
    raceWindow(ms: number) {
      latencyMs = ms;
    },
    /**
     * Arme un moment : juste avant cette écriture, `gesture` est lancé, et
     * tourne jusqu'à se terminer ou buter sur un verrou tenu. Rend l'issue du
     * geste, une fois le moment passé ; lève s'il n'a jamais été atteint.
     */
    atMoment(moment: Moment, gesture: () => Promise<unknown>) {
      armed.set(moment, gesture);
      return {
        outcome: async (): Promise<PromiseSettledResult<unknown>> => {
          const run = launched.get(moment);
          if (!run) throw new Error(`Moment « ${moment} » jamais atteint.`);
          const [settled] = await Promise.allSettled([run]);
          return settled;
        },
      };
    },
    /** Transactions ouvertes à cet instant : 0 hors de toute transaction. */
    txDepth: () => depth,
    creditNotesOf: () => invoices.filter((i) => i.isCreditNote),
    refundsOf: () => payments.filter((p) => p.amountCents < 0),
  };
}

export type World = ReturnType<typeof makeWorld>;
