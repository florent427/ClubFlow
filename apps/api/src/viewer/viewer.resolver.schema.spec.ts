import { GraphQLSchemaBuilderModule, GraphQLSchemaFactory } from '@nestjs/graphql';
import { Test } from '@nestjs/testing';
import { printSchema } from 'graphql';
import '../graphql/register-enums';
import { ViewerResolver } from './viewer.resolver';

/**
 * Le schéma ne se construit qu'au démarrage de l'API : un type manquant ou
 * un enum non enregistré ferait tomber le boot. Ce test le construit pour le
 * résolveur viewer, qui porte les coordonnées exigées à l'adhésion.
 */
describe('ViewerResolver — schéma GraphQL', () => {
  it('se construit et expose les coordonnées obligatoires', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [GraphQLSchemaBuilderModule],
    }).compile();
    const factory = moduleRef.get(GraphQLSchemaFactory);
    const schema = await factory.create([ViewerResolver]);
    const sdl = printSchema(schema);

    expect(sdl).toContain('enum ViewerCoordinatesTarget');
    expect(sdl).toContain(
      'viewerCoordinatesStatus(cartId: ID): ViewerCoordinatesStatusGraph!',
    );
    expect(sdl).toContain(
      'viewerUpdateCoordinates(input: ViewerUpdateCoordinatesInput!): ViewerCoordinatesStatusGraph!',
    );
    const child = sdl.slice(sdl.indexOf('input ViewerRegisterChildMemberInput'));
    const childBlock = child.slice(0, child.indexOf('}'));
    for (const field of [
      'phone: String!',
      'addressLine: String!',
      'postalCode: String!',
      'city: String!',
      'birthCity: String!',
      'birthCountryCode: String!',
    ]) {
      expect(childBlock).toContain(field);
    }
    const self = sdl.slice(sdl.indexOf('input ViewerRegisterSelfAsMemberInput'));
    expect(self.slice(0, self.indexOf('}'))).toContain('birthCity: String!');
  });
});
