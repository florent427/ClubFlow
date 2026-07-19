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
  /**
   * Écriture de virement d'origine, telle que la retrouve
   * `reverseStripePayout`. `null` = aucun virement n'a été constaté.
   */
  originalPayoutEntry?: Record<string, unknown> | null;
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
      findFirst: jest.fn(
        async ({ where }: { where: Record<string, unknown> }) => {
          // `reverseStripePayout` cherche l'écriture d'ORIGINE en filtrant sur
          // la source ; `recordStripePayout` cherche un doublon sans ce
          // filtre. Le double distingue les deux appels ainsi.
          if (where.source === 'AUTO_STRIPE_PAYOUT') {
            return opts?.originalPayoutEntry === undefined
              ? {
                  id: 'entry-origine',
                  amountCents: 48_250,
                  financialAccountId: 'fin-transit',
                  financialAccount: {
                    accountingAccount: {
                      code: '512300',
                      label: 'Stripe transit (intermédiaire)',
                    },
                  },
                }
              : opts.originalPayoutEntry;
          }
          return opts?.existingEntry ? { id: 'deja' } : null;
        },
      ),
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

/**
 * Virement RETOURNÉ par la banque.
 *
 * Un virement passé en `paid` peut basculer en `failed` — IBAN clôturé, rejet
 * du correspondant — et les fonds retournent au solde Stripe. Sans réversion,
 * la banque affiche un encaissement jamais reçu et le transit reste
 * durablement sous ce que Stripe doit au club : exactement la divergence que
 * le compte de transit existe pour rendre détectable (ADR-0010).
 */
const REJET = {
  clubId: 'club-1',
  payoutId: 'po_123',
  reason: 'account_closed',
  occurredAt: new Date('2026-07-24T09:12:00Z'),
};

describe('reverseStripePayout', () => {
  it('écrit le MIROIR : débit du transit, crédit de la banque', async () => {
    const h = makeHarness();

    await h.svc.reverseStripePayout(REJET);

    const transit = h.lines.find((l) => l.accountCode === '512300');
    const banque = h.lines.find((l) => l.accountCode === '512000');

    // L'argent revient chez Stripe…
    expect(transit?.side).toBe(AccountingLineSide.DEBIT);
    expect(transit?.debitCents).toBe(48_250);
    // …et repart de la banque, qui n'a finalement rien reçu.
    expect(banque?.side).toBe(AccountingLineSide.CREDIT);
    expect(banque?.creditCents).toBe(48_250);
  });

  it('reprend le montant de l’écriture d’ORIGINE, pas celui de l’événement', async () => {
    // Neutraliser suppose des montants strictement égaux. Se fier au montant
    // porté par l'événement de rejet laisserait un résidu si les deux
    // divergeaient, et ce résidu serait indétectable.
    const h = makeHarness({
      originalPayoutEntry: {
        id: 'entry-origine',
        amountCents: 12_345,
        financialAccountId: 'fin-transit',
        financialAccount: {
          accountingAccount: { code: '512300', label: 'Stripe transit' },
        },
      },
    });

    await h.svc.reverseStripePayout(REJET);

    expect(h.entries[0].amountCents).toBe(12_345);
  });

  it('neutralise par ADDITION : l’écriture d’origine reste postée', async () => {
    // Le virement a réellement eu lieu avant d'être rejeté. Un grand livre
    // doit montrer les deux mouvements, pas escamoter le premier.
    const h = makeHarness();

    await h.svc.reverseStripePayout(REJET);

    expect(h.entries).toHaveLength(1);
    expect(h.entries[0].contraEntryId).toBe('entry-origine');
  });

  it('prend une clé d’idempotence DISTINCTE de celle du virement', async () => {
    // Réutiliser `po_123` heurterait la contrainte @@unique([clubId,
    // stripePayoutId]) posée par l'écriture d'origine : la réversion
    // n'aurait jamais lieu.
    const h = makeHarness();

    await h.svc.reverseStripePayout(REJET);

    expect(h.entries[0].stripePayoutId).toBe('po_123:reversed');
  });

  it('date la réversion au rejet, pas à l’arrivée prévue des fonds', async () => {
    const h = makeHarness();

    await h.svc.reverseStripePayout(REJET);

    expect(h.entries[0].occurredAt).toEqual(REJET.occurredAt);
  });

  it('n’écrit rien si aucun virement n’avait été constaté', async () => {
    // Club sans compta au moment du virement : il n'y a rien à défaire, et
    // écrire une réversion isolée creuserait le transit sans contrepartie.
    const h = makeHarness({ originalPayoutEntry: null });

    await h.svc.reverseStripePayout(REJET);

    expect(h.tx.accountingEntry.create).not.toHaveBeenCalled();
  });

  it('ne fait rien si le module comptable est désactivé', async () => {
    const h = makeHarness({ accountingEnabled: false });

    await h.svc.reverseStripePayout(REJET);

    expect(h.tx.accountingEntry.create).not.toHaveBeenCalled();
  });
});
