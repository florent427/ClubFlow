import { GraphQLSchemaBuilderModule, GraphQLSchemaFactory } from '@nestjs/graphql';
import { Test } from '@nestjs/testing';
import { printSchema } from 'graphql';
import '../../graphql/register-enums';
import { CashBookResolver } from './cash-book.resolver';

/**
 * Le schéma ne se construit qu'au démarrage de l'API : un champ nullable
 * sans type explicite ou un enum non enregistré font tomber le boot (cf.
 * pitfall nestjs-graphql-nullable-needs-explicit-type).
 */
describe('CashBookResolver — schéma GraphQL', () => {
  it('expose livre, comptages et mouvements d’espèces (ADR-0014 §8)', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [GraphQLSchemaBuilderModule],
    }).compile();
    const factory = moduleRef.get(GraphQLSchemaFactory);
    const sdl = printSchema(await factory.create([CashBookResolver]));

    expect(sdl).toContain(
      'clubCashBook(financialAccountId: ID!, from: String!, to: String!): CashBookGraph!',
    );
    expect(sdl).toContain('clubCashCounts(financialAccountId: ID): [CashCountGraph!]!');
    expect(sdl).toContain('recordCashCount(input: RecordCashCountInput!): CashCountGraph!');
    expect(sdl).toContain('validateCashCount(countId: ID!): CashCountGraph!');
    expect(sdl).toContain('deleteCashCount(countId: ID!): Boolean!');
    expect(sdl).toContain('recordCashTransfer(input: RecordCashTransferInput!): ID!');
    // L'enum des sources doit être enregistré, sinon le boot tombe.
    expect(sdl).toContain('source: AccountingEntrySource!');
    expect(sdl).toContain('counterpartCodes: [String!]!');
    expect(sdl).toContain('adjustmentEntryId: ID');
    expect(sdl).toContain('validatedAt: DateTime');
  });
});
