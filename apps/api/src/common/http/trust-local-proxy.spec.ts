import { INestApplication, UseGuards } from '@nestjs/common';
import { ApolloDriver, ApolloDriverConfig } from '@nestjs/apollo';
import { GraphQLModule, Query, Resolver } from '@nestjs/graphql';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { Throttle, ThrottlerModule } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import request from 'supertest';
import { GqlThrottlerGuard } from '../guards/gql-throttler.guard';
import { trustLocalReverseProxy } from './trust-local-proxy';

/**
 * Le throttler de `login` compte par adresse de visiteur. Derrière Caddy, cette
 * adresse n'arrive que par `X-Forwarded-For`. Ces tests montent un vrai serveur
 * GraphQL, gardé comme `AuthResolver`, et lui envoient les requêtes telles que
 * Caddy les relaie : connexion depuis 127.0.0.1, visiteur dans l'en-tête.
 */
@Resolver()
class SondeResolver {
  @Query(() => String)
  @UseGuards(GqlThrottlerGuard)
  @Throttle({ default: { limit: 2, ttl: 60_000 } })
  sonde(): string {
    return 'ok';
  }
}

async function demarrer(confianceAuProxyLocal: boolean): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({
    imports: [
      ThrottlerModule.forRoot([{ ttl: 60_000, limit: 200 }]),
      GraphQLModule.forRoot<ApolloDriverConfig>({
        driver: ApolloDriver,
        autoSchemaFile: true,
        context: ({ req, res }: { req: Request; res: Response }) => ({ req, res }),
      }),
    ],
    providers: [SondeResolver, GqlThrottlerGuard],
  }).compile();
  const app = moduleRef.createNestApplication<NestExpressApplication>({ logger: false });
  if (confianceAuProxyLocal) {
    trustLocalReverseProxy(app);
  }
  await app.init();
  return app;
}

/** Une requête relayée par Caddy : l'adresse qu'il a vue arrive en dernier. */
async function sonder(app: INestApplication, xForwardedFor: string): Promise<'passe' | 'bloquée'> {
  const res = await request(app.getHttpServer())
    .post('/graphql')
    .set('X-Forwarded-For', xForwardedFor)
    .send({ query: '{ sonde }' });
  if (res.body?.data?.sonde === 'ok') return 'passe';
  if (/Too Many Requests/.test(String(res.body?.errors?.[0]?.message))) return 'bloquée';
  throw new Error(`Réponse inattendue : ${JSON.stringify(res.body)}`);
}

describe('Adresse du visiteur derrière Caddy (limitation de débit)', () => {
  let app: INestApplication | undefined;

  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  it('chaque visiteur a son propre compteur', async () => {
    app = await demarrer(true);

    expect(await sonder(app, '203.0.113.7')).toBe('passe');
    expect(await sonder(app, '203.0.113.7')).toBe('passe');
    expect(await sonder(app, '203.0.113.7')).toBe('bloquée');
    // Le visiteur suivant n'hérite pas du blocage du premier.
    expect(await sonder(app, '198.51.100.20')).toBe('passe');
  });

  it('une adresse inventée par le client ne remet pas son compteur à zéro', async () => {
    app = await demarrer(true);

    // Le client écrit ce qu'il veut en tête de l'en-tête ; l'adresse que Caddy
    // a vue arrive en dernier.
    expect(await sonder(app, '10.0.0.1, 203.0.113.7')).toBe('passe');
    expect(await sonder(app, '10.0.0.2, 203.0.113.7')).toBe('passe');
    expect(await sonder(app, '10.0.0.3, 203.0.113.7')).toBe('bloquée');
  });

  it('sans confiance au proxy local, tous les visiteurs partagent un compteur : le défaut corrigé', async () => {
    app = await demarrer(false);

    expect(await sonder(app, '203.0.113.7')).toBe('passe');
    expect(await sonder(app, '198.51.100.20')).toBe('passe');
    expect(await sonder(app, '192.0.2.33')).toBe('bloquée');
  });
});
