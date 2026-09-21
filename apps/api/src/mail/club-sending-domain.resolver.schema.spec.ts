import { GraphQLSchemaBuilderModule, GraphQLSchemaFactory } from '@nestjs/graphql';
import { Test } from '@nestjs/testing';
import { printSchema } from 'graphql';
import '../graphql/register-enums';
import { ClubSendingDomainResolver } from './club-sending-domain.resolver';

/**
 * Le schéma ne se construit qu'au démarrage de l'API : un argument enum mal
 * déclaré ne casse ni le typecheck ni les tests unitaires, mais fait tomber
 * le boot en production (cf. pitfall
 * nestjs-graphql-nullable-needs-explicit-type).
 */
describe('ClubSendingDomainResolver — schéma GraphQL', () => {
  it('se construit et expose le changement de rôle d’un domaine', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [GraphQLSchemaBuilderModule],
    }).compile();
    const factory = moduleRef.get(GraphQLSchemaFactory);
    const schema = await factory.create([ClubSendingDomainResolver]);
    const sdl = printSchema(schema);

    expect(sdl).toContain('enum ClubSendingDomainPurpose');
    expect(sdl).toContain(
      'updateClubSendingDomainPurpose(domainId: ID!, purpose: ClubSendingDomainPurpose!): ClubSendingDomainGraph!',
    );
    expect(sdl).toContain(
      'refreshClubSendingDomainVerification(domainId: ID!): ClubSendingDomainGraph!',
    );
    expect(sdl).toContain('deleteClubSendingDomain(domainId: ID!): Boolean!');
  });
});
