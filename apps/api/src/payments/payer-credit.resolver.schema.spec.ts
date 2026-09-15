import { GraphQLSchemaBuilderModule, GraphQLSchemaFactory } from '@nestjs/graphql';
import { Test } from '@nestjs/testing';
import { printSchema } from 'graphql';
import '../graphql/register-enums';
import { PayerCreditResolver } from './payer-credit.resolver';
import { PaymentsResolver } from './payments.resolver';

/**
 * Le schéma ne se construit qu'au démarrage de l'API : un champ nullable sans
 * type explicite ou un enum non enregistré fait tomber le boot (cf. pitfall
 * nestjs-graphql-nullable-needs-explicit-type).
 */
describe('Crédit du payeur — schéma GraphQL (ADR-0022)', () => {
  it('expose le crédit, l’encaissement d’une avance et la nature des factures', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [GraphQLSchemaBuilderModule],
    }).compile();
    const factory = moduleRef.get(GraphQLSchemaFactory);
    const sdl = printSchema(
      await factory.create([PayerCreditResolver, PaymentsResolver]),
    );

    expect(sdl).toMatch(/clubPayerCredit\((memberId: ID, contactId: ID|contactId: ID, memberId: ID)\): PayerCreditGraph!/);
    expect(sdl).toContain(
      'recordPayerCreditDeposit(input: RecordPayerCreditDepositInput!): PayerCreditDepositResultGraph!',
    );
    expect(sdl).toContain('balanceCents: Int!');
    expect(sdl).toContain('purpose: InvoicePurpose!');
    expect(sdl).toContain('payerCreditMemberId: ID');
    expect(sdl).toMatch(/enum InvoicePurpose \{\s+CHARGE\s+PAYER_CREDIT_DEPOSIT\s+\}/);
  });
});
