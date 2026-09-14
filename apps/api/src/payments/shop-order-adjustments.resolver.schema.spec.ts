import { GraphQLSchemaBuilderModule, GraphQLSchemaFactory } from '@nestjs/graphql';
import { Test } from '@nestjs/testing';
import { printSchema } from 'graphql';
import '../graphql/register-enums';
import { ShopOrderAdjustmentsResolver } from './shop-order-adjustments.resolver';

/**
 * Le schéma ne se construit qu'au démarrage de l'API : un champ nullable sans
 * type explicite ou un enum non enregistré ne casse ni le typecheck ni les
 * tests unitaires, mais fait tomber le boot en production (cf. pitfall
 * nestjs-graphql-nullable-needs-explicit-type).
 */
describe('ShopOrderAdjustmentsResolver — schéma GraphQL', () => {
  it('se construit et expose l’aperçu et l’ajustement d’une ligne (ADR-0020)', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [GraphQLSchemaBuilderModule],
    }).compile();
    const factory = moduleRef.get(GraphQLSchemaFactory);
    const schema = await factory.create([ShopOrderAdjustmentsResolver]);
    const sdl = printSchema(schema);
    const corpsDe = (entete: string) => {
      const debut = sdl.indexOf(entete);
      expect(debut).toBeGreaterThanOrEqual(0);
      const bloc = sdl.slice(debut);
      return bloc.slice(0, bloc.indexOf('}'));
    };
    const nullable = (corps: string, champ: string) => {
      expect(corps).toContain(champ);
      expect(corps).not.toContain(`${champ}!`);
    };

    expect(sdl).toContain(
      'shopOrderLineAdjustmentPreview(input: ShopOrderLineAdjustmentPreviewInput!): ShopOrderLineAdjustmentPreviewGraph!',
    );
    expect(sdl).toContain(
      'adjustShopOrderLine(input: AdjustShopOrderLineInput!): ShopOrderLineAdjustmentResultGraph!',
    );

    const entreeApercu = corpsDe('input ShopOrderLineAdjustmentPreviewInput {');
    for (const champ of [
      'orderId: ID!',
      'lineId: ID!',
      'quantity: Int!',
      'goodsReturned: Boolean = false',
      'goodsLost: Boolean = false',
    ]) {
      expect(entreeApercu).toContain(champ);
    }
    // Sans article pris : c'est une annulation d'articles.
    nullable(entreeApercu, 'newVariantId: ID');
    nullable(entreeApercu, 'newQuantity: Int');
    expect(entreeApercu).not.toContain('reason');

    // L'ajustement reprend l'aperçu, plus le motif et la signature.
    const entree = corpsDe('input AdjustShopOrderLineInput {');
    for (const champ of ['orderId: ID!', 'lineId: ID!', 'quantity: Int!', 'reason: String!']) {
      expect(entree).toContain(champ);
    }
    nullable(entree, 'newVariantId: ID');
    nullable(entree, 'signerName: String');
    nullable(entree, 'signaturePng: String');

    const apercu = corpsDe('type ShopOrderLineAdjustmentPreviewGraph {');
    for (const champ of [
      'blockers: [String!]!',
      'delivered: Boolean!',
      'exited: Boolean!',
      'signatureRequired: Boolean!',
      'removedCents: Int!',
      'addedCents: Int!',
      'differenceCents: Int!',
      'fromAwaiting: Int!',
      'releaseUnits: Int!',
      'returnUnits: Int!',
      'supplementCents: Int!',
      'refunds: [ShopOrderRefundActionGraph!]!',
      'refundCents: Int!',
      'writeOffCents: Int!',
      'invoiceVoided: Boolean!',
      'settlesOrder: Boolean!',
    ]) {
      expect(apercu).toContain(champ);
    }
    nullable(apercu, 'newItemLabel: String');
    nullable(apercu, 'newItemUnitPriceCents: Int');
    nullable(apercu, 'newItemAwaitingUnits: Int');

    const resultat = corpsDe('type ShopOrderLineAdjustmentResultGraph {');
    for (const champ of [
      'order: ShopOrderGraph!',
      'adjustmentId: ID!',
      'cardRefunds: [ShopOrderCardRefundResultGraph!]!',
      'manualRefundedCents: Int!',
      'chequesReturned: Int!',
      'writtenOffCents: Int!',
      'supplementCents: Int!',
      'signed: Boolean!',
    ]) {
      expect(resultat).toContain(champ);
    }
    nullable(resultat, 'supplementInvoiceId: ID');

    // Une part de chèque en portefeuille se reverse par virement.
    expect(corpsDe('enum ShopOrderRefundKind {')).toContain('CHEQUE_PARTIAL');
  });
});
