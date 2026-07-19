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
  /** Compte financier où l'encaissement d'origine est tombé. */
  compteEncaissement?: { code: string; label: string } | null;
  /** Plusieurs encaissements sur la même facture, du plus ancien au plus récent. */
  recettes?: Array<{ paymentId: string; compte: string }>;
  /** Facture jamais réglée : aucune écriture de recette. */
  sansRecette?: boolean;
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
  const lines: Array<{
    accountCode: string;
    side: string;
    creditCents: number;
    debitCents: number;
  }> = [];

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
    accountingEntryLine: {
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
        lines.push(data as never);
        return data;
      }),
    },
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
      // Applique vraiment le filtre : c'est le seul moyen de vérifier que la
      // contre-passation cible le BON encaissement quand il y en a plusieurs.
      findFirst: jest.fn(async ({ where }: { where: Record<string, unknown> }) => {
        if (args.recettes) {
          const cible = where.paymentId
            ? args.recettes.find((r) => r.paymentId === where.paymentId)
            : // Pas de paiement désigné : le code retient le plus récent.
              args.recettes[args.recettes.length - 1];
          if (!cible) return null;
          return {
            ...original,
            id: 'entry-' + cible.paymentId,
            lines: [],
            financialAccount: {
              accountingAccount: { code: cible.compte, label: cible.compte },
            },
          };
        }
        if (args.compteEncaissement === undefined && args.sansRecette) return null;
        return {
          ...original,
          lines: [],
          financialAccount:
            args.compteEncaissement === null
              ? null
              : {
                  accountingAccount: args.compteEncaissement ?? {
                    code: '512000',
                    label: 'Banque principale',
                  },
                },
        };
      }),
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
    {
      // Mapping fidèle : le produit et la banque ne sont pas le même compte,
      // et le repli du test porte précisément sur celui de la banque.
      resolveAccountCode: jest.fn(async (_c: string, key: string) =>
        key === 'BANK_ACCOUNT' ? '512000' : '706100',
      ),
    } as never,
    {} as never,
    { log: jest.fn().mockResolvedValue(undefined) } as never,
    {} as never,
    {} as never,
    {} as never,
  );

  return { svc, entries, original, tx, lines };
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

  it('crédite le compte de TRANSIT quand l’encaissement y est tombé', async () => {
    // Un encaissement Stripe atterrit sur 512300, pas sur la banque. Créditer
    // 512000 rendrait l'argent depuis un compte qui ne l'a jamais reçu, et
    // laisserait le transit débiteur du montant remboursé, indéfiniment.
    const h = makeHarness({
      encaissementCents: 10_000,
      avoirCents: 4_000,
      compteEncaissement: { code: '512300', label: 'Stripe transit' },
    });

    await h.svc.createContraEntryForCreditNote('club-1', 'cn-1');

    const credit = h.lines.find((l) => l.side === 'CREDIT');
    expect(credit?.accountCode).toBe('512300');
    expect(credit?.creditCents).toBe(4_000);
  });

  it('crédite la banque pour un encaissement tombé en banque', async () => {
    const h = makeHarness({
      encaissementCents: 10_000,
      avoirCents: 4_000,
      compteEncaissement: { code: '512000', label: 'Banque principale' },
    });

    await h.svc.createContraEntryForCreditNote('club-1', 'cn-1');

    expect(h.lines.find((l) => l.side === 'CREDIT')?.accountCode).toBe('512000');
  });

  it('retombe sur la banque quand l’écriture d’origine n’a pas de compte', async () => {
    // Encaissement antérieur au multi-comptes : mieux vaut une contrepartie
    // par défaut qu'une écriture impossible à passer.
    const h = makeHarness({
      encaissementCents: 10_000,
      avoirCents: 4_000,
      compteEncaissement: null,
    });

    await h.svc.createContraEntryForCreditNote('club-1', 'cn-1');

    expect(h.lines.find((l) => l.side === 'CREDIT')?.accountCode).toBe('512000');
  });


  it('cible l’encaissement REMBOURSÉ, pas le plus récent de la facture', async () => {
    // Facture réglée en deux fois : une échéance Stripe (transit) puis un
    // règlement en espèces (caisse). On rembourse la jambe Stripe. Retenir le
    // plus récent créditerait la caisse d'un argent que Stripe a repris sur le
    // transit — les deux comptes faux d'un coup.
    const h = makeHarness({
      encaissementCents: 10_000,
      avoirCents: 5_000,
      recettes: [
        { paymentId: 'pay-stripe', compte: '512300' },
        { paymentId: 'pay-especes', compte: '530000' },
      ],
    });

    await h.svc.createContraEntryForCreditNote('club-1', 'cn-1', 'pay-stripe');

    expect(h.lines.find((l) => l.side === 'CREDIT')?.accountCode).toBe('512300');
  });

  it('sans paiement désigné, retient le plus récent (avoir manuel)', async () => {
    const h = makeHarness({
      encaissementCents: 10_000,
      avoirCents: 5_000,
      recettes: [
        { paymentId: 'pay-1', compte: '512300' },
        { paymentId: 'pay-2', compte: '530000' },
      ],
    });

    await h.svc.createContraEntryForCreditNote('club-1', 'cn-1');

    expect(h.lines.find((l) => l.side === 'CREDIT')?.accountCode).toBe('530000');
  });

  it('facture JAMAIS RÉGLÉE : aucune écriture, pas de sortie fantôme', async () => {
    // La compta est tenue en encaissement : une facture impayée n'a pas
    // d'écriture de recette. Écrire DÉBIT produit / CRÉDIT banque inventerait
    // une sortie de trésorerie sans ligne de relevé en face, et l'écart se
    // cumulerait à chaque annulation de la saison. C'est pourtant le cas le
    // plus courant de l'avoir manuel.
    const h = makeHarness({
      encaissementCents: 10_000,
      avoirCents: 25_000,
      sansRecette: true,
    });

    await h.svc.createContraEntryForCreditNote('club-1', 'cn-1');

    expect(h.tx.accountingEntry.create).not.toHaveBeenCalled();
    expect(h.lines).toHaveLength(0);
  });

});
