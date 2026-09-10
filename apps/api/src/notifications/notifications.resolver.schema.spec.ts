import { GraphQLSchemaBuilderModule, GraphQLSchemaFactory } from '@nestjs/graphql';
import { Test } from '@nestjs/testing';
import { printSchema } from 'graphql';
import '../graphql/register-enums';
import { NotificationsResolver } from './notifications.resolver';

/**
 * Le schéma ne se construit qu'au démarrage de l'API : un type manquant ou
 * un enum non enregistré ferait tomber le boot (cf. pitfall
 * nestjs-graphql-union-type-explicite). Ce test le construit ici.
 */
describe('NotificationsResolver — schéma GraphQL', () => {
  it('se construit et expose les opérations attendues', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [GraphQLSchemaBuilderModule],
    }).compile();
    const factory = moduleRef.get(GraphQLSchemaFactory);
    const schema = await factory.create([NotificationsResolver]);
    const sdl = printSchema(schema);

    expect(sdl).toContain('type UserNotificationGraph');
    expect(sdl).toContain('enum UserNotificationKind');
    expect(sdl).toContain('myNotifications(limit: Int): [UserNotificationGraph!]!');
    expect(sdl).toContain('myUnreadNotificationCount: Int!');
    expect(sdl).toContain('markNotificationRead(id: ID!): Boolean!');
    expect(sdl).toContain('markAllNotificationsRead: Int!');
  });
});
