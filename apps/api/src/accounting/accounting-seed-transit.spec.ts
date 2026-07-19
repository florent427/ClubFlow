import { AccountingSeedService } from './accounting-seed.service';
import type { PrismaService } from '../prisma/prisma.service';

/**
 * Bascule des encaissements Stripe vers le compte de transit.
 *
 * Le point délicat n'est pas la création du compte — le seed est idempotent —
 * mais la reprise des clubs créés AVANT : leur route STRIPE_CARD existe déjà
 * et pointe sur la banque, or une boucle de seed ordinaire saute toute route
 * existante.
 *
 * Ces tests appliquent RÉELLEMENT la clause `where` à un jeu de routes en
 * mémoire, au lieu d'en inspecter la forme. Une première version se contentait
 * d'asserter `where.isDefault === true` : elle est restée verte alors que le
 * filtre était inerte, parce que `isDefault` valait `true` pour toutes les
 * routes en base. Vérifier la forme d'un filtre ne dit rien de ce qu'il filtre.
 */

type Route = {
  method: string;
  financialAccountId: string;
  isDefault: boolean;
};

const TRANSIT = 'fin-transit';
const BANK = 'fin-bank';

function makeSvc(routes: Route[]) {
  const prisma = {
    clubFinancialAccount: {
      findFirst: jest.fn(async ({ where }: { where: { kind?: string } }) => {
        if (where.kind === 'STRIPE_TRANSIT') return { id: TRANSIT };
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
      // Applique vraiment le filtre, pour que l'assertion porte sur l'état
      // persisté et non sur la clause.
      updateMany: jest.fn(
        async ({
          where,
          data,
        }: {
          where: {
            method: string;
            isDefault: boolean;
            financialAccountId: string;
          };
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
  return { svc, prisma, routes };
}

/** `seedDefaultPaymentRoutes` est privée : on l'atteint par son nom. */
const seedRoutes = (svc: AccountingSeedService) =>
  (
    svc as unknown as {
      seedDefaultPaymentRoutes: (clubId: string) => Promise<number>;
    }
  ).seedDefaultPaymentRoutes('club-1');

const stripeRoute = (routes: Route[]) =>
  routes.find((r) => r.method === 'STRIPE_CARD');

describe('routage des encaissements Stripe vers le transit', () => {
  it('un club NEUF encaisse sur le compte de transit', async () => {
    const { svc, routes } = makeSvc([]);

    await seedRoutes(svc);

    expect(stripeRoute(routes)?.financialAccountId).toBe(TRANSIT);
  });

  it('les autres moyens de paiement vont en banque ou en caisse', async () => {
    // Un chèque ne transite pas par Stripe : le router vers le transit
    // fausserait un compte qui ne le verra jamais arriver.
    const { svc, routes } = makeSvc([]);

    await seedRoutes(svc);

    const by = Object.fromEntries(
      routes.map((r) => [r.method, r.financialAccountId]),
    );
    expect(by.MANUAL_CASH).toBe('fin-cash');
    expect(by.MANUAL_CHECK).toBe(BANK);
    expect(by.MANUAL_TRANSFER).toBe(BANK);
  });

  it('un club EXISTANT sur la banque est basculé vers le transit', async () => {
    // Les clubs déjà en production : sans cette reprise, la bascule ne les
    // atteindrait jamais.
    const { svc, routes } = makeSvc([
      { method: 'STRIPE_CARD', financialAccountId: BANK, isDefault: true },
    ]);

    await seedRoutes(svc);

    expect(stripeRoute(routes)?.financialAccountId).toBe(TRANSIT);
  });

  it('un choix DÉLIBÉRÉ du trésorier survit au seed', async () => {
    // `isDefault: false` est posé par ClubPaymentRoutesService.upsert, donc
    // uniquement par la mutation d'administration. Le seed tourne aussi sur
    // les chemins de lecture : sans cette protection, le choix disparaîtrait
    // au rechargement de l'écran où il vient d'être fait.
    const { svc, routes } = makeSvc([
      { method: 'STRIPE_CARD', financialAccountId: BANK, isDefault: false },
    ]);

    await seedRoutes(svc);

    expect(stripeRoute(routes)?.financialAccountId).toBe(BANK);
  });

  it('une route pointée ailleurs qu’en banque n’est pas touchée', async () => {
    // On corrige un défaut de fabrique identifié — la route seedée vers la
    // banque — et rien d'autre.
    const { svc, routes } = makeSvc([
      { method: 'STRIPE_CARD', financialAccountId: 'fin-autre', isDefault: true },
    ]);

    await seedRoutes(svc);

    expect(stripeRoute(routes)?.financialAccountId).toBe('fin-autre');
  });

  it('rejouer le seed est sans effet', async () => {
    const { svc, routes, prisma } = makeSvc([
      { method: 'STRIPE_CARD', financialAccountId: BANK, isDefault: true },
    ]);

    await seedRoutes(svc);
    prisma.clubPaymentRoute.updateMany.mockClear();
    await seedRoutes(svc);

    expect(stripeRoute(routes)?.financialAccountId).toBe(TRANSIT);
    expect(prisma.clubPaymentRoute.updateMany.mock.results[0].value).resolves
      .toEqual({ count: 0 });
  });
});
