import { GraphQLSchemaBuilderModule, GraphQLSchemaFactory } from '@nestjs/graphql';
import { Test } from '@nestjs/testing';
import { printSchema } from 'graphql';
import '../graphql/register-enums';
import { ShopOrderRefundsResolver } from './shop-order-refunds.resolver';

/**
 * Le schéma ne se construit qu'au démarrage de l'API : un champ nullable sans
 * type explicite ou un enum non enregistré ne casse ni le typecheck ni les
 * tests unitaires, mais fait tomber le boot en production.
 */
describe('ShopOrderRefundsResolver — schéma GraphQL', () => {
  it('se construit et expose l’aperçu, l’annulation remboursée et l’annulation simple', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [GraphQLSchemaBuilderModule],
    }).compile();
    const factory = moduleRef.get(GraphQLSchemaFactory);
    const schema = await factory.create([ShopOrderRefundsResolver]);
    const sdl = printSchema(schema);
    const corpsDe = (entete: string) => {
      const debut = sdl.indexOf(entete);
      expect(debut).toBeGreaterThanOrEqual(0);
      const bloc = sdl.slice(debut);
      return bloc.slice(0, bloc.indexOf('}'));
    };

    expect(sdl).toContain(
      'shopOrderCancellationPreview(orderId: ID!): ShopOrderCancellationPreviewGraph!',
    );
    expect(sdl).toContain(
      'cancelAndRefundShopOrder(input: CancelAndRefundShopOrderInput!): ShopOrderCancellationResultGraph!',
    );
    // Le geste historique de l'application mobile d'administration : même
    // signature qu'avant son déménagement.
    expect(sdl).toContain('cancelShopOrder(id: ID!): ShopOrderGraph!');

    expect(corpsDe('enum ShopOrderRefundKind {')).toMatch(
      /CARD[\s\S]*CASH[\s\S]*TRANSFER[\s\S]*CHEQUE_RETURN[\s\S]*CHEQUE_DEPOSITED/,
    );

    const entree = corpsDe('input CancelAndRefundShopOrderInput {');
    expect(entree).toContain('orderId: ID!');
    expect(entree).toContain('reason: String!');
    expect(entree).toContain('goodsReturned: Boolean = false');
    expect(entree).toContain('lostLineIds: [ID!]');
    expect(entree).not.toContain('lostLineIds: [ID!]!');

    const apercu = corpsDe('type ShopOrderCancellationPreviewGraph {');
    for (const champ of [
      'blockers: [String!]!',
      'delivered: Boolean!',
      'exited: Boolean!',
      'refunds: [ShopOrderRefundActionGraph!]!',
      'writeOffCents: Int!',
      'voidInvoice: Boolean!',
      'lines: [ShopOrderCancellationLineGraph!]!',
    ]) {
      expect(apercu).toContain(champ);
    }

    const action = corpsDe('type ShopOrderRefundActionGraph {');
    expect(action).toContain('kind: ShopOrderRefundKind!');
    expect(action).toContain('amountCents: Int!');
    expect(action).toContain('chequeNumber: String');
    expect(action).not.toContain('chequeNumber: String!');

    const ligne = corpsDe('type ShopOrderCancellationLineGraph {');
    for (const champ of ['returnUnits: Int!', 'releaseUnits: Int!', 'awaitingUnits: Int!']) {
      expect(ligne).toContain(champ);
    }

    const resultat = corpsDe('type ShopOrderCancellationResultGraph {');
    expect(resultat).toContain('order: ShopOrderGraph!');
    expect(resultat).toContain('cardRefunds: [ShopOrderCardRefundResultGraph!]!');
    expect(resultat).toContain('invoiceVoided: Boolean!');
    const carte = corpsDe('type ShopOrderCardRefundResultGraph {');
    expect(carte).toContain('ok: Boolean!');
    expect(carte).toContain('error: String');
    expect(carte).not.toContain('error: String!');

    const commande = corpsDe('type ShopOrderGraph {');
    expect(commande).toContain('cancelledAt: DateTime');
    expect(commande).not.toContain('cancelledAt: DateTime!');
    expect(commande).toContain('cancelReason: String');
    expect(commande).not.toContain('cancelReason: String!');
  });
});
