import { ReceiptOcrService } from './receipt-ocr.service';

/**
 * Écriture complétée par l'analyse IA d'un reçu.
 *
 * `AccountingService.validateEntryLine` passe l'écriture en POSTED quand plus
 * AUCUNE de ses lignes n'est en attente — contrepartie comprise. L'écran de
 * revue, lui, ne propose de valider que les articles : si la contrepartie
 * (caisse / banque) naissait non validée, l'écriture restait « À valider »
 * pour toujours, toutes ses lignes visibles cochées (prod, 2026-10-21).
 */
describe('ReceiptOcrService — lignes écrites après analyse', () => {
  function build() {
    const created: Array<Record<string, unknown>> = [];
    const tx = {
      accountingEntry: { update: jest.fn() },
      accountingEntryLine: {
        deleteMany: jest.fn(),
        create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
          created.push(data);
          return data;
        }),
      },
    };
    const prisma = {
      accountingAccount: {
        findMany: jest.fn(async () => [
          { code: '606800', label: 'Autres fournitures' },
          { code: '530000', label: 'Caisse' },
        ]),
      },
      $transaction: jest.fn(async (fn: (t: typeof tx) => Promise<unknown>) =>
        fn(tx),
      ),
    };
    const mapping = {
      resolveAccountCode: jest.fn(async (_clubId: string, key: string) =>
        key === 'BANK_ACCOUNT' ? '530000' : '606800',
      ),
    };
    const service = new ReceiptOcrService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
      mapping as never,
      {} as never,
      {} as never,
    );
    return { service, created };
  }

  it('valide d’office la contrepartie, laisse les articles à revoir', async () => {
    const { service, created } = build();

    await (
      service as unknown as {
        applyDecisionToEntry: (...a: unknown[]) => Promise<void>;
      }
    ).applyDecisionToEntry('club-1', 'entry-1', null, {
      totalTtcCents: 4593,
      lines: [
        {
          accountCode: '606800',
          amountCents: 4593,
          label: 'Fournitures',
          reasoning: '',
          confidencePct: 90,
          projectId: null,
          sourceLabels: [],
        },
      ],
    });

    const article = created.find((l) => l.accountCode === '606800');
    const counterpart = created.find((l) => l.accountCode === '530000');
    expect(article?.validatedAt).toBeUndefined();
    expect(counterpart?.creditCents).toBe(4593);
    expect(counterpart?.validatedAt).toBeInstanceOf(Date);
  });
});
