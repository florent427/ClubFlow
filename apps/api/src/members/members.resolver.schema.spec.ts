import { GraphQLSchemaBuilderModule, GraphQLSchemaFactory } from '@nestjs/graphql';
import { Test } from '@nestjs/testing';
import { printSchema } from 'graphql';
import '../graphql/register-enums';
import { MembersResolver } from './members.resolver';

/**
 * Le schéma ne se construit qu'au démarrage de l'API : un type manquant ou
 * un enum non enregistré ferait tomber le boot (cf. pitfall
 * nestjs-graphql-union-type-explicite). Ce test le construit ici pour le
 * résolveur membres, qui porte les groupes dynamiques.
 */
describe('MembersResolver — schéma GraphQL', () => {
  it('se construit et expose la gestion des membres d’un groupe', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [GraphQLSchemaBuilderModule],
    }).compile();
    const factory = moduleRef.get(GraphQLSchemaFactory);
    const schema = await factory.create([MembersResolver]);
    const sdl = printSchema(schema);

    expect(sdl).toContain('manuallyAssignedCount: Int!');
    expect(sdl).toContain('enum DynamicGroupMemberSource');
    expect(sdl).toContain(
      'dynamicGroupMembers(dynamicGroupId: ID!): [DynamicGroupMemberGraph!]!',
    );
    expect(sdl).toContain(
      'addMembersToDynamicGroup(input: AddMembersToDynamicGroupInput!): Int!',
    );
    expect(sdl).toContain(
      'removeMemberFromDynamicGroup(input: RemoveMemberFromDynamicGroupInput!): Boolean!',
    );
  });
});
