import { AccountingSeedService } from './accounting-seed.service';
import type { PrismaService } from '../prisma/prisma.service';

/**
 * Le compte 419100 (ADR-0022) doit arriver chez les clubs dont le plan est
 * DÉJÀ seedé : le seed complète un plan existant, sans migration. Sans lui,
 * l'écriture d'une avance lèverait « compte introuvable ».
 */

const SEED = AccountingSeedService as unknown as {
  DEFAULT_ACCOUNTS: Array<{ code: string; kind: string }>;
};

type Row = { code: string; [k: string]: unknown };

function planExistantSans419100() {
  const accounts = new Map<string, Row>();
  for (const a of SEED.DEFAULT_ACCOUNTS.filter((a) => a.code !== '419100')) {
    accounts.set(a.code, { ...a });
  }
  const prisma = {
    accountingCohort: {
      findMany: jest.fn(async () => []),
      createMany: jest.fn(async ({ data }: { data: Row[] }) => ({ count: data.length })),
    },
    accountingAccount: {
      findMany: jest.fn(async () => [...accounts.values()].map((r) => ({ code: r.code }))),
      createMany: jest.fn(async ({ data }: { data: Row[] }) => {
        let count = 0;
        for (const r of data) {
          if (accounts.has(r.code)) continue;
          accounts.set(r.code, r);
          count += 1;
        }
        return { count };
      }),
    },
    accountingAccountMapping: {
      findMany: jest.fn(async () => []),
      create: jest.fn(async ({ data }: { data: unknown }) => data),
    },
    clubFinancialAccount: {
      findFirst: jest.fn(async () => ({ id: 'fin-existant' })),
      create: jest.fn(),
    },
    clubPaymentRoute: {
      findUnique: jest.fn(async () => ({ id: 'route-existante' })),
      create: jest.fn(),
      updateMany: jest.fn(async () => ({ count: 0 })),
    },
  };
  return { prisma: prisma as unknown as PrismaService, accounts };
}

describe('AccountingSeedService — compte des avances reçues', () => {
  it('ajoute 419100 au passif d’un club déjà seedé, et lui seul', async () => {
    const { prisma, accounts } = planExistantSans419100();

    const res = await new AccountingSeedService(prisma).seedIfEmpty('club-1');

    expect(accounts.get('419100')).toMatchObject({
      clubId: 'club-1',
      code: '419100',
      kind: 'LIABILITY',
    });
    expect(res.accountsCreated).toBe(1);
  });
});
