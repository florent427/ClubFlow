import { GraphQLSchemaBuilderModule, GraphQLSchemaFactory } from '@nestjs/graphql';
import { Test } from '@nestjs/testing';
import { printSchema } from 'graphql';
import '../graphql/register-enums';
import { StripeTransitResolver } from './stripe-transit.resolver';

/**
 * Le schéma ne se construit qu'au démarrage de l'API : un champ nullable
 * sans type explicite fait tomber le boot (cf. pitfall
 * nestjs-graphql-nullable-needs-explicit-type).
 */
describe('StripeTransitResolver — schéma GraphQL', () => {
  it('expose l’état du transit et sa vérification (ADR-0014, lot 8)', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [GraphQLSchemaBuilderModule],
    }).compile();
    const factory = moduleRef.get(GraphQLSchemaFactory);
    const sdl = printSchema(await factory.create([StripeTransitResolver]));

    expect(sdl).toContain('stripeTransitStatus: StripeTransitStatusGraph!');
    expect(sdl).toContain('syncStripeTransit: StripeTransitSyncReportGraph!');
    expect(sdl).toContain('lastSyncedAt: DateTime');
    expect(sdl).toContain('skipped: String');
    expect(sdl).toContain('unknownLines: Int!');
    expect(sdl).toContain('arithmeticWarnings: Int!');
  });
});
