import { GraphQLSchemaBuilderModule, GraphQLSchemaFactory } from '@nestjs/graphql';
import { Test } from '@nestjs/testing';
import { printSchema } from 'graphql';
import '../graphql/register-enums';
import { ViewerResolver } from '../viewer/viewer.resolver';
import { PaymentScheduleAdminResolver } from './payment-schedule-admin.resolver';

/**
 * Le schéma ne se construit qu'au démarrage de l'API : un champ nullable sans
 * type explicite fait tomber le boot (cf. pitfall
 * nestjs-graphql-nullable-needs-explicit-type).
 */
describe('Mensualités — schéma GraphQL', () => {
  it('expose le rattrapage des mensualités et la facture couverte par un échéancier', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [GraphQLSchemaBuilderModule],
    }).compile();
    const factory = moduleRef.get(GraphQLSchemaFactory);
    const sdl = printSchema(
      await factory.create([PaymentScheduleAdminResolver, ViewerResolver]),
    );

    // L'argument documenté s'imprime sur plusieurs lignes.
    expect(sdl).toMatch(
      /createMonthlyContinuations\(\s*dryRun: Boolean!\s*("""[^]*?"""\s*)?notifyFamilies: Boolean! = false\s*\): \[MonthlyContinuationRowGraph!\]!/,
    );
    expect(sdl).toContain('notified: Boolean!');
    expect(sdl).toContain('monthlyCents: Int');
    expect(sdl).toContain('firstMonth: String');
    expect(sdl).toContain('coveredBySchedule: Boolean!');
  });
});
