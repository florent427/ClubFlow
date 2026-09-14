import { BadRequestException } from '@nestjs/common';
import { InvoiceStatus } from '@prisma/client';
import { InvoiceRemindersService } from './invoice-reminders.service';

/**
 * Relances : on réclame le RESTE DÛ. Un avoir éteint une part de la dette
 * (ADR-0011) ; l'oublier, c'est relancer un foyer pour ce que le club ne
 * réclame plus, avec un montant faux dans le mail.
 *
 * Le double Prisma applique exactement les clauses écrites par le service —
 * ni plus, ni moins — et lève sur une clause qu'il ne sait pas lire (cf.
 * docs/memory/pitfalls/double-ignore-une-clause-du-where.md).
 */

const CLUB = 'club-1';
const DAY_MS = 86_400_000;
const daysAgo = (days: number) => new Date(Date.now() - days * DAY_MS);

type InvoiceRow = {
  id: string;
  clubId: string;
  familyId: string | null;
  label: string;
  amountCents: number;
  status: InvoiceStatus;
  isCreditNote: boolean;
  parentInvoiceId: string | null;
  dueAt: Date | null;
  lastRemindedAt: Date | null;
};

type PaymentRow = { invoiceId: string; amountCents: number };

type SentMail = { to: string; subject: string; html: string; text: string };

/** Échue depuis 45 jours (au-delà du délai de grâce), jamais relancée. */
function invoice(row: Partial<InvoiceRow> & { id: string }): InvoiceRow {
  return {
    clubId: CLUB,
    familyId: 'famille-1',
    label: `Cotisation ${row.id}`,
    amountCents: 10_000,
    status: InvoiceStatus.OPEN,
    isCreditNote: false,
    parentInvoiceId: null,
    dueAt: daysAgo(45),
    lastRemindedAt: null,
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
    label: `Avoir — ${parentInvoiceId}`,
    amountCents,
    status,
    isCreditNote: true,
    parentInvoiceId,
    dueAt: null,
  });
}

const PAYER_FAMILY = {
  familyMembers: [
    {
      linkRole: 'PAYER',
      contact: null,
      member: { email: 'payeur@example.fr', firstName: 'Awa', lastName: 'Payet' },
    },
  ],
};

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
      if (op === 'lt') {
        return value instanceof Date && value.getTime() < (operand as Date).getTime();
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

function makeWorld(seed: { invoices: InvoiceRow[]; payments?: PaymentRow[] }) {
  const invoices = seed.invoices;
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
      } else if (relation === 'family') {
        out.family = row.familyId ? PAYER_FAMILY : null;
      } else if (relation === 'club') {
        out.club = { name: 'Club Démo' };
      } else {
        throw new Error(`Relation non simulée : ${relation}`);
      }
    }
    return out;
  };

  const prisma = {
    invoice: {
      findMany: jest.fn(
        async (args: {
          where: Record<string, unknown>;
          orderBy?: Record<string, string>;
          take?: number;
          include: Record<string, any>;
        }) => {
          allowOnly(args, ['where', 'orderBy', 'take', 'include']);
          const rows = invoices.filter((row) => matches(row, args.where));
          if (args.orderBy) {
            if (args.orderBy.dueAt !== 'asc') throw new Error('Tri non simulé');
            allowOnly(args.orderBy, ['dueAt']);
            rows.sort((a, b) => (a.dueAt?.getTime() ?? 0) - (b.dueAt?.getTime() ?? 0));
          }
          return rows.slice(0, args.take).map((row) => project(row, args.include));
        },
      ),
      findFirst: jest.fn(
        async (args: { where: Record<string, unknown>; include: Record<string, any> }) => {
          allowOnly(args, ['where', 'include']);
          const row = invoices.find((candidate) => matches(candidate, args.where));
          return row ? project(row, args.include) : null;
        },
      ),
      update: jest.fn(
        async (args: { where: { id: string }; data: Partial<InvoiceRow> }) => {
          allowOnly(args, ['where', 'data']);
          const row = invoices.find((candidate) => candidate.id === args.where.id);
          if (!row) throw new Error(`Facture inconnue : ${args.where.id}`);
          Object.assign(row, args.data);
          return { ...row };
        },
      ),
    },
  };
  const domains = {
    getVerifiedMailProfile: jest.fn(async () => ({
      from: { name: 'Club Démo', address: 'noreply@mail.demo.fr' },
    })),
  };
  const transport = {
    sendEmail: jest.fn(async (_mail: SentMail) => ({ providerMessageId: 'msg-1' })),
  };
  const svc = new InvoiceRemindersService(
    prisma as never,
    domains as never,
    transport as never,
  );
  return { svc, transport, invoices };
}

describe('InvoiceRemindersService — les avoirs réduisent ce qu’on relance', () => {
  describe('listOverdue', () => {
    it('annonce le reste dû, paiements ET avoir déduits', async () => {
      const { svc } = makeWorld({
        invoices: [invoice({ id: 'facture' }), creditNote('avoir', 'facture', 3_000)],
        payments: [{ invoiceId: 'facture', amountCents: 2_000 }],
      });

      const rows = await svc.listOverdue(CLUB);

      expect(rows.map((r) => [r.invoiceId, r.balanceCents])).toEqual([['facture', 5_000]]);
    });

    it('ne liste plus une facture qu’un avoir a éteinte, même restée OPEN', async () => {
      const { svc } = makeWorld({
        invoices: [
          invoice({ id: 'eteinte' }),
          creditNote('avoir', 'eteinte', 10_000),
          invoice({ id: 'due', amountCents: 4_000 }),
        ],
      });

      const rows = await svc.listOverdue(CLUB);

      expect(rows.map((r) => [r.invoiceId, r.balanceCents])).toEqual([['due', 4_000]]);
    });

    it('un avoir annulé ne déduit plus rien', async () => {
      const { svc } = makeWorld({
        invoices: [
          invoice({ id: 'facture' }),
          creditNote('avoir', 'facture', 4_000, InvoiceStatus.VOID),
        ],
      });

      const rows = await svc.listOverdue(CLUB);

      expect(rows.map((r) => [r.invoiceId, r.balanceCents])).toEqual([['facture', 10_000]]);
    });
  });

  describe('sendReminder', () => {
    it('refuse une facture qu’un avoir a éteinte : ni mail, ni date de relance', async () => {
      const { svc, transport, invoices } = makeWorld({
        invoices: [invoice({ id: 'facture' }), creditNote('avoir', 'facture', 7_000)],
        payments: [{ invoiceId: 'facture', amountCents: 3_000 }],
      });

      const sending = svc.sendReminder(CLUB, 'facture');

      await expect(sending).rejects.toBeInstanceOf(BadRequestException);
      await expect(sending).rejects.toThrow('Facture soldée — rien à relancer.');
      expect(transport.sendEmail).not.toHaveBeenCalled();
      expect(invoices.find((i) => i.id === 'facture')?.lastRemindedAt).toBeNull();
    });

    it('le mail annonce le reste dû, avoir déduit', async () => {
      const { svc, transport, invoices } = makeWorld({
        invoices: [invoice({ id: 'facture' }), creditNote('avoir', 'facture', 3_000)],
        payments: [{ invoiceId: 'facture', amountCents: 2_000 }],
      });

      await expect(svc.sendReminder(CLUB, 'facture')).resolves.toEqual({
        sentTo: 'payeur@example.fr',
      });

      expect(transport.sendEmail).toHaveBeenCalledTimes(1);
      const mail = transport.sendEmail.mock.calls[0][0];
      expect(mail.to).toBe('payeur@example.fr');
      expect(mail.html).toContain('<strong>50,00 €</strong>');
      expect(mail.text).toContain('Un solde de 50,00 € reste dû');
      expect(invoices.find((i) => i.id === 'facture')?.lastRemindedAt).not.toBeNull();
    });

    it('un avoir annulé ne diminue pas le montant réclamé', async () => {
      const { svc, transport } = makeWorld({
        invoices: [
          invoice({ id: 'facture' }),
          creditNote('avoir', 'facture', 4_000, InvoiceStatus.VOID),
        ],
      });

      await svc.sendReminder(CLUB, 'facture');

      const mail = transport.sendEmail.mock.calls[0][0];
      expect(mail.html).toContain('<strong>100,00 €</strong>');
      expect(mail.text).toContain('Un solde de 100,00 € reste dû');
    });
  });
});
