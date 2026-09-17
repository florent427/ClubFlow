import { GraphQLSchemaBuilderModule, GraphQLSchemaFactory } from '@nestjs/graphql';
import { Test } from '@nestjs/testing';
import { printSchema } from 'graphql';
import '../graphql/register-enums';
import { PayerCreditResolver } from './payer-credit.resolver';
import { PaymentsResolver } from './payments.resolver';
import { ViewerPayerCreditResolver } from './viewer-payer-credit.resolver';

/**
 * Le schéma ne se construit qu'au démarrage de l'API : un champ nullable sans
 * type explicite ou un enum non enregistré fait tomber le boot (cf. pitfall
 * nestjs-graphql-nullable-needs-explicit-type).
 */
describe('Crédit du payeur — schéma GraphQL (ADR-0022)', () => {
  it('expose le crédit, ses avances et ses imputations, et la nature des factures', async () => {
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
    expect(sdl).toContain('uses: [PayerCreditUseGraph!]!');
    expect(sdl).toContain('purpose: InvoicePurpose!');
    expect(sdl).toContain('payerCreditMemberId: ID');
    expect(sdl).toMatch(/enum InvoicePurpose \{\s+CHARGE\s+PAYER_CREDIT_DEPOSIT\s+\}/);
  });

  it('expose l’imputation du crédit sur une facture, et qui peut la faire', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [GraphQLSchemaBuilderModule],
    }).compile();
    const factory = moduleRef.get(GraphQLSchemaFactory);
    const sdl = printSchema(
      await factory.create([PayerCreditResolver, PaymentsResolver]),
    );

    expect(sdl).toContain(
      'clubInvoicePayerCredits(invoiceId: ID!): [PayerCreditCandidateGraph!]!',
    );
    expect(sdl).toContain(
      'applyPayerCreditToInvoice(input: ApplyPayerCreditInput!): PayerCreditApplyResultGraph!',
    );
    expect(sdl).toContain('invoiceStatus: InvoiceStatus!');
    expect(sdl).toMatch(/enum ClubPaymentMethod \{[^}]*PAYER_CREDIT[^}]*\}/);
  });

  it('expose le remboursement d’une avance hors carte (lot 4, tâche 4.2)', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [GraphQLSchemaBuilderModule],
    }).compile();
    const factory = moduleRef.get(GraphQLSchemaFactory);
    const sdl = printSchema(await factory.create([PayerCreditResolver, PaymentsResolver]));

    expect(sdl).toContain(
      'refundPayerCreditDeposit(paymentId: ID!, reason: String!, amountCents: Int): PayerCreditDepositRefundGraph!',
    );
    // Trop-perçu d'un encaissement (tâche 4.1) : qui peut le recevoir, et à qui il va.
    expect(sdl).toContain('clubInvoicePayerPeople(invoiceId: ID!): [PayerCreditCandidateGraph!]!');
    const saisie = sdl.match(/input RecordManualPaymentInput \{[^}]*\}/)?.[0] ?? '';
    expect(saisie).toContain('surplusCreditMemberId: ID');
    expect(saisie).toContain('surplusCreditContactId: ID');
    const resultat = sdl.match(/type PayerCreditDepositRefundGraph \{[^}]*\}/)?.[0] ?? '';
    for (const champ of ['refundPaymentId: ID!', 'creditNoteId: ID!', 'amountCents: Int!', 'kind: String!', 'creditBalanceCents: Int!']) {
      expect(resultat).toContain(champ);
    }
  });

  it('expose le crédit au portail et dans l’appli, et le crédit d’un foyer à l’admin (lot 3)', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [GraphQLSchemaBuilderModule],
    }).compile();
    const factory = moduleRef.get(GraphQLSchemaFactory);
    const sdl = printSchema(
      await factory.create([PayerCreditResolver, PaymentsResolver, ViewerPayerCreditResolver]),
    );

    expect(sdl).toContain('viewerPayerCredit: ViewerPayerCreditGraph!');
    expect(sdl).toMatch(
      /viewerApplyPayerCredit\(\s*invoiceId: ID!\s*("""[^"]*"""\s*)?amountCents: Int\s*\): PayerCreditApplyResultGraph!/,
    );
    expect(sdl).toMatch(/enum PayerCreditMovementKind \{\s+DEPOSIT\s+DEPOSIT_REFUND\s+USE\s+USE_RETURN\s+\}/);
    expect(sdl).toContain('clubFamilyPayerCredits(familyId: ID!): [FamilyPayerCreditGraph!]!');
    // Au portail, ni numéro de chèque ni identifiant Stripe.
    const mouvement = sdl.match(/type ViewerPayerCreditMovementGraph \{[^}]*\}/)?.[0] ?? '';
    expect(mouvement).toMatch(/method: ClubPaymentMethod\n/);
    expect(mouvement).not.toContain('externalRef');
    // « Créditer mon compte » par carte.
    expect(sdl).toContain('cardTopUpAvailable: Boolean!');
    expect(sdl).toContain(
      'viewerCreatePayerCreditCheckoutSession(amountCents: Int!, nativeApp: Boolean): ViewerCheckoutSession!',
    );
  });
});
