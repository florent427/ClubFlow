import { GraphQLSchemaBuilderModule, GraphQLSchemaFactory } from '@nestjs/graphql';
import { Test } from '@nestjs/testing';
import { printSchema } from 'graphql';
import '../graphql/register-enums';
import { ShopAdminResolver, ShopViewerResolver } from './shop.resolver';

/**
 * Le schéma ne se construit qu'au démarrage de l'API : un champ nullable sans
 * type explicite ou un enum non enregistré ne casse ni le typecheck ni les
 * tests unitaires, mais fait tomber le boot en production (cf. pitfall
 * nestjs-graphql-nullable-needs-explicit-type).
 */
describe('ShopAdminResolver — schéma GraphQL', () => {
  it('se construit et expose la vente au comptoir', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [GraphQLSchemaBuilderModule],
    }).compile();
    const factory = moduleRef.get(GraphQLSchemaFactory);
    const schema = await factory.create([ShopAdminResolver]);
    const sdl = printSchema(schema);

    expect(sdl).toContain(
      'recordShopCounterSale(input: RecordShopCounterSaleInput!): ShopCounterSaleGraph!',
    );

    const entree = sdl.slice(sdl.indexOf('input RecordShopCounterSaleInput {'));
    const corps = entree.slice(0, entree.indexOf('}'));
    // Les deux acheteurs sont FACULTATIFS côté schéma : c'est le service qui
    // exige exactement l'un des deux, pour que la règle vaille sur tout
    // appelant et pas seulement sur GraphQL.
    expect(corps).toContain('memberId: ID');
    expect(corps).not.toContain('memberId: ID!');
    expect(corps).toContain('contactId: ID');
    expect(corps).toContain('lines: [PlaceShopOrderLineInput!]!');

    // La facture est rendue avec la commande : c'est sur elle que le club
    // saisit le règlement.
    const sortie = sdl.slice(sdl.indexOf('type ShopCounterSaleGraph {'));
    const corpsSortie = sortie.slice(0, sortie.indexOf('}'));
    expect(corpsSortie).toContain('orderId: ID!');
    expect(corpsSortie).toContain('invoiceId: ID!');
    expect(corpsSortie).toContain('totalCents: Int!');

    // La commande expose sa facture : c'est ce qui permet à l'écran de
    // proposer « Encaisser » et d'ouvrir la facture directement. Nullable —
    // une commande antérieure à la facturation systématique n'en a pas.
    const commande = sdl.slice(sdl.indexOf('type ShopOrderGraph {'));
    const corpsCommande = commande.slice(0, commande.indexOf('}'));
    expect(corpsCommande).toContain('invoiceId: ID');
    expect(corpsCommande).not.toContain('invoiceId: ID!');
    expect(corpsCommande).toContain('invoiceStatus: InvoiceStatus');
    expect(corpsCommande).not.toContain('invoiceStatus: InvoiceStatus!');
    expect(corpsCommande).toContain('termsAcceptedAt: DateTime');
    expect(corpsCommande).not.toContain('termsAcceptedAt: DateTime!');

    // Remise signée (ADR-0017).
    expect(sdl).toContain(
      'deliverShopOrder(input: DeliverShopOrderInput!): ShopOrderGraph!',
    );
    const remise = sdl.slice(sdl.indexOf('input DeliverShopOrderInput {'));
    const corpsRemise = remise.slice(0, remise.indexOf('}'));
    expect(corpsRemise).toContain('orderId: ID!');
    expect(corpsRemise).toContain('signerName: String!');
    expect(corpsRemise).toContain('signaturePng: String!');
    expect(corpsCommande).toContain('fulfilledAt: DateTime');
    expect(corpsCommande).toContain('deliveredAt: DateTime');
    expect(corpsCommande).toContain('deliverySignerName: String');
    // La signature ne sort JAMAIS par GraphQL : seulement dans le bon PDF.
    expect(sdl).not.toContain('deliverySignaturePng');
    // Bon de livraison : lien signé et envoi par e-mail.
    expect(sdl).toContain('createShopDeliveryNoteLink(orderId: ID!): String!');
    expect(sdl).toContain(
      'sendShopDeliveryNote(input: SendShopDeliveryNoteInput!): String!',
    );
    expect(corpsCommande).toContain('buyerEmail: String');
    expect(corpsCommande).not.toContain('buyerEmail: String!');

    // CGV (ADR-0017) : nullables — un club peut ne pas en avoir, et `null`
    // les retire.
    expect(sdl).toContain('shopTerms: ShopTermsGraph');
    expect(sdl).not.toContain('shopTerms: ShopTermsGraph!');
    expect(sdl).toContain('setShopTerms(mediaAssetId: ID): ShopTermsGraph');

    // Précommande (ADR-0018).
    const corpsDe = (entete: string) => {
      const debut = sdl.indexOf(entete);
      expect(debut).toBeGreaterThanOrEqual(0);
      const bloc = sdl.slice(debut);
      return bloc.slice(0, bloc.indexOf('}'));
    };
    expect(corpsDe('enum ShopAvailability {')).toMatch(
      /IN_STOCK[\s\S]*PREORDER[\s\S]*SOLD_OUT/,
    );
    const variante = corpsDe('type ShopProductVariantGraph {');
    expect(variante).toContain('availability: ShopAvailability!');
    expect(variante).toContain('preorderedQty: Int');
    expect(variante).not.toContain('preorderedQty: Int!');
    const produit = corpsDe('type ShopProductGraph {');
    expect(produit).toContain('preorderEnabled: Boolean!');
    expect(produit).toContain('preorderLeadTime: String');
    expect(produit).not.toContain('preorderLeadTime: String!');
    expect(corpsDe('type ShopOrderLineGraph {')).toContain(
      'awaitingStockQty: Int!',
    );
    for (const entree of [
      'input CreateShopProductInput {',
      'input UpdateShopProductInput {',
    ]) {
      const corps = corpsDe(entree);
      expect(corps).toContain('preorderEnabled: Boolean');
      expect(corps).not.toContain('preorderEnabled: Boolean!');
      expect(corps).toContain('preorderLeadTime: String');
      expect(corps).not.toContain('preorderLeadTime: String!');
    }
    expect(corpsDe('type ShopStockSweepReportGraph {')).toContain(
      'preordersServed: Int!',
    );
  });
});

describe('ShopViewerResolver — schéma GraphQL', () => {
  it('se construit et expose les CGV et leur acceptation', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [GraphQLSchemaBuilderModule],
    }).compile();
    const factory = moduleRef.get(GraphQLSchemaFactory);
    const schema = await factory.create([ShopViewerResolver]);
    const sdl = printSchema(schema);

    expect(sdl).toContain('viewerShopTerms: ShopTermsGraph');
    expect(sdl).not.toContain('viewerShopTerms: ShopTermsGraph!');

    // Argument FACULTATIF, sur les deux chemins de commande sans Stripe : une
    // version de l'application qui ne l'envoie pas reste valide pour le
    // schéma, et c'est le service qui la refuse avec un message demandant la
    // mise à jour — pas une erreur de validation GraphQL illisible.
    expect(sdl).toContain(
      'viewerCheckoutShopCartOnSite(acceptedTermsId: ID): ShopOrderGraph!',
    );
    const entree = sdl.slice(sdl.indexOf('input PlaceShopOrderInput {'));
    const corps = entree.slice(0, entree.indexOf('}'));
    expect(corps).toContain('acceptedTermsId: ID');
    expect(corps).not.toContain('acceptedTermsId: ID!');

    // Précommande (ADR-0018) : le panier dit « sur commande » et le délai.
    const ligne = sdl.slice(sdl.indexOf('type ShopCartItem {'));
    const corpsLigne = ligne.slice(0, ligne.indexOf('}'));
    expect(corpsLigne).toContain('availability: ShopAvailability!');
    expect(corpsLigne).toContain('preorderLeadTime: String');
    expect(corpsLigne).not.toContain('preorderLeadTime: String!');
  });
});
