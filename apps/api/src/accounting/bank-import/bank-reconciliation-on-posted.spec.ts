import { BankReconciliationService } from './bank-reconciliation.service';
import { CategorizationLearningService } from './categorization-learning.service';

/**
 * `onEntryPosted` est la charnière du lot 3 : quel que soit l'écran d'où
 * vient la validation — l'écran de rapprochement ou la file de revue
 * comptable — c'est lui qui rapproche la ligne et enseigne la règle, dans
 * la transaction qui comptabilise l'écriture.
 */

const CLUB = 'club-1';
const CASH = '512000';

function makeWorld(over: { entryAmountCents?: number; proposedEntryId?: string | null } = {}) {
  const line = {
    id: 'l-1',
    clubId: CLUB,
    statementId: 'st-1',
    label: 'PRLV SEPA EDF FACTURE 123456',
    amountCents: -3590,
    status: 'UNMATCHED',
    ruleId: null as string | null,
    proposedEntryId:
      over.proposedEntryId === undefined ? 'entry-1' : over.proposedEntryId,
    statement: {
      id: 'st-1',
      financialAccount: { accountingAccount: { code: CASH } },
    },
  };
  const entry = {
    id: 'entry-1',
    amountCents: over.entryAmountCents ?? 3590,
    projectId: null as string | null,
    lines: [{ accountCode: '606100' }, { accountCode: CASH }],
  };
  const matches: Array<Record<string, unknown>> = [];
  const rules: Array<Record<string, unknown>> = [];
  const flagged: string[] = [];

  const tx = {
    bankStatementLine: {
      findFirst: jest.fn(async ({ where }: { where: { proposedEntryId: string } }) =>
        line.proposedEntryId === where.proposedEntryId && line.status === 'UNMATCHED'
          ? line
          : null,
      ),
      update: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
        Object.assign(line, data);
        return line;
      }),
    },
    accountingEntry: {
      findFirst: jest.fn(async ({ where }: { where: { id: string } }) =>
        where.id === entry.id ? entry : null,
      ),
    },
    bankStatementLineMatch: {
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
        matches.push(data);
        return data;
      }),
    },
    accountingEntryLine: {
      updateMany: jest.fn(async ({ where }: { where: { accountCode: string } }) => {
        flagged.push(where.accountCode);
        return { count: 1 };
      }),
    },
  };
  const prisma = {
    accountingCategorizationRule: {
      findFirst: jest.fn(async () => null),
      upsert: jest.fn(async ({ create }: { create: Record<string, unknown> }) => {
        rules.push(create);
        return create;
      }),
    },
  };
  const svc = new BankReconciliationService(
    prisma as never,
    { log: jest.fn(async () => undefined) } as never,
    new CategorizationLearningService(prisma as never),
  );
  return { svc, tx, line, matches, rules, flagged };
}

describe('BankReconciliationService.onEntryPosted', () => {
  it('rapproche la ligne qui a proposé l’écriture, pose le marqueur et apprend la règle', async () => {
    const w = makeWorld();
    const statementId = await w.svc.onEntryPosted(CLUB, 'entry-1', w.tx as never, 'user-1');

    expect(statementId).toBe('st-1');
    expect(w.matches).toHaveLength(1);
    expect(w.matches[0]).toMatchObject({
      lineId: 'l-1',
      entryId: 'entry-1',
      amountCents: 3590,
      origin: 'PROPOSAL',
      matchedByUserId: 'user-1',
    });
    // Le marqueur va sur la ligne de trésorerie, pas sur le compte de charge.
    expect(w.flagged).toEqual([CASH]);
    expect(w.line.status).toBe('MATCHED');
    expect(w.rules[0]).toMatchObject({
      pattern: 'EDF',
      direction: 'DEBIT',
      accountCode: '606100',
      source: 'LEARNED',
    });
  });

  it('montant corrigé à la validation : aucune liaison, la ligne reste à traiter', async () => {
    const w = makeWorld({ entryAmountCents: 5000 });
    const statementId = await w.svc.onEntryPosted(CLUB, 'entry-1', w.tx as never, 'user-1');

    expect(statementId).toBeNull();
    expect(w.matches).toHaveLength(0);
    expect(w.line.status).toBe('UNMATCHED');
    expect(w.rules).toHaveLength(0);
  });

  it('écriture sans ligne de relevé derrière elle : rien ne se passe', async () => {
    const w = makeWorld({ proposedEntryId: null });
    const statementId = await w.svc.onEntryPosted(CLUB, 'entry-1', w.tx as never, 'user-1');

    expect(statementId).toBeNull();
    expect(w.matches).toHaveLength(0);
    expect(w.rules).toHaveLength(0);
  });
});
