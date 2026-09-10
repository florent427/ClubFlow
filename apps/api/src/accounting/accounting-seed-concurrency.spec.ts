import { Prisma } from '@prisma/client';
import { AccountingSeedService } from './accounting-seed.service';
import type { PrismaService } from '../prisma/prisma.service';

/**
 * Deux `seedIfEmpty` concurrents sur le même club.
 *
 * C'est le cas réel : l'écran Paramètres → Comptabilité lance trois requêtes
 * au montage, et chacune appelle le seed. Les deux lisent le plan AVANT que
 * l'autre n'ait inséré, voient les mêmes codes manquants, et insèrent les
 * mêmes lignes. Constaté sur staging le 2026-09-10 : le perdant levait P2002,
 * sa requête échouait, l'écran affichait « Comptes (0) ».
 *
 * Le mock reproduit la sémantique de PostgreSQL, pas la forme de l'appel :
 * un doublon sur (clubId, code) lève P2002 comme un INSERT sans ON CONFLICT,
 * sauf si `skipDuplicates` est demandé — auquel cas il est ignoré et ne
 * compte pas. Retirer `skipDuplicates: true` du service fait donc rougir le
 * test, ce qui est exactement ce qu'on lui demande.
 */

/** Les jeux de données seedés sont privés : on les atteint par leur nom. */
const SEED = AccountingSeedService as unknown as {
  DEFAULT_ACCOUNTS: unknown[];
  DEFAULT_COHORTS: unknown[];
};

function p2002(): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError(
    'Unique constraint failed on the fields: (`clubId`,`code`)',
    { code: 'P2002', clientVersion: 'test' },
  );
}

type Row = { code: string; [k: string]: unknown };

/** Table en mémoire avec contrainte unique sur `code`. */
function uniqueTable() {
  const rows = new Map<string, Row>();
  return {
    rows,
    /** Instantané pris AU MOMENT DE L'APPEL, comme un SELECT. */
    findMany: jest.fn(() => {
      const snapshot = [...rows.values()].map((r, i) => ({ id: `id-${i}`, ...r }));
      return Promise.resolve(snapshot);
    }),
    createMany: jest.fn(
      ({ data, skipDuplicates }: { data: Row[]; skipDuplicates?: boolean }) => {
        let count = 0;
        for (const r of data) {
          if (rows.has(r.code)) {
            if (skipDuplicates) continue;
            return Promise.reject(p2002());
          }
          rows.set(r.code, r);
          count += 1;
        }
        return Promise.resolve({ count });
      },
    ),
  };
}

function makePrisma() {
  const cohorts = uniqueTable();
  const accounts = uniqueTable();
  const mappingTypes = new Set<string>();
  return {
    tables: { cohorts, accounts },
    prisma: {
      accountingCohort: cohorts,
      accountingAccount: accounts,
      accountingAccountMapping: {
        findMany: jest.fn(async () => []),
        // Même contrainte réelle, que le service tolère déjà par un catch.
        create: jest.fn(async ({ data }: { data: { sourceType: string } }) => {
          if (mappingTypes.has(data.sourceType)) throw p2002();
          mappingTypes.add(data.sourceType);
          return data;
        }),
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
    } as unknown as PrismaService,
  };
}

describe('AccountingSeedService — seeds concurrents', () => {
  it('deux seedIfEmpty simultanés sur un club vide : aucun échec, aucun doublon, une seule insertion comptée', async () => {
    const { prisma, tables } = makePrisma();
    const svc = new AccountingSeedService(prisma);

    const [a, b] = await Promise.all([
      svc.seedIfEmpty('club-1'),
      svc.seedIfEmpty('club-1'),
    ]);

    expect(tables.accounts.rows.size).toBe(
      SEED.DEFAULT_ACCOUNTS.length,
    );
    expect(tables.cohorts.rows.size).toBe(
      SEED.DEFAULT_COHORTS.length,
    );
    // Les deux ont vu le plan vide et tenté les mêmes insertions : une seule
    // les a réellement faites.
    expect([a.accountsCreated, b.accountsCreated].sort()).toEqual([
      0,
      SEED.DEFAULT_ACCOUNTS.length,
    ]);
    expect(tables.accounts.createMany).toHaveBeenCalledTimes(2);
  });

  it('un seed sur un plan complet n’insère rien', async () => {
    const { prisma, tables } = makePrisma();
    const svc = new AccountingSeedService(prisma);
    await svc.seedIfEmpty('club-1');
    tables.accounts.createMany.mockClear();
    tables.cohorts.createMany.mockClear();

    const again = await svc.seedIfEmpty('club-1');

    expect(again.accountsCreated).toBe(0);
    expect(again.cohortsCreated).toBe(0);
    expect(tables.accounts.createMany).not.toHaveBeenCalled();
    expect(tables.cohorts.createMany).not.toHaveBeenCalled();
  });
});
