import { GraphQLSchemaBuilderModule, GraphQLSchemaFactory } from '@nestjs/graphql';
import { Test } from '@nestjs/testing';
import { printSchema } from 'graphql';
import '../graphql/register-enums';
import { ShopAdminResolver } from './shop.resolver';

/**
 * Le schéma ne se construit qu'au démarrage de l'API : un champ nullable sans
 * type explicite ou un enum non enregistré ne casse ni le typecheck ni les
 * tests unitaires, mais fait tomber le boot en production (cf. pitfall
 * nestjs-graphql-nullable-needs-explicit-type).
 */
describe('ShopAdminResolver — schéma GraphQL', () => {
  it('se construit et expose la vente au comptoir', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [GraphQLSchemaBuilderModule],
    }).compile();
    const factory = moduleRef.get(GraphQLSchemaFactory);
    const schema = await factory.create([ShopAdminResolver]);
    const sdl = printSchema(schema);

    expect(sdl).toContain(
      'recordShopCounterSale(input: RecordShopCounterSaleInput!): ShopCounterSaleGraph!',
    );

    const entree = sdl.slice(sdl.indexOf('input RecordShopCounterSaleInput {'));
    const corps = entree.slice(0, entree.indexOf('}'));
    // Les deux acheteurs sont FACULTATIFS côté schéma : c'est le service qui
    // exige exactement l'un des deux, pour que la règle vaille sur tout
    // appelant et pas seulement sur GraphQL.
    expect(corps).toContain('memberId: ID');
    expect(corps).not.toContain('memberId: ID!');
    expect(corps).toContain('contactId: ID');
    expect(corps).toContain('lines: [PlaceShopOrderLineInput!]!');

    // La facture est rendue avec la commande : c'est sur elle que le club
    // saisit le règlement.
    const sortie = sdl.slice(sdl.indexOf('type ShopCounterSaleGraph {'));
    const corpsSortie = sortie.slice(0, sortie.indexOf('}'));
    expect(corpsSortie).toContain('orderId: ID!');
    expect(corpsSortie).toContain('invoiceId: ID!');
    expect(corpsSortie).toContain('totalCents: Int!');
  });
});
