import { GraphQLSchemaBuilderModule, GraphQLSchemaFactory } from '@nestjs/graphql';
import { Test } from '@nestjs/testing';
import { printSchema } from 'graphql';
import { PushResolver } from './push.resolver';

/**
 * Ce que ce test protège : le schéma GraphQL se construit au démarrage de
 * l'API. Un champ dont NestJS ne peut pas déduire le type (union
 * `string | null` sans `() => String`) ne casse ni le typecheck ni les
 * tests unitaires — il casse le boot en production. C'est arrivé au
 * déploiement e42a991 : API staging en boucle de redémarrage.
 */
describe('PushResolver — schéma GraphQL', () => {
  it('se construit et expose les opérations attendues', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [GraphQLSchemaBuilderModule],
    }).compile();
    const factory = moduleRef.get(GraphQLSchemaFactory);
    const schema = await factory.create([PushResolver]);
    const sdl = printSchema(schema);

    expect(sdl).toContain('input RegisterPushSubscriptionInput');
    expect(sdl).toContain('userAgent: String');
    expect(sdl).toContain('pushVapidPublicKey: String');
    expect(sdl).toContain('registerPushSubscription(input: RegisterPushSubscriptionInput!): Boolean!');
    expect(sdl).toContain('unregisterPushSubscription(endpoint: String!): Boolean!');
    expect(sdl).toContain('sendMyPushTest: Boolean!');
  });
});
