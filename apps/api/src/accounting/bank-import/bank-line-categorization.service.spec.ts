import { BadRequestException } from '@nestjs/common';
import { BankLineCategorizationService } from './bank-line-categorization.service';
import { CategorizationLearningService } from './categorization-learning.service';

/**
 * Catégorisation d'une ligne de relevé (ADR-0014 §5). Ce qui est vérifié :
 * ce qui finit en base — proposition, écriture proposée, question, règle
 * apprise — et surtout qu'une proposition douteuse ne peut pas être validée
 * en lot.
 */

const CLUB = 'club-1';
const CASH = '512000';

type LineState = {
  id: string;
  clubId: string;
  statementId: string;
  financialAccountId: string;
  lineIndex: number;
  label: string;
  amountCents: number;
  bookedOn: Date;
  status: string;
  proposedEntryId: string | null;
  aiProposalJson: unknown;
  aiQuestion: string | null;
  aiConversationJson: unknown;
  aiAttempts: number;
  aiExhausted: boolean;
  ruleId: string | null;
};

type RuleState = {
  id: string;
  clubId: string;
  pattern: string;
  matchKind: string;
  direction: string;
  accountCode: string;
  projectId: string | null;
  label: string | null;
  isActive: boolean;
  hitCount: number;
  source: string;
};

type EntryState = {
  id: string;
  clubId: string;
  kind: string;
  status: string;
  source: string;
  label: string;
  amountCents: number;
  occurredAt: Date;
  financialAccountId: string;
  projectId: string | null;
};

type EntryLineState = {
  id: string;
  entryId: string;
  accountCode: string;
  accountLabel: string;
  side: string;
  debitCents: number;
  creditCents: number;
  validatedAt: Date | null;
  iaConfidencePct: number | null;
};

interface WorldOptions {
  line?: Partial<LineState>;
  rules?: RuleState[];
  /** Une réponse par modèle configuré ; `Error` = modèle en échec. */
  answers?: Array<Record<string, unknown> | Error>;
  fallbackModel?: string | null;
  budgetAllowed?: boolean;
  statementStatus?: string;
}

function makeWorld(opts: WorldOptions = {}) {
  const line: LineState = {
    id: 'l-1',
    clubId: CLUB,
    statementId: 'st-1',
    financialAccountId: 'fa-1',
    lineIndex: 0,
    label: 'PRLV SEPA EDF FACTURE 123456',
    amountCents: -3590,
    bookedOn: new Date('2026-09-15T00:00:00.000Z'),
    status: 'UNMATCHED',
    proposedEntryId: null,
    aiProposalJson: null,
    aiQuestion: null,
    aiConversationJson: null,
    aiAttempts: 0,
    aiExhausted: false,
    ruleId: null,
    ...opts.line,
  };
  const rules: RuleState[] = [...(opts.rules ?? [])];
  const entries: EntryState[] = [];
  const entryLines: EntryLineState[] = [];
  const allocations: Array<{ lineId: string; projectId: string | null }> = [];
  const accounts = [
    { code: CASH, label: 'Banque principale', kind: 'ASSET', isActive: true },
    { code: '606100', label: 'Énergie', kind: 'EXPENSE', isActive: true },
    { code: '613200', label: 'Locations immobilières', kind: 'EXPENSE', isActive: true },
    { code: '706100', label: 'Cotisations membres', kind: 'INCOME', isActive: true },
  ];
  let seq = 0;

  const statement = {
    id: 'st-1',
    status: opts.statementStatus ?? 'READY',
    financialAccountId: 'fa-1',
    financialAccount: { label: 'Banque principale', accountingAccount: { code: CASH } },
  };

  const prisma: Record<string, unknown> = {
    bankStatementLine: {
      findFirst: jest.fn(async ({ where }: { where: { id?: string } }) =>
        where.id === line.id || where.id === undefined ? { ...line, statement } : null,
      ),
      findMany: jest.fn(async () => []),
      update: jest.fn(async ({ data }: { data: Partial<LineState> }) => {
        Object.assign(line, data);
        return line;
      }),
    },
    accountingCategorizationRule: {
      findMany: jest.fn(async () => rules.filter((r) => r.isActive)),
      findFirst: jest.fn(async ({ where }: { where: { id: string } }) =>
        rules.find((r) => r.id === where.id) ?? null,
      ),
      update: jest.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const r = rules.find((x) => x.id === where.id)!;
        if (typeof data.hitCount === 'object' && data.hitCount !== null) r.hitCount += 1;
        return r;
      }),
      upsert: jest.fn(
        async ({
          where,
          create,
          update,
        }: {
          where: { clubId_pattern_direction: { pattern: string; direction: string } };
          create: Record<string, unknown>;
          update: Record<string, unknown>;
        }) => {
          const key = where.clubId_pattern_direction;
          const existing = rules.find(
            (r) => r.pattern === key.pattern && r.direction === key.direction,
          );
          if (existing) {
            existing.accountCode = String(update.accountCode ?? existing.accountCode);
            existing.hitCount += 1;
            return existing;
          }
          const created = {
            id: `rule-${++seq}`,
            clubId: CLUB,
            pattern: String(create.pattern),
            matchKind: String(create.matchKind),
            direction: String(create.direction),
            accountCode: String(create.accountCode),
            projectId: (create.projectId as string | null) ?? null,
            label: null,
            isActive: true,
            hitCount: 1,
            source: String(create.source),
          };
          rules.push(created);
          return created;
        },
      ),
      delete: jest.fn(async () => ({})),
    },
    accountingAccount: {
      findUnique: jest.fn(async ({ where }: { where: { clubId_code: { code: string } } }) =>
        accounts.find((a) => a.code === where.clubId_code.code) ?? null,
      ),
      findMany: jest.fn(async () => accounts),
    },
    clubProject: { findMany: jest.fn(async () => []), findFirst: jest.fn(async () => null) },
    accountingEntry: {
      create: jest.fn(async ({ data }: { data: Omit<EntryState, 'id'> }) => {
        const e = { ...data, id: `entry-${++seq}` };
        entries.push(e);
        return e;
      }),
      findFirst: jest.fn(async ({ where }: { where: { id: string; status?: string } }) => {
        const e = entries.find((x) => x.id === where.id);
        if (!e) return null;
        if (where.status && e.status !== where.status) return null;
        return { ...e, lines: entryLines.filter((l) => l.entryId === e.id) };
      }),
      update: jest.fn(async ({ where, data }: { where: { id: string }; data: Partial<EntryState> }) => {
        const e = entries.find((x) => x.id === where.id)!;
        Object.assign(e, data);
        return e;
      }),
      delete: jest.fn(async ({ where }: { where: { id: string } }) => {
        const i = entries.findIndex((x) => x.id === where.id);
        entries.splice(i, 1);
        return {};
      }),
    },
    accountingEntryLine: {
      create: jest.fn(async ({ data }: { data: Partial<EntryLineState> }) => {
        // Comme la colonne : non validée par défaut.
        const l = { validatedAt: null, ...data, id: `el-${++seq}` } as EntryLineState;
        entryLines.push(l);
        return l;
      }),
      update: jest.fn(async ({ where, data }: { where: { id: string }; data: Partial<EntryLineState> }) => {
        const l = entryLines.find((x) => x.id === where.id)!;
        Object.assign(l, data);
        return l;
      }),
      updateMany: jest.fn(async ({ where, data }: { where: { entryId: string }; data: Partial<EntryLineState> }) => {
        for (const l of entryLines.filter((x) => x.entryId === where.entryId)) Object.assign(l, data);
        return { count: 1 };
      }),
    },
    accountingAllocation: {
      updateMany: jest.fn(async ({ where, data }: { where: { lineId: string }; data: { projectId: string | null } }) => {
        for (const a of allocations.filter((x) => x.lineId === where.lineId)) a.projectId = data.projectId;
        return { count: 1 };
      }),
    },
  };
  prisma.$transaction = jest.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(prisma));

  const aiSettings = {
    getDecryptedApiKey: jest.fn(async () => 'sk-test'),
    getModels: jest.fn(async () => ({
      textModel: 'model-a',
      textFallbackModel: opts.fallbackModel === undefined ? 'model-b' : opts.fallbackModel,
    })),
    logUsage: jest.fn(async (_params: { feature: string; model: string }) => undefined),
  };
  const aiBudget = {
    checkBudget: jest.fn(async () => ({ allowed: opts.budgetAllowed ?? true })),
    incrementUsage: jest.fn(async () => undefined),
  };
  let call = 0;
  const openrouter = {
    chatCompletion: jest.fn(async () => {
      const answer = (opts.answers ?? [])[call++];
      if (answer instanceof Error) throw answer;
      return {
        content: JSON.stringify(answer ?? {}),
        costCents: 1,
        inputTokens: 800,
        outputTokens: 120,
      };
    }),
  };
  const audit = { log: jest.fn(async () => undefined) };
  const allocation = {
    persistAllocationsForLine: jest.fn(
      async (_tx: unknown, lineId: string, _clubId: string, inputs: Array<{ projectId: string | null }>) => {
        allocations.push({ lineId, projectId: inputs[0].projectId });
      },
    ),
  };
  const accounting = {
    markPosted: jest.fn(async (tx: unknown, clubId: string, entryId: string) => {
      const e = entries.find((x) => x.id === entryId)!;
      e.status = 'POSTED';
      return 'st-1';
    }),
  };
  const reconciliation = { refreshStatementStatus: jest.fn(async () => undefined) };
  // Le vrai service d'apprentissage, sur le même double Prisma : ce que la
  // validation enseigne fait partie de ce qu'on vérifie.
  const learning = new CategorizationLearningService(prisma as never);
  // Virements d'adhérents (lot 4) : testés dans leur propre spec.
  const payerLookup = { autoProposal: jest.fn(async () => null) };

  const svc = new BankLineCategorizationService(
    prisma as never,
    aiSettings as never,
    aiBudget as never,
    openrouter as never,
    audit as never,
    allocation as never,
    accounting as never,
    reconciliation as never,
    learning as never,
    payerLookup as never,
  );
  return {
    svc,
    line,
    rules,
    entries,
    entryLines,
    allocations,
    openrouter,
    accounting,
    aiSettings,
    audit,
    proposal: () => svc.proposalOf(line.aiProposalJson as never),
  };
}

const clearAnswer = (code = '606100', confidencePct = 95) => ({
  accountCode: code,
  projectId: null,
  label: 'EDF — facture électricité',
  confidencePct,
  reasoning: 'Prélèvement EDF',
  question: null,
});

describe('BankLineCategorizationService — règles', () => {
  const edfRule = {
    id: 'rule-edf',
    clubId: CLUB,
    pattern: 'EDF',
    matchKind: 'CONTAINS',
    direction: 'DEBIT',
    accountCode: '606100',
    projectId: null,
    label: null,
    isActive: true,
    hitCount: 3,
    source: 'LEARNED',
  };

  it('une règle décide seule : proposition sûre, écriture proposée, aucun appel IA', async () => {
    const w = makeWorld({ rules: [edfRule] });
    const out = await w.svc.categorizeLine(CLUB, 'user-1', 'l-1');

    expect(out.status).toBe('PROPOSED');
    expect(w.openrouter.chatCompletion).not.toHaveBeenCalled();
    expect(w.proposal()).toMatchObject({
      accountCode: '606100',
      source: 'RULE',
      ruleId: 'rule-edf',
      confidencePct: 100,
      clear: true,
    });
    expect(w.entries[0]).toMatchObject({
      status: 'NEEDS_REVIEW',
      source: 'BANK_IMPORT',
      kind: 'EXPENSE',
      amountCents: 3590,
      occurredAt: new Date('2026-09-15T00:00:00.000Z'),
    });
    // Deux lignes : le compte proposé au débit, la banque au crédit, déjà
    // validée puisque le relevé la donne.
    const lines = w.entryLines;
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatchObject({ accountCode: '606100', side: 'DEBIT', debitCents: 3590, validatedAt: null });
    expect(lines[1]).toMatchObject({ accountCode: CASH, side: 'CREDIT', creditCents: 3590 });
    expect(lines[1].validatedAt).not.toBeNull();
    expect(w.line.proposedEntryId).toBe(w.entries[0].id);
  });

  it('un encaissement donne une recette, la banque au débit', async () => {
    const w = makeWorld({
      line: { label: 'VIR SEPA DUPONT COTISATION', amountCents: 25000 },
      rules: [{ ...edfRule, id: 'r-cot', pattern: 'DUPONT', direction: 'CREDIT', accountCode: '706100' }],
    });
    await w.svc.categorizeLine(CLUB, 'user-1', 'l-1');
    expect(w.entries[0]).toMatchObject({ kind: 'INCOME', amountCents: 25000 });
    expect(w.entryLines[0]).toMatchObject({ accountCode: '706100', side: 'CREDIT' });
    expect(w.entryLines[1]).toMatchObject({ accountCode: CASH, side: 'DEBIT', debitCents: 25000 });
  });

  it('une règle qui vise un compte disparu est ignorée : on repasse par l’IA', async () => {
    const w = makeWorld({
      rules: [{ ...edfRule, accountCode: '999999' }],
      answers: [clearAnswer(), clearAnswer()],
    });
    await w.svc.categorizeLine(CLUB, 'user-1', 'l-1');
    expect(w.openrouter.chatCompletion).toHaveBeenCalled();
    expect(w.proposal()?.source).toBe('AI');
  });
});

describe('BankLineCategorizationService — deux modèles', () => {
  it('deux avis concordants et sûrs : proposition claire', async () => {
    const w = makeWorld({ answers: [clearAnswer('606100', 85), clearAnswer('606100', 90)] });
    const out = await w.svc.categorizeLine(CLUB, 'user-1', 'l-1');
    expect(out.status).toBe('PROPOSED');
    expect(w.proposal()).toMatchObject({ accountCode: '606100', clear: true, source: 'AI' });
    expect(w.proposal()?.models).toEqual(['model-a', 'model-b']);
    expect(w.entries).toHaveLength(1);
  });

  it('deux avis qui désignent des comptes différents : question, aucune écriture', async () => {
    const w = makeWorld({ answers: [clearAnswer('606100', 95), clearAnswer('613200', 95)] });
    const out = await w.svc.categorizeLine(CLUB, 'user-1', 'l-1');
    expect(out.status).toBe('QUESTION');
    expect(w.entries).toHaveLength(0);
    expect(w.line.aiQuestion).toBeTruthy();
    expect(w.line.aiAttempts).toBe(1);
  });

  it('deux avis d’accord mais hésitants : question plutôt qu’une proposition tiède', async () => {
    const w = makeWorld({ answers: [clearAnswer('606100', 70), clearAnswer('606100', 95)] });
    const out = await w.svc.categorizeLine(CLUB, 'user-1', 'l-1');
    expect(out.status).toBe('QUESTION');
    expect(w.entries).toHaveLength(0);
  });

  it('un seul modèle configuré : il faut 90, 85 ne suffit pas', async () => {
    const strict = makeWorld({ fallbackModel: null, answers: [clearAnswer('606100', 85)] });
    expect((await strict.svc.categorizeLine(CLUB, 'user-1', 'l-1')).status).toBe('QUESTION');

    const ok = makeWorld({ fallbackModel: null, answers: [clearAnswer('606100', 92)] });
    expect((await ok.svc.categorizeLine(CLUB, 'user-1', 'l-1')).status).toBe('PROPOSED');
  });

  it('un modèle en échec : l’avis restant est traité comme un avis unique', async () => {
    const w = makeWorld({ answers: [clearAnswer('606100', 95), new Error('502')] });
    const out = await w.svc.categorizeLine(CLUB, 'user-1', 'l-1');
    expect(out.status).toBe('PROPOSED');
    expect(w.proposal()?.models).toEqual(['model-a']);
  });

  it('le coût est journalisé par modèle sous sa propre rubrique', async () => {
    const w = makeWorld({ answers: [clearAnswer(), clearAnswer()] });
    await w.svc.categorizeLine(CLUB, 'user-1', 'l-1');
    expect(w.aiSettings.logUsage).toHaveBeenCalledTimes(2);
    const features = w.aiSettings.logUsage.mock.calls.map((c) => c[0].feature);
    expect(features).toEqual(['BANK_LINE_CATEGORIZATION', 'BANK_LINE_CATEGORIZATION']);
  });

  it('budget IA atteint : refus explicite, rien en base', async () => {
    const w = makeWorld({ budgetAllowed: false, answers: [clearAnswer()] });
    await expect(w.svc.categorizeLine(CLUB, 'user-1', 'l-1')).rejects.toThrow(/Budget IA/);
    expect(w.openrouter.chatCompletion).not.toHaveBeenCalled();
    // En traitement de fond, on passe simplement à la suite.
    const silent = makeWorld({ budgetAllowed: false });
    expect((await silent.svc.categorizeLine(CLUB, 'user-1', 'l-1', { silent: true })).status).toBe(
      'SKIPPED',
    );
  });

  it('un relevé qui ne passe pas le contrôle n’est pas catégorisé', async () => {
    const w = makeWorld({ statementStatus: 'NEEDS_CHECK', answers: [clearAnswer()] });
    await expect(w.svc.categorizeLine(CLUB, 'user-1', 'l-1')).rejects.toThrow(/contrôle d’intégrité/);
  });
});

describe('BankLineCategorizationService — dialogue', () => {
  it('la réponse du trésorier est gardée et la réflexion relancée', async () => {
    const w = makeWorld({
      line: { aiQuestion: 'Électricité ou gaz ?', aiAttempts: 1 },
      answers: [clearAnswer(), clearAnswer()],
    });
    const out = await w.svc.answerQuestion(CLUB, 'user-1', 'l-1', 'électricité du dojo');
    expect(out.status).toBe('PROPOSED');
    const turns = w.line.aiConversationJson as Array<{ role: string; text: string }>;
    expect(turns.map((t) => t.role)).toContain('USER');
    expect(turns.some((t) => t.text === 'électricité du dojo')).toBe(true);
    expect(w.line.aiQuestion).toBeNull();
  });

  it('un clic humain rouvre une ligne abandonnée ; le traitement de fond, lui, passe son chemin', async () => {
    const w = makeWorld({ line: { aiExhausted: true, aiAttempts: 3 }, answers: [clearAnswer(), clearAnswer()] });
    expect((await w.svc.categorizeLine(CLUB, 'user-1', 'l-1', { silent: true })).status).toBe('SKIPPED');
    expect(w.openrouter.chatCompletion).not.toHaveBeenCalled();

    const out = await w.svc.categorizeLine(CLUB, 'user-1', 'l-1');
    expect(out.status).toBe('PROPOSED');
    expect(w.line.aiExhausted).toBe(false);
  });

  it('répondre sans question en attente est refusé', async () => {
    const w = makeWorld();
    await expect(w.svc.answerQuestion(CLUB, 'user-1', 'l-1', 'peu importe')).rejects.toThrow(
      BadRequestException,
    );
  });

  it('au troisième essai, la meilleure réponse est proposée mais marquée à revoir', async () => {
    const w = makeWorld({
      line: { aiAttempts: 2, aiQuestion: 'Encore ?' },
      answers: [clearAnswer('606100', 60), clearAnswer('613200', 40)],
    });
    const out = await w.svc.answerQuestion(CLUB, 'user-1', 'l-1', 'je ne sais pas');
    expect(out.status).toBe('EXHAUSTED');
    expect(w.proposal()).toMatchObject({ accountCode: '606100', clear: false });
    expect(w.line.aiExhausted).toBe(true);
    expect(w.line.aiQuestion).toBeNull();
  });
});

describe('BankLineCategorizationService — validation, rejet, apprentissage', () => {
  async function proposed(opts: WorldOptions = {}) {
    const w = makeWorld({ answers: [clearAnswer(), clearAnswer()], ...opts });
    await w.svc.categorizeLine(CLUB, 'user-1', 'l-1');
    return w;
  }

  it('valider comptabilise l’écriture par l’unique porte et apprend une règle', async () => {
    const w = await proposed();
    await w.svc.accept(CLUB, 'user-1', 'l-1');

    expect(w.accounting.markPosted).toHaveBeenCalledTimes(1);
    expect(w.entries[0].status).toBe('POSTED');
    expect(w.entryLines.every((l) => l.validatedAt !== null)).toBe(true);
    const learned = w.rules.find((r) => r.source === 'LEARNED');
    expect(learned).toMatchObject({ pattern: 'EDF', direction: 'DEBIT', accountCode: '606100' });
  });

  it('corriger le compte à la validation : c’est le compte retenu qui est appris', async () => {
    const w = await proposed();
    await w.svc.accept(CLUB, 'user-1', 'l-1', { accountCode: '613200', label: 'Loyer du dojo' });
    expect(w.entryLines[0]).toMatchObject({ accountCode: '613200', accountLabel: 'Locations immobilières' });
    expect(w.entries[0].label).toBe('Loyer du dojo');
    expect(w.rules.find((r) => r.source === 'LEARNED')?.accountCode).toBe('613200');
  });

  it('valider une proposition venue d’une règle fait progresser son compteur', async () => {
    const w = makeWorld({
      rules: [
        {
          id: 'rule-edf',
          clubId: CLUB,
          pattern: 'EDF',
          matchKind: 'CONTAINS',
          direction: 'DEBIT',
          accountCode: '606100',
          projectId: null,
          label: null,
          isActive: true,
          hitCount: 3,
          source: 'LEARNED',
        },
      ],
    });
    await w.svc.categorizeLine(CLUB, 'user-1', 'l-1');
    await w.svc.accept(CLUB, 'user-1', 'l-1');
    expect(w.rules).toHaveLength(1);
    expect(w.rules[0].hitCount).toBe(4);
  });

  it('rejeter supprime l’écriture proposée et rend la ligne au traitement manuel', async () => {
    const w = await proposed();
    await w.svc.reject(CLUB, 'user-1', 'l-1');
    expect(w.entries).toHaveLength(0);
    expect(w.line.proposedEntryId).toBeNull();
    expect(w.line.aiExhausted).toBe(true);
  });

  it('valider deux fois est refusé', async () => {
    const w = await proposed();
    await w.svc.accept(CLUB, 'user-1', 'l-1');
    await expect(w.svc.accept(CLUB, 'user-1', 'l-1')).rejects.toThrow(/déjà été traitée/);
  });
});

describe('BankLineCategorizationService — validation en lot', () => {
  it('n’accepte que les propositions sûres, même si le client en demande d’autres', async () => {
    // Proposition claire.
    const sure = makeWorld({ answers: [clearAnswer(), clearAnswer()] });
    await sure.svc.categorizeLine(CLUB, 'user-1', 'l-1');
    expect(await sure.svc.bulkAccept(CLUB, 'user-1', ['l-1'])).toEqual({ accepted: 1, skipped: 0 });
    expect(sure.entries[0].status).toBe('POSTED');

    // Proposition « à revoir » (troisième essai) : le lot doit l'écarter.
    const doubtful = makeWorld({
      line: { aiAttempts: 2 },
      answers: [clearAnswer('606100', 55), clearAnswer('613200', 50)],
    });
    await doubtful.svc.categorizeLine(CLUB, 'user-1', 'l-1');
    expect(doubtful.proposal()?.clear).toBe(false);
    expect(await doubtful.svc.bulkAccept(CLUB, 'user-1', ['l-1'])).toEqual({ accepted: 0, skipped: 1 });
    expect(doubtful.entries[0].status).toBe('NEEDS_REVIEW');
    expect(doubtful.accounting.markPosted).not.toHaveBeenCalled();
  });

  it('une ligne sans proposition, ou déjà rapprochée, est écartée sans faire échouer le lot', async () => {
    const w = makeWorld();
    expect(await w.svc.bulkAccept(CLUB, 'user-1', ['l-1', 'inconnue'])).toEqual({
      accepted: 0,
      skipped: 2,
    });
  });
});
