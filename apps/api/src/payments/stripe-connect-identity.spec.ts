import { NestFactory } from '@nestjs/core';
import {
  GraphQLSchemaBuilderModule,
  GraphQLSchemaFactory,
} from '@nestjs/graphql';
import { printSchema } from 'graphql';
import type Stripe from 'stripe';
import { PrismaService } from '../prisma/prisma.service';
import { StripeConnectResolver } from './stripe-connect.resolver';
import { StripeConnectService } from './stripe-connect.service';

/**
 * Miroir de l'identité KYC du compte connecté (ADR-0008).
 *
 * En direct charges, le mandat SEPA signé par l'adhérent et le libellé de son
 * relevé bancaire portent l'identité du compte connecté, pas `Club.name`. Le
 * back-office doit pouvoir l'afficher : ces tests verrouillent le fait que
 * `applyAccountUpdated` la recopie fidèlement, y compris quand elle disparaît.
 */
describe('StripeConnectService / identité du compte connecté', () => {
  let prisma: {
    club: { findFirst: jest.Mock; update: jest.Mock };
  };
  let service: StripeConnectService;

  beforeEach(() => {
    prisma = {
      club: {
        findFirst: jest
          .fn()
          .mockResolvedValue({ id: 'club-1', stripeOnboardedAt: new Date() }),
        update: jest.fn().mockResolvedValue({ id: 'club-1' }),
      },
    };
    service = new StripeConnectService(prisma as unknown as PrismaService);
  });

  /** Compte connecté minimal, surchargeable par test. */
  function account(over: Partial<Stripe.Account> = {}): Stripe.Account {
    return {
      id: 'acct_123',
      charges_enabled: true,
      payouts_enabled: true,
      details_submitted: true,
      business_profile: { name: 'SKSR' },
      settings: { payments: { statement_descriptor: 'SKSR.RE' } },
      ...over,
    } as unknown as Stripe.Account;
  }

  it("recopie la raison sociale et le libellé de relevé dans le miroir", async () => {
    await service.applyAccountUpdated(account());

    expect(prisma.club.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          stripeBusinessName: 'SKSR',
          stripeStatementDescriptor: 'SKSR.RE',
        }),
      }),
    );
  });

  it('traite raison sociale et libellé comme deux champs distincts', async () => {
    // Constaté sur staging : « SKSR » / « SKSR.RE ». Le libellé n'est pas une
    // copie de la raison sociale — les confondre ferait afficher au trésorier
    // un libellé de relevé que sa banque ne montrera jamais.
    await service.applyAccountUpdated(account());

    const { data } = prisma.club.update.mock.calls[0][0];
    expect(data.stripeBusinessName).not.toEqual(data.stripeStatementDescriptor);
  });

  it('efface le miroir quand le club retire ces champs chez Stripe', async () => {
    // `null` et non `undefined` : avec `undefined`, Prisma ignore le champ et
    // le miroir garderait un nom qui n'existe plus côté Stripe — le back-office
    // afficherait alors une identité périmée au trésorier.
    await service.applyAccountUpdated(
      account({ business_profile: null, settings: null } as Partial<Stripe.Account>),
    );

    const { data } = prisma.club.update.mock.calls[0][0];
    expect(data.stripeBusinessName).toBeNull();
    expect(data.stripeStatementDescriptor).toBeNull();
  });

  it('ignore un compte connecté rattaché à aucun club', async () => {
    prisma.club.findFirst.mockResolvedValue(null);

    await service.applyAccountUpdated(account());

    expect(prisma.club.update).not.toHaveBeenCalled();
  });
});

/**
 * Rattrapage unique de l'identité pour les clubs connectés avant l'ajout des
 * champs. L'enjeu est le nombre d'appels Stripe : une fois, puis plus jamais.
 */
describe('StripeConnectResolver / rattrapage de l’identité', () => {
  const CLUB = { id: 'club-1' } as never;

  let prisma: { club: { findUniqueOrThrow: jest.Mock } };
  let connect: { refreshAccountStatus: jest.Mock };
  let resolver: StripeConnectResolver;

  /** État en base : compte connecté présent, identité jamais synchronisée. */
  function baseDeDonnees(over: Record<string, unknown> = {}) {
    return {
      name: 'QA Test Club',
      stripeAccountId: 'acct_123',
      stripeChargesEnabled: true,
      stripePayoutsEnabled: true,
      stripeDetailsSubmitted: true,
      stripeOnboardedAt: null,
      stripeBusinessName: null,
      stripeStatementDescriptor: null,
      stripeIdentitySyncedAt: null,
      ...over,
    };
  }

  beforeEach(() => {
    prisma = { club: { findUniqueOrThrow: jest.fn() } };
    connect = { refreshAccountStatus: jest.fn().mockResolvedValue(undefined) };
    resolver = new StripeConnectResolver(
      connect as unknown as StripeConnectService,
      prisma as unknown as PrismaService,
    );
  });

  it('interroge Stripe une fois quand l’identité n’a jamais été synchronisée', async () => {
    prisma.club.findUniqueOrThrow.mockResolvedValue(baseDeDonnees());

    await resolver.clubStripeConnectStatus(CLUB);

    expect(connect.refreshAccountStatus).toHaveBeenCalledTimes(1);
  });

  it('ne rappelle plus Stripe une fois la synchro faite, même identité vide', async () => {
    // Cœur du garde-fou : un club au KYC incomplet a une identité vide mais
    // bel et bien lue. Sans le témoin, on rappellerait Stripe à chaque
    // affichage de la page.
    prisma.club.findUniqueOrThrow.mockResolvedValue(
      baseDeDonnees({ stripeIdentitySyncedAt: new Date() }),
    );

    await resolver.clubStripeConnectStatus(CLUB);

    expect(connect.refreshAccountStatus).not.toHaveBeenCalled();
  });

  it('n’interroge pas Stripe pour un club sans compte connecté', async () => {
    prisma.club.findUniqueOrThrow.mockResolvedValue(
      baseDeDonnees({ stripeAccountId: null }),
    );

    await resolver.clubStripeConnectStatus(CLUB);

    expect(connect.refreshAccountStatus).not.toHaveBeenCalled();
  });

  it('affiche quand même la page si Stripe est injoignable', async () => {
    // Un rattrapage best-effort ne doit jamais faire tomber l'écran de
    // réglages : le tr��sorier garde l'état local et le bouton « Actualiser ».
    prisma.club.findUniqueOrThrow.mockResolvedValue(baseDeDonnees());
    connect.refreshAccountStatus.mockRejectedValue(new Error('Stripe down'));

    const status = await resolver.clubStripeConnectStatus(CLUB);

    expect(status.clubName).toBe('QA Test Club');
    expect(status.stripeAccountId).toBe('acct_123');
  });
});

/**
 * Contrat GraphQL consommé par l'admin.
 *
 * La query admin est une chaîne `gql` : renommer un champ ici compilerait des
 * deux côtés et ne casserait qu'à l'exécution, en affichant « undefined » à la
 * place de l'identité du mandat. Ce test fige les noms.
 *
 * Miroir de `STATUS_FIELDS` dans
 * `apps/admin/src/lib/stripe-connect-documents.ts`.
 */
describe('ClubStripeConnectStatusGraph / contrat exposé à l’admin', () => {
  const CHAMPS_ATTENDUS = [
    'stripeAccountId',
    'chargesEnabled',
    'payoutsEnabled',
    'detailsSubmitted',
    'onboardedAt',
    'businessName',
    'statementDescriptor',
    'clubName',
  ];

  let sdl: string;

  beforeAll(async () => {
    const app = await NestFactory.create(GraphQLSchemaBuilderModule, {
      logger: false,
    });
    await app.init();
    const schema = await app
      .get(GraphQLSchemaFactory)
      .create([StripeConnectResolver]);
    sdl = printSchema(schema);
    await app.close();
  }, 30_000);

  it.each(CHAMPS_ATTENDUS)('expose le champ %s', (champ) => {
    expect(sdl).toContain(`${champ}: `);
  });

  it('renvoie le nom du club en non-nullable', () => {
    // L'admin compare systématiquement `businessName` à `clubName` : un
    // `clubName` nullable obligerait l'UI à gérer un cas qui n'existe pas.
    expect(sdl).toContain('clubName: String!');
  });
});
