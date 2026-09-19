import { GraphQLSchemaBuilderModule, GraphQLSchemaFactory } from '@nestjs/graphql';
import { Test } from '@nestjs/testing';
import { printSchema } from 'graphql';
import '../graphql/register-enums';
import { PaymentsResolver } from './payments.resolver';

/**
 * Le schéma ne se construit qu'au démarrage de l'API : un champ nullable sans
 * type explicite casse le boot en prod sans casser les tests unitaires
 * (cf. pitfall nestjs-graphql-nullable-needs-explicit-type).
 */
describe('Annulation d’un encaissement — schéma GraphQL', () => {
  it('expose la mutation, et le motif sur les lignes de la facture', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [GraphQLSchemaBuilderModule],
    }).compile();
    const factory = moduleRef.get(GraphQLSchemaFactory);
    const sdl = printSchema(await factory.create([PaymentsResolver]));

    expect(sdl).toContain(
      'cancelClubManualPayment(paymentId: ID!, reason: String!): PaymentGraph!',
    );
    const graph = sdl.slice(sdl.indexOf('type InvoicePaymentGraph {'));
    const body = graph.slice(0, graph.indexOf('}'));
    // Nullable : un remboursement ou un encaissement n'a pas de motif.
    expect(body).toContain('cancellationReason: String\n');
    expect(body).not.toContain('cancellationReason: String!');
  });
});
