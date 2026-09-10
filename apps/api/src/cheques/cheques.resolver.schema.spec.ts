import { GraphQLSchemaBuilderModule, GraphQLSchemaFactory } from '@nestjs/graphql';
import { Test } from '@nestjs/testing';
import { printSchema } from 'graphql';
import '../graphql/register-enums';
import { ChequesResolver } from './cheques.resolver';

/**
 * Le schéma ne se construit qu'au démarrage de l'API : un champ nullable
 * sans type explicite ou un enum non enregistré ne casse ni le typecheck ni
 * les tests unitaires, mais fait tomber le boot (cf. pitfall
 * nestjs-graphql-nullable-needs-explicit-type).
 */
describe('ChequesResolver — schéma GraphQL', () => {
  it('se construit et expose chèques et remises (ADR-0015)', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [GraphQLSchemaBuilderModule],
    }).compile();
    const factory = moduleRef.get(GraphQLSchemaFactory);
    const schema = await factory.create([ChequesResolver]);
    const sdl = printSchema(schema);

    expect(sdl).toContain('enum ChequeStatus');
    expect(sdl).toContain('enum ChequeDepositStatus');
    expect(sdl).toContain('clubCheques(status: ChequeStatus): [ChequeGraph!]!');
    expect(sdl).toContain('clubChequeDeposits: [ChequeDepositGraph!]!');
    expect(sdl).toContain(
      'createStandaloneCheque(input: CreateStandaloneChequeInput!): ChequeGraph!',
    );
    expect(sdl).toContain('updateCheque(input: UpdateChequeInput!): ChequeGraph!');
    expect(sdl).toContain(
      'attachChequeImage(chequeId: ID!, mediaAssetId: ID!): ChequeGraph!',
    );
    expect(sdl).toContain('cancelCheque(id: ID!, reason: String!): ChequeGraph!');
    expect(sdl).toContain(
      'createChequeDeposit(input: CreateChequeDepositInput!): ChequeDepositGraph!',
    );
    expect(sdl).toContain(
      'cancelChequeDeposit(id: ID!, reason: String!): ChequeDepositGraph!',
    );
    expect(sdl).toContain(
      'generateChequeDepositSlip(id: ID!): ChequeDepositGraph!',
    );
    expect(sdl).toContain('imageUrl: String');
    expect(sdl).toContain('slipUrl: String');
  });
});
