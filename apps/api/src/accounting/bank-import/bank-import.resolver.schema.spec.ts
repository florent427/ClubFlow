import { GraphQLSchemaBuilderModule, GraphQLSchemaFactory } from '@nestjs/graphql';
import { Test } from '@nestjs/testing';
import { printSchema } from 'graphql';
import '../../graphql/register-enums';
import { BankImportResolver } from './bank-import.resolver';
import { BankTransferResolver } from './bank-transfer.resolver';

/**
 * Le schéma ne se construit qu'au démarrage de l'API : un champ nullable
 * sans type explicite, une liste de listes mal déclarée ou un enum non
 * enregistré font tomber le boot (cf. pitfall
 * nestjs-graphql-nullable-needs-explicit-type).
 */
describe('BankImportResolver — schéma GraphQL', () => {
  it('se construit et expose relevés, lignes et rapprochement (ADR-0014)', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [GraphQLSchemaBuilderModule],
    }).compile();
    const factory = moduleRef.get(GraphQLSchemaFactory);
    const schema = await factory.create([BankImportResolver]);
    const sdl = printSchema(schema);

    expect(sdl).toContain('enum BankStatementStatus');
    expect(sdl).toContain('enum BankStatementLineStatus');
    expect(sdl).toContain('clubReconciliationSummary: [ReconciliationAccountSummaryGraph!]!');
    expect(sdl).toContain('clubBankStatements(financialAccountId: ID): [BankStatementListItemGraph!]!');
    expect(sdl).toContain('clubBankStatement(id: ID!): BankStatementGraph!');
    expect(sdl).toContain('bankLineCandidates(lineId: ID!): [BankLineCandidateGraph!]!');
    expect(sdl).toContain('previewCsvStatement(input: PreviewCsvStatementInput!): CsvPreviewGraph!');
    expect(sdl).toContain('importBankStatement(input: ImportBankStatementInput!): BankStatementGraph!');
    expect(sdl).toContain('matchBankLine(input: MatchBankLineInput!): BankStatementLineGraph!');
    expect(sdl).toContain('unmatchBankLine(lineId: ID!): BankStatementLineGraph!');
    expect(sdl).toContain('ignoreBankLine(input: IgnoreBankLineInput!): BankStatementLineGraph!');
    expect(sdl).toContain('deleteBankStatement(id: ID!): Boolean!');
    expect(sdl).toContain('sampleRows: [[String!]!]!');
    expect(sdl).toContain('lines: [BankStatementLineGraph!]!');
    expect(sdl).toContain('fileUrl: String');
    // Catégorisation (lot 3) et virements d'adhérents (lot 4).
    expect(sdl).toContain('categorizeBankLine(lineId: ID!): BankStatementGraph!');
    expect(sdl).toContain('acceptBankLineProposal(input: AcceptBankLineProposalInput!): BankStatementGraph!');
    expect(sdl).toContain('clubCategorizationRules: [CategorizationRuleGraph!]!');
    expect(sdl).toContain('bankLinePayerCandidates(lineId: ID!): [BankPayerCandidateGraph!]!');
    expect(sdl).toContain('payerProposal: BankPayerCandidateGraph');
  });

  // Le résolveur des virements vit dans son propre module (pas de cycle avec
  // les paiements) mais partage le schéma : on le construit avec l'autre,
  // comme au démarrage — un schéma sans Query n'existe pas.
  it('le résolveur des virements entre dans le même schéma', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [GraphQLSchemaBuilderModule],
    }).compile();
    const factory = moduleRef.get(GraphQLSchemaFactory);
    const sdl = printSchema(await factory.create([BankImportResolver, BankTransferResolver]));
    expect(sdl).toContain(
      'acceptBankLineMemberPayment(input: AcceptBankLineMemberPaymentInput!): BankTransferResultGraph!',
    );
    expect(sdl).toContain('invoicesPaid: Int!');
    expect(sdl).toContain('stoppedBecause: String');
  });
});
