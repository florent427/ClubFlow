import { GraphQLSchemaBuilderModule, GraphQLSchemaFactory } from '@nestjs/graphql';
import { Test } from '@nestjs/testing';
import { printSchema } from 'graphql';
import '../../graphql/register-enums';
import { MileageViewerResolver } from './mileage-viewer.resolver';
import { MileageResolver } from './mileage.resolver';

/**
 * Le schéma ne se construit qu'au démarrage de l'API : un champ nullable
 * sans type explicite fait tomber le boot (cf. pitfall
 * nestjs-graphql-nullable-needs-explicit-type).
 */
describe('Frais kilométriques — schéma GraphQL', () => {
  it('expose la revue, la saisie et les reçus fiscaux', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [GraphQLSchemaBuilderModule],
    }).compile();
    const factory = moduleRef.get(GraphQLSchemaFactory);
    const sdl = printSchema(await factory.create([MileageResolver, MileageViewerResolver]));

    expect(sdl).toContain(
      'clubMileageClaims(status: MileageClaimStatus, memberId: ID): [MileageClaimGraph!]!',
    );
    expect(sdl).toContain('approveClubMileageClaim(id: ID!): MileageClaimGraph!');
    expect(sdl).toContain('returnClubMileageClaim(id: ID!, comment: String!): MileageClaimGraph!');
    expect(sdl).toContain('rejectClubMileageClaim(id: ID!, comment: String!): MileageClaimGraph!');
    expect(sdl).toContain('cancelClubMileageClaimApproval(id: ID!): MileageClaimGraph!');
    expect(sdl).toContain(
      'createClubMileageClaim(memberId: ID!, input: MileageClaimInputGraph!): MileageClaimGraph!',
    );
    expect(sdl).toContain(
      'addClubMileageRecurringTrips(claimId: ID!, from: String!, to: String!): MileageRecurringFillGraph!',
    );
    expect(sdl).toContain('clubTaxReceiptPendingDonors(year: Int!): [TaxReceiptPendingDonorGraph!]!');
    expect(sdl).toContain('issueClubTaxReceipts(year: Int!, memberIds: [ID!]!): [TaxReceiptGraph!]!');
    expect(sdl).toContain('clubTaxReceiptPdf(id: ID!): String!');
    expect(sdl).toContain('viewerMileageClaims: [MileageClaimGraph!]!');
    expect(sdl).toContain(
      'viewerAddMileageTrip(claimId: ID!, input: MileageTripInputGraph!): MileageClaimGraph!',
    );
    expect(sdl).toContain('viewerSubmitMileageClaim(id: ID!): MileageClaimGraph!');
    expect(sdl).toContain('viewerMileageDonationAvailable: Boolean!');
    expect(sdl).toContain('viewerTaxReceiptPdf(id: ID!): String!');
    expect(sdl).toContain('fiscalHorsepower: Int');
    expect(sdl).toContain('endsOn: String');
    expect(sdl).toContain('taxReceiptOrganismType: TaxReceiptOrganismType');
    expect(sdl).toContain('weekdays: [Int!]!');
  });
});
