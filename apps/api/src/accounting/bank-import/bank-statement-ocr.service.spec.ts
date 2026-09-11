import { BadRequestException } from '@nestjs/common';
import { BankStatementOcrService } from './bank-statement-ocr.service';
import type { StatementReading } from './merge-readings';

/**
 * Lecture d'un relevé PDF par deux modèles : doubles pour la base, OpenRouter
 * et le rendu des pages. Ce qui est vérifié : ce qui finit en base (statut,
 * lignes, divergences, coût), et que le contrôle d'intégrité juge — pas
 * l'accord des modèles.
 */

const MODEL_A = 'anthropic/claude-sonnet-4-5';
const MODEL_B = 'google/gemini-2.5-flash';

const READING_OK: StatementReading = {
  iban: null,
  periodStart: '2026-09-01',
  periodEnd: '2026-09-30',
  openingBalanceCents: 123456,
  closingBalanceCents: 132866,
  lines: [
    { bookedOn: '2026-09-05', valueOn: null, label: 'VIR SEPA DUPONT JEAN', amountCents: 25000, balanceAfterCents: null },
    { bookedOn: '2026-09-10', valueOn: null, label: 'ANNULATION REMISE CHQ', amountCents: -12000, balanceAfterCents: null },
    { bookedOn: '2026-09-15', valueOn: null, label: 'PRLV SEPA EDF', amountCents: -3590, balanceAfterCents: null },
  ],
};

type Answer = StatementReading | Error;

function build(answers: { a: Answer; b: Answer }, opts: { budgetAllowed?: boolean; overlap?: boolean } = {}) {
  const statement = {
    id: 'st-1',
    status: 'PARSING',
    format: 'PDF',
    mediaAssetId: 'asset-1',
    financialAccountId: 'fa-1',
    financialAccount: { openingBalanceCents: 123456 },
    club: { accountingStartsOn: new Date('2026-09-01T00:00:00.000Z') },
  };
  const updates: Array<Record<string, unknown>> = [];
  const created: Array<Record<string, unknown>> = [];
  let deleted = 0;
  const prisma: Record<string, unknown> = {
    bankStatement: {
      findFirst: jest.fn(async ({ where }: { where: Record<string, unknown> }) => {
        if (where.id === 'st-1') return statement;
        if ('periodStart' in where) {
          return opts.overlap
            ? { periodStart: new Date('2026-09-01T00:00:00.000Z'), periodEnd: new Date('2026-09-30T00:00:00.000Z') }
            : null;
        }
        return null; // pas de relevé précédent : chaînage sur le solde d'ouverture
      }),
      update: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
        updates.push(data);
        return { ...statement, ...data };
      }),
    },
    bankStatementLine: {
      deleteMany: jest.fn(async () => {
        deleted++;
        return { count: 0 };
      }),
      createMany: jest.fn(async ({ data }: { data: Array<Record<string, unknown>> }) => {
        created.push(...data);
        return { count: data.length };
      }),
    },
  };
  prisma.$transaction = jest.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(prisma));

  const aiSettings = {
    getDecryptedApiKey: jest.fn(async () => 'sk-test'),
    getModels: jest.fn(async () => ({ textModel: MODEL_A, textFallbackModel: null })),
    logUsage: jest.fn(async (_params: { feature: string; model: string }) => undefined),
  };
  const aiBudget = {
    checkBudget: jest.fn(async () => ({ allowed: opts.budgetAllowed ?? true })),
    incrementUsage: jest.fn(async () => undefined),
  };
  const openrouter = {
    chatCompletion: jest.fn(async ({ model }: { model: string }) => {
      const answer = model === MODEL_A ? answers.a : answers.b;
      if (answer instanceof Error) throw answer;
      return { content: JSON.stringify(answer), costCents: 3, inputTokens: 1000, outputTokens: 200 };
    }),
  };
  const media = {
    // Comme le vrai : un fichier privé n'est servi qu'avec le club
    // propriétaire, sinon « introuvable » (constaté sur staging, 2026-09-11).
    streamFor: jest.fn(async (_assetId: string, opts?: { clubId?: string | null }) => {
      if (opts?.clubId !== 'club-1') throw new Error('Asset introuvable');
      return {
        stream: (async function* () {
          yield Buffer.from('%PDF-1.4 fake');
        })(),
      };
    }),
  };
  const audit = { log: jest.fn(async () => undefined) };
  const reconciliation = { autoMatch: jest.fn(async () => undefined) };
  const renderer = {
    render: jest.fn(async () => [{ page: 1, dataUrls: ['data:image/png;base64,AAAA'], text: 'ANCIEN SOLDE' }]),
  };
  const svc = new BankStatementOcrService(
    prisma as never,
    aiSettings as never,
    aiBudget as never,
    openrouter as never,
    media as never,
    audit as never,
    reconciliation as never,
    renderer as never,
  );
  const last = () => updates[updates.length - 1];
  return { svc, updates, created, last, deletedCalls: () => deleted, aiSettings, aiBudget, openrouter, audit, reconciliation };
}

describe('BankStatementOcrService.assertCanRead', () => {
  it('budget IA atteint : refus propre avant toute écriture', async () => {
    const { svc } = build({ a: READING_OK, b: READING_OK }, { budgetAllowed: false });
    await expect(svc.assertCanRead('club-1')).rejects.toThrow(BadRequestException);
    await expect(svc.assertCanRead('club-1')).rejects.toThrow(/Budget IA/);
  });

  it('clé absente : le message renvoie vers OFX/CSV', async () => {
    const { svc, aiSettings } = build({ a: READING_OK, b: READING_OK });
    aiSettings.getDecryptedApiKey.mockRejectedValueOnce(new BadRequestException('Clé API OpenRouter non configurée.'));
    await expect(svc.assertCanRead('club-1')).rejects.toThrow(/OFX ou en CSV/);
  });

  it('modèle B d’une autre famille que A', async () => {
    const { svc } = build({ a: READING_OK, b: READING_OK });
    const setup = await svc.assertCanRead('club-1');
    expect(setup.modelA).toBe(MODEL_A);
    expect(setup.modelB).toBe(MODEL_B);
  });
});

describe('BankStatementOcrService.runReading', () => {
  it('deux lectures d’accord, arithmétique et chaînage justes : READY, lignes d’accord, coût journalisé, rapprochement lancé', async () => {
    const t = build({ a: READING_OK, b: READING_OK });
    await t.svc.runReading('club-1', 'user-1', 'st-1');
    const data = t.last();
    expect(data.status).toBe('READY');
    expect(data.integrityDeltaCents).toBe(0);
    expect(data.chainOk).toBe(true);
    expect(data.lineCount).toBe(3);
    expect(data.readingModelA).toBe(MODEL_A);
    expect(data.readingModelB).toBe(MODEL_B);
    expect(data.aiCostCents).toBe(6);
    expect(t.created).toHaveLength(3);
    expect(t.created.every((l) => l.readingAgreement === true)).toBe(true);
    expect(t.aiSettings.logUsage).toHaveBeenCalledTimes(2);
    expect(t.aiSettings.logUsage.mock.calls.map((c) => c[0].feature)).toEqual([
      'BANK_STATEMENT_OCR',
      'BANK_STATEMENT_OCR',
    ]);
    expect(t.aiBudget.incrementUsage).toHaveBeenCalledWith('club-1', 'BANK_STATEMENT_OCR', 6, 2000, 400);
    expect(t.reconciliation.autoMatch).toHaveBeenCalledWith('club-1', 'st-1');
  });

  it('les deux lectures d’accord mais l’arithmétique fausse : NEEDS_CHECK, pas de rapprochement — l’accord ne fait pas foi', async () => {
    const wrong = { ...READING_OK, closingBalanceCents: 140000 };
    const t = build({ a: wrong, b: wrong });
    await t.svc.runReading('club-1', 'user-1', 'st-1');
    expect(t.last().status).toBe('NEEDS_CHECK');
    expect(t.last().integrityDeltaCents).toBe(123456 + 25000 - 12000 - 3590 - 140000);
    expect(t.reconciliation.autoMatch).not.toHaveBeenCalled();
  });

  it('une date lue différemment : arithmétique juste mais NEEDS_CHECK, divergence persistée sur la ligne', async () => {
    const b: StatementReading = {
      ...READING_OK,
      lines: READING_OK.lines.map((l, i) => (i === 0 ? { ...l, bookedOn: '2026-09-06' } : l)),
    };
    const t = build({ a: READING_OK, b });
    await t.svc.runReading('club-1', 'user-1', 'st-1');
    expect(t.last().integrityDeltaCents).toBe(0);
    expect(t.last().status).toBe('NEEDS_CHECK');
    const divergent = t.created.filter((l) => l.readingAgreement === false);
    expect(divergent).toHaveLength(1);
    expect(divergent[0].divergenceJson).toMatchObject({ kind: 'DATE', b: { bookedOn: '2026-09-06' } });
    expect(t.reconciliation.autoMatch).not.toHaveBeenCalled();
  });

  it('un modèle en échec : la lecture restante suffit, avertissement conservé, un seul coût', async () => {
    const t = build({ a: READING_OK, b: new Error('502 upstream') });
    await t.svc.runReading('club-1', 'user-1', 'st-1');
    expect(t.last().status).toBe('READY');
    expect(t.last().readingBJson).not.toEqual(expect.objectContaining({ lines: expect.anything() }));
    expect(String(t.last().error)).toMatch(/502 upstream/);
    expect(String(t.last().error)).toMatch(/Une seule lecture/);
    expect(t.aiSettings.logUsage).toHaveBeenCalledTimes(1);
  });

  it('les deux modèles en échec : FAILED avec le message, aucune ligne', async () => {
    const t = build({ a: new Error('timeout'), b: new Error('quota') });
    await t.svc.runReading('club-1', 'user-1', 'st-1');
    expect(t.last().status).toBe('FAILED');
    expect(String(t.last().error)).toMatch(/timeout/);
    expect(String(t.last().error)).toMatch(/quota/);
    expect(t.created).toHaveLength(0);
  });

  it('période déjà couverte par un autre relevé : FAILED, rien d’écrit en lignes', async () => {
    const t = build({ a: READING_OK, b: READING_OK }, { overlap: true });
    await t.svc.runReading('club-1', 'user-1', 'st-1');
    expect(t.last().status).toBe('FAILED');
    expect(String(t.last().error)).toMatch(/chevauche/);
    expect(t.created).toHaveLength(0);
  });

  it('budget atteint au moment de la lecture : FAILED avec le message, aucun appel modèle', async () => {
    const t = build({ a: READING_OK, b: READING_OK }, { budgetAllowed: false });
    await t.svc.runReading('club-1', 'user-1', 'st-1');
    expect(t.last().status).toBe('FAILED');
    expect(String(t.last().error)).toMatch(/Budget IA/);
    expect(t.openrouter.chatCompletion).not.toHaveBeenCalled();
  });
});
