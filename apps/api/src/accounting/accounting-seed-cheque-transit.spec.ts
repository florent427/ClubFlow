import { AccountingSeedService } from './accounting-seed.service';
import type { PrismaService } from '../prisma/prisma.service';

/**
 * Routage des chèques vers « Chèques à encaisser » (511200, ADR-0015).
 *
 * Même dispositif que la bascule Stripe (cf. accounting-seed-transit.spec) :
 * un club neuf route MANUAL_CHECK vers le transit chèques ; un club existant
 * dont la route pointe encore, par défaut de fabrique, sur la banque est
 * repris ; un choix délibéré du trésorier ne l'est pas. Les tests appliquent
 * réellement le filtre à des routes en mémoire.
 */

type Route = { method: string; financialAccountId: string; isDefault: boolean };

const BANK = 'fin-bank';
const STRIPE = 'fin-stripe';
const CHEQUES = 'fin-cheques';

function makeSvc(routes: Route[], withChequeTransit = true) {
  const prisma = {
    clubFinancialAccount: {
      findFirst: jest.fn(async ({ where }: { where: { kind?: string } }) => {
        if (where.kind === 'STRIPE_TRANSIT') return { id: STRIPE };
        if (where.kind === 'CHEQUE_TRANSIT') return withChequeTransit ? { id: CHEQUES } : null;
        if (where.kind === 'BANK') return { id: BANK };
        if (where.kind === 'CASH') return { id: 'fin-cash' };
        return null;
      }),
      create: jest.fn().mockResolvedValue({}),
    },
    clubPaymentRoute: {
      findUnique: jest.fn(async ({ where }: { where: { clubId_method: { method: string } } }) =>
        routes.find((r) => r.method === where.clubId_method.method) ?? null,
      ),
      create: jest.fn(async ({ data }: { data: Route }) => {
        routes.push({ ...data });
        return data;
      }),
      updateMany: jest.fn(
        async ({
          where,
          data,
        }: {
          where: { method: string; isDefault: boolean; financialAccountId: string };
          data: { financialAccountId: string };
        }) => {
          const hit = routes.filter(
            (r) =>
              r.method === where.method &&
              r.isDefault === where.isDefault &&
              r.financialAccountId === where.financialAccountId,
          );
          hit.forEach((r) => (r.financialAccountId = data.financialAccountId));
          return { count: hit.length };
        },
      ),
    },
  };
  const svc = new AccountingSeedService(prisma as unknown as PrismaService);
  return { svc, routes };
}

const seedRoutes = (svc: AccountingSeedService) =>
  (
    svc as unknown as {
      seedDefaultPaymentRoutes: (clubId: string) => Promise<number>;
    }
  ).seedDefaultPaymentRoutes('club-1');

const routeOf = (routes: Route[], method: string) =>
  routes.find((r) => r.method === method)?.financialAccountId;

describe('routage des chèques vers le compte 511200', () => {
  it('un club NEUF route les chèques vers « Chèques à encaisser », et Stripe reste sur son transit', async () => {
    const { svc, routes } = makeSvc([]);
    await seedRoutes(svc);
    expect(routeOf(routes, 'MANUAL_CHECK')).toBe(CHEQUES);
    expect(routeOf(routes, 'STRIPE_CARD')).toBe(STRIPE);
    expect(routeOf(routes, 'MANUAL_TRANSFER')).toBe(BANK);
    expect(routeOf(routes, 'MANUAL_CASH')).toBe('fin-cash');
  });

  it('un club EXISTANT dont la route chèque est encore la banque par défaut est repris', async () => {
    const { svc, routes } = makeSvc([
      { method: 'MANUAL_CHECK', financialAccountId: BANK, isDefault: true },
    ]);
    await seedRoutes(svc);
    expect(routeOf(routes, 'MANUAL_CHECK')).toBe(CHEQUES);
  });

  it('un choix DÉLIBÉRÉ du trésorier survit au seed', async () => {
    const { svc, routes } = makeSvc([
      { method: 'MANUAL_CHECK', financialAccountId: BANK, isDefault: false },
    ]);
    await seedRoutes(svc);
    expect(routeOf(routes, 'MANUAL_CHECK')).toBe(BANK);
  });

  it('une route chèque pointée ailleurs qu’en banque n’est pas touchée', async () => {
    const { svc, routes } = makeSvc([
      { method: 'MANUAL_CHECK', financialAccountId: 'fin-autre', isDefault: true },
    ]);
    await seedRoutes(svc);
    expect(routeOf(routes, 'MANUAL_CHECK')).toBe('fin-autre');
  });

  it('sans compte de transit chèques (plan incomplet), repli sur la banque plutôt que pas de route', async () => {
    const { svc, routes } = makeSvc([], false);
    await seedRoutes(svc);
    expect(routeOf(routes, 'MANUAL_CHECK')).toBe(BANK);
  });
});
