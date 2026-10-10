import { GraphQLSchemaBuilderModule, GraphQLSchemaFactory } from '@nestjs/graphql';
import { Test } from '@nestjs/testing';
import { printSchema } from 'graphql';
import '../../graphql/register-enums';
import { FinancialStatementsResolver } from './financial-statements.resolver';

/**
 * Le schéma ne se construit qu'au démarrage de l'API : un champ nullable
 * sans type explicite fait tomber le boot (cf. pitfall
 * nestjs-graphql-nullable-needs-explicit-type).
 */
describe('FinancialStatementsResolver — schéma GraphQL', () => {
  it('expose le bilan et le compte de résultat provisoires', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [GraphQLSchemaBuilderModule],
    }).compile();
    const factory = moduleRef.get(GraphQLSchemaFactory);
    const sdl = printSchema(await factory.create([FinancialStatementsResolver]));

    expect(sdl).toContain('clubFinancialStatements(asOf: String): FinancialStatementsGraph!');
    expect(sdl).toContain('incomeStatement: IncomeStatementGraph!');
    expect(sdl).toContain('balanceSheet: BalanceSheetGraph!');
    expect(sdl).toContain('imbalanceCents: Int!');
    expect(sdl).toContain('financialAccountsWithoutOpening: [String!]!');
    expect(sdl).toContain('lines: [StatementLineGraph!]!');
  });
});
