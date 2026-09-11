import { GraphQLSchemaBuilderModule, GraphQLSchemaFactory } from '@nestjs/graphql';
import { Test } from '@nestjs/testing';
import { printSchema } from 'graphql';
import '../../graphql/register-enums';
import { VolunteerAdvancesResolver } from './volunteer-advances.resolver';

/**
 * Le schéma ne se construit qu'au démarrage de l'API : un champ nullable
 * sans type explicite ou un enum non enregistré font tomber le boot (cf.
 * pitfall nestjs-graphql-nullable-needs-explicit-type).
 */
describe('VolunteerAdvancesResolver — schéma GraphQL', () => {
  it('expose soldes, reçus ouverts et remboursements (ADR-0016)', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [GraphQLSchemaBuilderModule],
    }).compile();
    const factory = moduleRef.get(GraphQLSchemaFactory);
    const sdl = printSchema(await factory.create([VolunteerAdvancesResolver]));

    expect(sdl).toContain('volunteerAdvanceBalances: [VolunteerBalanceGraph!]!');
    expect(sdl).toContain('volunteerOpenItems(memberId: ID!): [VolunteerOpenItemGraph!]!');
    expect(sdl).toContain('volunteerReimbursements(memberId: ID): [VolunteerReimbursementGraph!]!');
    expect(sdl).toContain('setAccountingEntryAdvancedBy(input: SetAdvancedByInput!): Boolean!');
    expect(sdl).toContain(
      'recordVolunteerReimbursement(input: RecordVolunteerReimbursementInput!): VolunteerReimbursementGraph!',
    );
    expect(sdl).toContain('entryIds: [ID!]!');
    expect(sdl).toContain('oldestOccurredAt: String');
    expect(sdl).toContain('items: [VolunteerReimbursementItemGraph!]!');
  });
});
