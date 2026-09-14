import { BadRequestException } from '@nestjs/common';
import {
  InvoiceStatus,
  PaymentScheduleInstallmentStatus,
  PaymentScheduleMethod,
  PaymentScheduleStatus,
} from '@prisma/client';
import { PaymentScheduleService } from './payment-schedule.service';

/**
 * Création d'un échéancier : on échelonne ce qui reste RÉCLAMABLE. Un avoir
 * éteint une part de la dette (ADR-0011) ; l'oublier, c'est annoncer à
 * l'adhérent — et, en SEPA, dans l'avis de prélèvement — des échéances que le
 * moteur ne prélèvera jamais, ou échelonner une facture qu'un avoir a éteinte.
 *
 * Le double Prisma applique exactement les clauses écrites par le code — ni
 * plus, ni moins — et lève sur une clause qu'il ne sait pas lire (cf.
 * docs/memory/pitfalls/double-ignore-une-clause-du-where.md).
 */

const CLUB = 'club-1';

type InvoiceRow = {
  id: string;
  clubId: string;
  amountCents: number;
  status: InvoiceStatus;
  isCreditNote: boolean;
  parentInvoiceId: string | null;
};

type PaymentRow = { invoiceId: string; amountCents: number };

type ScheduleRow = {
  id: string;
  clubId: string;
  invoiceId: string;
  method: PaymentScheduleMethod;
  status: PaymentScheduleStatus;
  totalCents: number;
  installmentCount: number;
};

type InstallmentRow = {
  id: string;
  scheduleId: string;
  clubId: string;
  seq: number;
  dueOn: Date;
  amountCents: number;
  status: PaymentScheduleInstallmentStatus;
  stripePaymentIntentId: string | null;
  paymentId: string | null;
};

type CreateScheduleArgs = {
  data: Omit<ScheduleRow, 'id'> & {
    installments: {
      create: Array<Pick<InstallmentRow, 'clubId' | 'seq' | 'dueOn' | 'amountCents'>>;
    };
  };
  include?: Record<string, unknown>;
};

function invoice(row: Partial<InvoiceRow> & { id: string }): InvoiceRow {
  return {
    clubId: CLUB,
    amountCents: 12_000,
    status: InvoiceStatus.OPEN,
    isCreditNote: false,
    parentInvoiceId: null,
    ...row,
  };
}

/** Un avoir naît PAID (credit-notes.service.ts). */
function creditNote(
  id: string,
  parentInvoiceId: string,
  amountCents: number,
  status: InvoiceStatus = InvoiceStatus.PAID,
): InvoiceRow {
  return invoice({ id, parentInvoiceId, amountCents, status, isCreditNote: true });
}

function allowOnly(args: object, keys: string[]) {
  for (const key of Object.keys(args)) {
    if (!keys.includes(key)) throw new Error(`Argument non simulé : ${key}`);
  }
}

/** Le `where` tel que Prisma l'appliquerait, une clause à la fois. */
function matches(row: object, where: Record<string, unknown>): boolean {
  return Object.entries(where).every(([field, clause]) => {
    if (!(field in row)) throw new Error(`Champ non simulé : ${field}`);
    const value = (row as Record<string, unknown>)[field];
    if (clause === null || typeof clause !== 'object') return value === clause;
    return Object.entries(clause).every(([op, operand]) => {
      if (op === 'not') return value !== operand;
      if (op === 'in') return (operand as unknown[]).includes(value);
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

/** Prisma rend `null` pour la somme d'aucune ligne. */
function sum(rows: Array<{ amountCents: number }>) {
  return {
    _sum: {
      amountCents: rows.length ? rows.reduce((s, r) => s + r.amountCents, 0) : null,
    },
  };
}

function makeWorld(seed: { invoices: InvoiceRow[]; payments?: PaymentRow[] }) {
  const { invoices } = seed;
  const payments = seed.payments ?? [];
  const schedules: ScheduleRow[] = [];
  const installments: InstallmentRow[] = [];

  const prisma = {
    invoice: {
      findFirst: jest.fn(
        async (args: {
          where: Record<string, unknown>;
          include?: Record<string, unknown>;
          select?: Record<string, boolean>;
        }) => {
          allowOnly(args, ['where', 'include', 'select']);
          const row = invoices.find((candidate) => matches(candidate, args.where));
          if (!row) return null;
          if (args.select) return pick(row, args.select);
          const out: Record<string, unknown> = { ...row };
          for (const relation of Object.keys(args.include ?? {})) {
            if (relation !== 'paymentSchedule') {
              throw new Error(`Relation non simulée : ${relation}`);
            }
            out.paymentSchedule = schedules.find((s) => s.invoiceId === row.id) ?? null;
          }
          return out;
        },
      ),
      aggregate: jest.fn(async (args: { where: Record<string, unknown> }) => {
        allowOnly(args, ['where', '_sum']);
        return sum(invoices.filter((row) => matches(row, args.where)));
      }),
    },
    payment: {
      aggregate: jest.fn(async (args: { where: Record<string, unknown> }) => {
        allowOnly(args, ['where', '_sum']);
        return sum(payments.filter((row) => matches(row, args.where)));
      }),
    },
    paymentScheduleInstallment: {
      aggregate: jest.fn(async (args: { where: Record<string, unknown> }) => {
        allowOnly(args, ['where', '_sum']);
        // `schedule` est un filtre de relation : il porte sur l'échéancier parent.
        const { schedule, ...where } = args.where;
        return sum(
          installments.filter((row) => {
            const parent = schedules.find((s) => s.id === row.scheduleId);
            const parentMatches =
              schedule === undefined ||
              (parent !== undefined && matches(parent, schedule as Record<string, unknown>));
            return parentMatches && matches(row, where);
          }),
        );
      }),
    },
    paymentSchedule: {
      create: jest.fn(async (args: CreateScheduleArgs) => {
        allowOnly(args, ['data', 'include']);
        const { installments: nested, ...data } = args.data;
        const schedule: ScheduleRow = { id: `echeancier-${schedules.length + 1}`, ...data };
        schedules.push(schedule);
        for (const planned of nested.create) {
          installments.push({
            id: `echeance-${installments.length + 1}`,
            scheduleId: schedule.id,
            status: PaymentScheduleInstallmentStatus.SCHEDULED,
            stripePaymentIntentId: null,
            paymentId: null,
            ...planned,
          });
        }
        return {
          ...schedule,
          installments: installments
            .filter((row) => row.scheduleId === schedule.id)
            .sort((a, b) => a.seq - b.seq),
        };
      }),
    },
  };

  // Stripe et les notifications n'interviennent pas à la création.
  const service = new PaymentScheduleService(prisma as never, {} as never, {} as never);
  return { service, schedules };
}

const createSchedule = (service: PaymentScheduleService) =>
  service.createForInvoice({
    clubId: CLUB,
    invoiceId: 'facture',
    method: PaymentScheduleMethod.CARD,
    installmentCount: 3,
    firstDueOn: new Date('2026-10-01T00:00:00Z'),
  });

describe('PaymentScheduleService.createForInvoice — les avoirs réduisent ce qu’on échelonne', () => {
  it('échelonne le reste dû, paiements ET avoir déduits', async () => {
    const { service } = makeWorld({
      invoices: [invoice({ id: 'facture' }), creditNote('avoir', 'facture', 3_000)],
      payments: [{ invoiceId: 'facture', amountCents: 2_000 }],
    });

    const schedule = await createSchedule(service);

    expect(schedule.totalCents).toBe(7_000);
    expect(schedule.installments.map((i) => i.amountCents)).toEqual([2_333, 2_333, 2_334]);
  });

  it('refuse une facture qu’un avoir a éteinte, même restée OPEN : aucun échéancier', async () => {
    const { service, schedules } = makeWorld({
      invoices: [
        invoice({ id: 'facture', amountCents: 10_000 }),
        creditNote('avoir', 'facture', 10_000),
      ],
    });

    const creating = createSchedule(service);

    await expect(creating).rejects.toBeInstanceOf(BadRequestException);
    await expect(creating).rejects.toThrow('Cette facture est déjà soldée.');
    expect(schedules).toHaveLength(0);
  });

  it('un avoir annulé ne diminue pas le montant échelonné', async () => {
    const { service } = makeWorld({
      invoices: [
        invoice({ id: 'facture' }),
        creditNote('avoir', 'facture', 3_000, InvoiceStatus.VOID),
      ],
    });

    const schedule = await createSchedule(service);

    expect(schedule.totalCents).toBe(12_000);
    expect(schedule.installments.map((i) => i.amountCents)).toEqual([4_000, 4_000, 4_000]);
  });
});
