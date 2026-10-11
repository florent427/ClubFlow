import { GraphQLSchemaBuilderModule, GraphQLSchemaFactory } from '@nestjs/graphql';
import { Test } from '@nestjs/testing';
import { printSchema } from 'graphql';
import '../../graphql/register-enums';
import { VolunteerHoursResolver } from './volunteer-hours.resolver';

/**
 * Le schéma ne se construit qu'au démarrage de l'API : un champ nullable
 * sans type explicite fait tomber le boot (cf. pitfall
 * nestjs-graphql-nullable-needs-explicit-type).
 */
describe('VolunteerHoursResolver — schéma GraphQL', () => {
  it('expose taux horaire, heures et comptabilisations', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [GraphQLSchemaBuilderModule],
    }).compile();
    const factory = moduleRef.get(GraphQLSchemaFactory);
    const sdl = printSchema(await factory.create([VolunteerHoursResolver]));

    expect(sdl).toContain('clubVolunteerHourlyRate: Int');
    expect(sdl).toContain('setClubVolunteerHourlyRate(hourlyRateCents: Int): Int');
    expect(sdl).toContain('clubVolunteerHours(from: String, to: String): [VolunteerHoursGraph!]!');
    expect(sdl).toContain(
      'createClubVolunteerHours(input: VolunteerHoursInputGraph!): VolunteerHoursGraph!',
    );
    expect(sdl).toContain(
      'updateClubVolunteerHours(id: ID!, input: VolunteerHoursInputGraph!): VolunteerHoursGraph!',
    );
    expect(sdl).toContain('deleteClubVolunteerHours(id: ID!): Boolean!');
    expect(sdl).toContain('clubVolunteerHoursPostings: [VolunteerHoursPostingGraph!]!');
    expect(sdl).toContain(
      'postClubVolunteerHours(input: PostVolunteerHoursInput!): VolunteerHoursPostingGraph!',
    );
    expect(sdl).toContain('cancelClubVolunteerHoursPosting(id: ID!): Boolean!');
    expect(sdl).toContain(
      'clubVolunteerHoursCategories(includeArchived: Boolean): [VolunteerHoursCategoryGraph!]!',
    );
    expect(sdl).toContain(
      'createClubVolunteerHoursCategory(input: VolunteerHoursCategoryInputGraph!): VolunteerHoursCategoryGraph!',
    );
    expect(sdl).toContain(
      'updateClubVolunteerHoursCategory(id: ID!, input: VolunteerHoursCategoryInputGraph!): VolunteerHoursCategoryGraph!',
    );
    expect(sdl).toContain(
      'setClubVolunteerHoursCategoryArchived(id: ID!, archived: Boolean!): VolunteerHoursCategoryGraph!',
    );
    expect(sdl).toContain('deleteClubVolunteerHoursCategory(id: ID!): Boolean!');
    expect(sdl).toContain('categoryId: ID');
    expect(sdl).toContain('categoryLabel: String');
    expect(sdl).toContain('hourlyRateCents: Int');
    expect(sdl).toContain('postingEntryId: ID');
    expect(sdl).toContain('entryStatus: String');
  });
});
