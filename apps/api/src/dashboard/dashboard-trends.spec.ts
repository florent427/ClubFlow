import { InvoiceStatus } from '@prisma/client';
import { DashboardService } from './dashboard.service';

/**
 * Tableau de bord, « Factures en retard » : échéance dépassée ET solde dû.
 * Un avoir éteint une part de la dette (ADR-0011) : ni le montant crédité, ni
 * une facture qu'un avoir a éteinte ne doivent y compter.
 *
 * Le double applique exactement les clauses des requêtes factures et lève sur
 * une clause qu'il ne sait pas lire (cf.
 * docs/memory/pitfalls/double-ignore-une-clause-du-where.md). Les autres
 * indicateurs ne sont pas le sujet : leurs requêtes rendent zéro.
 */

const CLUB = 'club-1';
const DAY_MS = 86_400_000;
const daysAgo = (days: number) => new Date(Date.now() - days * DAY_MS);

type InvoiceRow = {
  id: string;
  clubId: string;
  amountCents: number;
  status: InvoiceStatus;
  isCreditNote: boolean;
  parentInvoiceId: string | null;
  dueAt: Date | null;
  updatedAt: Date;
};

type PaymentRow = { invoiceId: string; amountCents: number };

/** Échue depuis 10 jours. */
function invoice(row: Partial<InvoiceRow> & { id: string }): InvoiceRow {
  return {
    clubId: CLUB,
    amountCents: 10_000,
    status: InvoiceStatus.OPEN,
    isCreditNote: false,
    parentInvoiceId: null,
    dueAt: daysAgo(10),
    updatedAt: daysAgo(10),
    ...row,
  };
}

/** Un avoir naît PAID, sans échéance (credit-notes.service.ts). */
function creditNote(
  id: string,
  parentInvoiceId: string,
  amountCents: number,
  status: InvoiceStatus = InvoiceStatus.PAID,
): InvoiceRow {
  return invoice({
    id,
    amountCents,
    status,
    isCreditNote: true,
    parentInvoiceId,
    dueAt: null,
  });
}

function allowOnly(args: object, keys: string[]) {
  for (const key of Object.keys(args)) {
    if (!keys.includes(key)) throw new Error(`Argument non simulé : ${key}`);
  }
}

/** Le `where` tel que Prisma l'appliquerait, une clause à la fois. */
function matches(row: InvoiceRow, where: Record<string, unknown>): boolean {
  return Object.entries(where).every(([field, clause]) => {
    if (!(field in row)) throw new Error(`Champ non simulé : ${field}`);
    const value = row[field as keyof InvoiceRow];
    if (clause === null || typeof clause !== 'object') return value === clause;
    return Object.entries(clause).every(([op, operand]) => {
      if (op === 'not') return value !== operand;
      if (op === 'lt' || op === 'gte') {
        if (!(value instanceof Date)) return false;
        const delta = value.getTime() - (operand as Date).getTime();
        return op === 'lt' ? delta < 0 : delta >= 0;
      }
      throw new Error(`Opérateur non simulé : ${field}.${op}`);
    });
  });
}

function pick(row: InvoiceRow, select: Record<string, boolean>) {
  return Object.fromEntries(
    Object.keys(select).map((field) => {
      if (!(field in row)) throw new Error(`Champ non simulé : ${field}`);
      return [field, row[field as keyof InvoiceRow]];
    }),
  );
}

function makeService(seed: { invoices: InvoiceRow[]; payments?: PaymentRow[] }) {
  const { invoices } = seed;
  const payments = seed.payments ?? [];

  const project = (row: InvoiceRow, include: Record<string, any>) => {
    const out: Record<string, unknown> = { ...row };
    for (const [relation, args] of Object.entries(include)) {
      if (relation === 'payments') {
        out.payments = payments.filter((p) => p.invoiceId === row.id);
      } else if (relation === 'creditNotes') {
        allowOnly(args, ['where', 'select']);
        // Prisma suit `parentInvoiceId` ; le reste est la clause du service.
        out.creditNotes = invoices
          .filter((c) => c.parentInvoiceId === row.id && matches(c, args.where ?? {}))
          .map((c) => pick(c, args.select));
      } else {
        throw new Error(`Relation non simulée : ${relation}`);
      }
    }
    return out;
  };

  const zero = jest.fn(async () => 0);
  const prisma = {
    payment: {
      aggregate: jest.fn(async () => ({ _sum: { amountCents: null } })),
    },
    member: { count: zero },
    vitrinePage: { count: zero },
    vitrineArticle: { count: zero },
    contact: { count: zero },
    invoice: {
      findMany: jest.fn(
        async (args: {
          where: Record<string, unknown>;
          include?: Record<string, any>;
          select?: Record<string, boolean>;
        }) => {
          allowOnly(args, ['where', 'include', 'select']);
          return invoices
            .filter((row) => matches(row, args.where))
            .map((row) => (args.select ? pick(row, args.select) : project(row, args.include ?? {})));
        },
      ),
    },
  };
  return new DashboardService(prisma as never);
}

describe('DashboardService.trends — factures en retard, avoirs déduits', () => {
  it('le montant en retard déduit les paiements ET l’avoir', async () => {
    const dashboard = makeService({
      invoices: [invoice({ id: 'facture' }), creditNote('avoir', 'facture', 3_000)],
      payments: [{ invoiceId: 'facture', amountCents: 2_000 }],
    });

    const trends = await dashboard.trends(CLUB);

    expect([trends.overdueInvoicesCount, trends.overdueBalanceCents]).toEqual([1, 5_000]);
  });

  it('une facture qu’un avoir a éteinte ne compte plus en retard', async () => {
    const dashboard = makeService({
      invoices: [
        invoice({ id: 'eteinte' }),
        creditNote('avoir', 'eteinte', 10_000),
        invoice({ id: 'due', amountCents: 4_000 }),
      ],
    });

    const trends = await dashboard.trends(CLUB);

    expect([trends.overdueInvoicesCount, trends.overdueBalanceCents]).toEqual([1, 4_000]);
  });

  it('un avoir annulé ne déduit rien', async () => {
    const dashboard = makeService({
      invoices: [
        invoice({ id: 'facture' }),
        creditNote('avoir', 'facture', 4_000, InvoiceStatus.VOID),
      ],
    });

    const trends = await dashboard.trends(CLUB);

    expect([trends.overdueInvoicesCount, trends.overdueBalanceCents]).toEqual([1, 10_000]);
  });
});
