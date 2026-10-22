import { GraphQLSchemaBuilderModule, GraphQLSchemaFactory } from '@nestjs/graphql';
import { Test } from '@nestjs/testing';
import { printSchema } from 'graphql';
import '../graphql/register-enums';
import { AccountingResolver } from './accounting.resolver';

/**
 * Le schéma ne se construit qu'au démarrage de l'API : un champ nullable
 * sans type explicite ou un enum non enregistré ne casse ni le typecheck ni
 * les tests unitaires, mais fait tomber le boot en production (cf. pitfall
 * nestjs-graphql-nullable-needs-explicit-type). Ce test construit le schéma
 * du résolveur comptable et vérifie les opérations de l'exercice (lot 0 du
 * rapprochement bancaire, ADR-0014 §1).
 */
describe('AccountingResolver — schéma GraphQL', () => {
  it('se construit et expose l’exercice, les verrous et les soldes d’ouverture', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [GraphQLSchemaBuilderModule],
    }).compile();
    const factory = moduleRef.get(GraphQLSchemaFactory);
    const schema = await factory.create([AccountingResolver]);
    const sdl = printSchema(schema);

    expect(sdl).toContain(
      'clubAccountingFiscalSettings: AccountingFiscalSettingsGraph!',
    );
    expect(sdl).toContain(
      'updateClubAccountingFiscalSettings(input: UpdateAccountingFiscalSettingsInput!): AccountingFiscalSettingsGraph!',
    );
    expect(sdl).toContain(
      'setClubFinancialAccountOpeningBalance(input: SetFinancialAccountOpeningBalanceInput!): ClubFinancialAccountGraph!',
    );
    expect(sdl).toContain(
      'clubAccountingPeriodLocks: [AccountingPeriodLockGraph!]!',
    );
    expect(sdl).toContain(
      'clubAccountingFiscalYearCloses: [AccountingFiscalYearCloseGraph!]!',
    );
    expect(sdl).toContain('closeClubAccountingFiscalYear(year: Int!): Boolean!');
    expect(sdl).toContain('accountingStartsOn: String');
    expect(sdl).toContain('openingBalanceCents: Int');
    expect(sdl).toContain('openingBalanceOn: String');
  });

  it('expose la liste paginée des écritures, son total et ses filtres', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [GraphQLSchemaBuilderModule],
    }).compile();
    const factory = moduleRef.get(GraphQLSchemaFactory);
    const schema = await factory.create([AccountingResolver]);
    const sdl = printSchema(schema);

    expect(sdl).toContain(
      'clubAccountingEntriesPage(filter: AccountingEntriesFilterInput, limit: Int = 100): AccountingEntriesPageGraph!',
    );
    expect(sdl).toContain('items: [AccountingEntryGraph!]!');
    expect(sdl).toContain('totalCount: Int!');
    for (const field of [
      'from: DateTime',
      'to: DateTime',
      'kind: AccountingEntryKind',
      'status: AccountingEntryStatus',
      'source: AccountingEntrySource',
      'financialAccountId: ID',
      'allocationProjectId: ID',
      'withoutAllocationProject: Boolean',
      'accountCode: String',
      'search: String',
    ]) {
      expect(sdl).toContain(field);
    }
  });
});
