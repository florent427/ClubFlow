import { AccountingEntryKind, AccountingEntryStatus } from '@prisma/client';
import { AccountingService } from './accounting.service';
import type { PrismaService } from '../prisma/prisma.service';

/**
 * Régression : un avoir faussait le résultat comptable du club.
 *
 * `createContraEntryForCreditNote` neutralisait la recette DEUX fois — en
 * postant une contre-écriture ET en annulant l'écriture d'origine. Or `summary`
 * ignore les entries CANCELLED et additionne les POSTED : l'annulation retirait
 * la recette du résultat, et la contre-écriture la retranchait une seconde fois.
 *
 * Une contre-passation neutralise par ADDITION d'une écriture inverse. Les deux
 * mouvements ont eu lieu et restent au journal.
 */

type Entry = {
  id: string;
  kind: AccountingEntryKind;
  status: AccountingEntryStatus;
  amountCents: number;
  cancelledAt: Date | null;
};

/** Reproduit le calcul de `summary` : seules les entries POSTED comptent. */
function resultatCents(entries: Entry[]): number {
  return entries
    .filter((e) => e.status === AccountingEntryStatus.POSTED)
    .reduce(
      (acc, e) =>
        e.kind === AccountingEntryKind.INCOME
          ? acc + e.amountCents
          : e.kind === AccountingEntryKind.EXPENSE
            ? acc - e.amountCents
            : acc,
      0,
    );
}

function makeHarness(args: {
  encaissementCents: number;
  avoirCents: number;
}) {
  // L'écriture de recette née de l'encaissement d'origine.
  const original: Entry = {
    id: 'entry-income',
    kind: AccountingEntryKind.INCOME,
    status: AccountingEntryStatus.POSTED,
    amountCents: args.encaissementCents,
    cancelledAt: null,
  };
  const entries: Entry[] = [original];

  const tx = {
    accountingEntry: {
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const e: Entry = {
          id: 'entry-contra',
          kind: data.kind as AccountingEntryKind,
          status: data.status as AccountingEntryStatus,
          amountCents: data.amountCents as number,
          cancelledAt: null,
        };
        entries.push(e);
        return e;
      }),
      update: jest.fn(
        async ({
          where,
          data,
        }: {
          where: { id: string };
          data: Record<string, unknown>;
        }) => {
          const e = entries.find((x) => x.id === where.id);
          if (e) Object.assign(e, data);
          return e;
        },
      ),
    },
    accountingEntryLine: { create: jest.fn().mockResolvedValue({}) },
  };

  const prisma = {
    clubModule: { findUnique: jest.fn().mockResolvedValue({ enabled: true }) },
    invoice: {
      findFirst: jest.fn().mockResolvedValue({
        id: 'cn-1',
        clubId: 'club-1',
        isCreditNote: true,
        parentInvoiceId: 'inv-1',
        amountCents: args.avoirCents,
        label: 'Avoir cotisation',
        createdAt: new Date('2026-07-18T00:00:00Z'),
      }),
    },
    accountingEntry: {
      findFirst: jest.fn().mockResolvedValue({ ...original, lines: [] }),
    },
    accountingAccount: {
      findUnique: jest.fn(async ({ where }: { where: { clubId_code: { code: string } } }) => ({
        code: where.clubId_code.code,
        label: `Compte ${where.clubId_code.code}`,
        kind: 'ASSET',
      })),
    },
    $transaction: jest.fn(async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx)),
  };

  const svc = new AccountingService(
    prisma as unknown as PrismaService,
    {} as never,
    { resolveAccountCode: jest.fn().mockResolvedValue('706100') } as never,
    {} as never,
    { log: jest.fn().mockResolvedValue(undefined) } as never,
    {} as never,
    {} as never,
    {} as never,
  );

  return { svc, entries, original, tx };
}

describe('createContraEntryForCreditNote — effet sur le résultat', () => {
  it('avoir TOTAL : le résultat retombe à zéro, pas en négatif', async () => {
    const h = makeHarness({ encaissementCents: 10_000, avoirCents: 10_000 });

    await h.svc.createContraEntryForCreditNote('club-1', 'cn-1');

    // Le club a encaissé 100 € puis rendu 100 € : il n'a rien gagné, rien perdu.
    expect(resultatCents(h.entries)).toBe(0);
  });

  it('avoir PARTIEL : seul le montant de l’avoir est retranché', async () => {
    const h = makeHarness({ encaissementCents: 10_000, avoirCents: 1_000 });

    await h.svc.createContraEntryForCreditNote('club-1', 'cn-1');

    // 100 € encaissés, 10 € rendus → 90 € de produit net.
    expect(resultatCents(h.entries)).toBe(9_000);
  });

  it('n’annule JAMAIS l’écriture d’origine', async () => {
    // C'est la cause racine : l'annulation retirait du résultat une recette
    // réellement encaissée, en plus de la contre-écriture.
    const h = makeHarness({ encaissementCents: 10_000, avoirCents: 1_000 });

    await h.svc.createContraEntryForCreditNote('club-1', 'cn-1');

    expect(h.original.status).toBe(AccountingEntryStatus.POSTED);
    expect(h.original.cancelledAt).toBeNull();
    expect(h.tx.accountingEntry.update).not.toHaveBeenCalled();
  });

  it('poste une contre-écriture du montant de l’avoir, en charge', async () => {
    const h = makeHarness({ encaissementCents: 10_000, avoirCents: 2_500 });

    await h.svc.createContraEntryForCreditNote('club-1', 'cn-1');

    const contra = h.entries.find((e) => e.id === 'entry-contra');
    expect(contra).toBeDefined();
    expect(contra!.kind).toBe(AccountingEntryKind.EXPENSE);
    expect(contra!.amountCents).toBe(2_500);
    expect(contra!.status).toBe(AccountingEntryStatus.POSTED);
  });

  it('rattache la contre-écriture à l’originale pour la traçabilité', async () => {
    const h = makeHarness({ encaissementCents: 10_000, avoirCents: 1_000 });

    await h.svc.createContraEntryForCreditNote('club-1', 'cn-1');

    expect(h.tx.accountingEntry.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ contraEntryId: 'entry-income' }),
      }),
    );
  });

  it('ne fait rien si le module comptable est désactivé', async () => {
    const h = makeHarness({ encaissementCents: 10_000, avoirCents: 1_000 });
    (h.svc as unknown as { prisma: { clubModule: { findUnique: jest.Mock } } })
      .prisma.clubModule.findUnique.mockResolvedValue({ enabled: false });

    await h.svc.createContraEntryForCreditNote('club-1', 'cn-1');

    expect(h.tx.accountingEntry.create).not.toHaveBeenCalled();
  });
});
