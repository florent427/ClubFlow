import { GraphQLSchemaBuilderModule, GraphQLSchemaFactory } from '@nestjs/graphql';
import { Test } from '@nestjs/testing';
import { printSchema } from 'graphql';
import '../graphql/register-enums';
import { MembershipCartAdminResolver } from './membership-cart.resolver';

/**
 * Le schéma ne se construit qu'au démarrage de l'API : un champ nullable sans
 * type explicite ou un enum non enregistré ne casse ni le typecheck ni les
 * tests unitaires, mais fait tomber le boot en production (cf. pitfall
 * nestjs-graphql-nullable-needs-explicit-type).
 */
describe('MembershipCartAdminResolver — schéma GraphQL', () => {
  it('se construit et expose la réouverture d’un panier validé', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [GraphQLSchemaBuilderModule],
    }).compile();
    const factory = moduleRef.get(GraphQLSchemaFactory);
    const schema = await factory.create([MembershipCartAdminResolver]);
    const sdl = printSchema(schema);

    expect(sdl).toContain(
      'clubReopenMembershipCart(input: ReopenMembershipCartInput!): MembershipCartGraph!',
    );

    const input = sdl.slice(sdl.indexOf('input ReopenMembershipCartInput {'));
    const body = input.slice(0, input.indexOf('}'));
    expect(body).toContain('cartId: ID!');
    // Le motif reste FACULTATIF (pas de `!`) : rouvrir avant règlement est une
    // correction ordinaire. L'imposer ferait du bruit à chaque changement de
    // rythme, alors que l'annulation, elle, doit être justifiée.
    expect(body).toContain('reason: String');
    expect(body).not.toContain('reason: String!');
  });
});
