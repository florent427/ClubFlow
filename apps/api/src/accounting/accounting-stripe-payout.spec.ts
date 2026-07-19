import { AccountingEntryKind, AccountingLineSide } from '@prisma/client';
import { AccountingService } from './accounting.service';
import type { PrismaService } from '../prisma/prisma.service';

/**
 * Écriture de virement Stripe : solde du compte de transit vers la banque.
 *
 * C'est la seconde moitié du dispositif de transit, et sans elle la première
 * est nuisible : les encaissements créditent le transit au brut, les frais le
 * débitent, et si rien ne constate le virement, le transit gonfle
 * indéfiniment pendant que la banque reste vide.
 */

type Line = {
  accountCode: string;
  side: AccountingLineSide;
  debitCents: number;
  creditCents: number;
};

function makeHarness(opts?: {
  accountingEnabled?: boolean;
  hasTransit?: boolean;
  existingEntry?: boolean;
}) {
  const entries: Array<Record<string, unknown>> = [];
  const lines: Line[] = [];

  const tx = {
    accountingEntry: {
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
        entries.push(data);
        return { id: 'entry-payout' };
      }),
    },
    accountingEntryLine: {
      create: jest.fn(async ({ data }: { data: Line }) => {
        lines.push(data);
        return data;
      }),
    },
  };

  const prisma = {
    clubModule: {
      findUnique: jest
        .fn()
        .mockResolvedValue({ enabled: opts?.accountingEnabled ?? true }),
    },
    accountingEntry: {
      findFirst: jest
        .fn()
        .mockResolvedValue(opts?.existingEntry ? { id: 'deja' } : null),
    },
    clubFinancialAccount: {
      findFirst: jest.fn().mockResolvedValue(
        (opts?.hasTransit ?? true)
          ? {
              id: 'fin-transit',
              accountingAccount: {
                code: '512300',
                label: 'Stripe transit (intermédiaire)',
              },
            }
          : null,
      ),
    },
    accountingAccount: {
      findUnique: jest.fn().mockResolvedValue({
        code: '512000',
        label: 'Banque principale',
        kind: 'ASSET',
      }),
    },
    $transaction: jest.fn(async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx)),
  };

  const svc = new AccountingService(
    prisma as unknown as PrismaService,
    {} as never,
    { resolveAccountCode: jest.fn().mockResolvedValue('512000') } as never,
    {} as never,
    { log: jest.fn().mockResolvedValue(undefined) } as never,
    {} as never,
    {} as never,
    {} as never,
  );

  return { svc, prisma, entries, lines, tx };
}

const PAYOUT = {
  clubId: 'club-1',
  payoutId: 'po_123',
  amountCents: 48_250,
  occurredAt: new Date('2026-07-21T00:00:00Z'),
};

describe('recordStripePayout', () => {
  it('débite la banque et crédite le transit du montant net viré', async () => {
    const h = makeHarness();

    await h.svc.recordStripePayout(PAYOUT);

    const banque = h.lines.find((l) => l.accountCode === '512000');
    const transit = h.lines.find((l) => l.accountCode === '512300');

    // L'argent entre en banque…
    expect(banque?.side).toBe(AccountingLineSide.DEBIT);
    expect(banque?.debitCents).toBe(48_250);
    // …et sort du transit. L'écriture est équilibrée.
    expect(transit?.side).toBe(AccountingLineSide.CREDIT);
    expect(transit?.creditCents).toBe(48_250);
  });

  it('n’affecte NI le résultat NI le produit : c’est un mouvement de trésorerie', async () => {
    // Un virement n'est ni une recette ni une charge — le club a déjà
    // constaté son produit à l'encaissement. Le compter en INCOME
    // doublerait son chiffre d'affaires.
    const h = makeHarness();

    await h.svc.recordStripePayout(PAYOUT);

    expect(h.entries[0].kind).toBe(AccountingEntryKind.TRANSFER);
  });

  it('date l’écriture à l’arrivée des fonds, pas au jour du webhook', async () => {
    const h = makeHarness();

    await h.svc.recordStripePayout(PAYOUT);

    expect(h.entries[0].occurredAt).toEqual(PAYOUT.occurredAt);
  });

  it('un webhook rejoué ne crée pas une seconde écriture', async () => {
    // Sans cette garde, un rejeu fausserait DEUX comptes d'un coup : la
    // banque gonflée et le transit creusé du même montant.
    const h = makeHarness({ existingEntry: true });

    await h.svc.recordStripePayout(PAYOUT);

    expect(h.tx.accountingEntry.create).not.toHaveBeenCalled();
  });

  it('porte l’identifiant du virement, qui sert de clé d’idempotence', async () => {
    const h = makeHarness();

    await h.svc.recordStripePayout(PAYOUT);

    expect(h.entries[0].stripePayoutId).toBe('po_123');
  });

  it('n’écrit rien pour un club sans compte de transit', async () => {
    // Ce club encaisse encore directement en banque : écrire le virement
    // créerait un doublon avec l'encaissement déjà porté au même compte.
    const h = makeHarness({ hasTransit: false });

    await h.svc.recordStripePayout(PAYOUT);

    expect(h.tx.accountingEntry.create).not.toHaveBeenCalled();
  });

  it('ne fait rien si le module comptable est désactivé', async () => {
    const h = makeHarness({ accountingEnabled: false });

    await h.svc.recordStripePayout(PAYOUT);

    expect(h.tx.accountingEntry.create).not.toHaveBeenCalled();
  });

  it('ignore un virement de montant nul ou négatif', async () => {
    // Stripe émet aussi des payouts négatifs (reprise de solde débiteur) :
    // les traiter comme une entrée de banque serait faux.
    const h = makeHarness();

    await h.svc.recordStripePayout({ ...PAYOUT, amountCents: 0 });
    await h.svc.recordStripePayout({ ...PAYOUT, amountCents: -5_000 });

    expect(h.tx.accountingEntry.create).not.toHaveBeenCalled();
  });
});
