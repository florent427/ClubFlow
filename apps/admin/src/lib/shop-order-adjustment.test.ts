import { describe, expect, it } from 'vitest';
import {
  activeQty,
  adjustFormError,
  adjustmentGoodsLines,
  adjustmentHistoryLabel,
  adjustmentMoneyLines,
  adjustmentToast,
  exchangeChoiceLabel,
  exchangeChoices,
} from './shop-order-adjustment';
import type {
  ShopOrder,
  ShopOrderAdjustment,
  ShopOrderLineAdjustmentPreview,
  ShopOrderLineAdjustmentResult,
  ShopProduct,
  ShopProductVariant,
} from './types';

const PREVIEW = (
  over: Partial<ShopOrderLineAdjustmentPreview> = {},
): ShopOrderLineAdjustmentPreview => ({
  blockers: [],
  delivered: false,
  exited: true,
  signatureRequired: false,
  removedCents: 2000,
  addedCents: 0,
  differenceCents: -2000,
  fromAwaiting: 0,
  releaseUnits: 0,
  returnUnits: 0,
  newItemLabel: null,
  newItemUnitPriceCents: null,
  newItemAwaitingUnits: null,
  supplementCents: 0,
  refunds: [],
  refundCents: 0,
  writeOffCents: 0,
  invoiceVoided: false,
  settlesOrder: false,
  ...over,
});

const RESULT = (
  over: Partial<ShopOrderLineAdjustmentResult> = {},
): ShopOrderLineAdjustmentResult => ({
  order: {} as ShopOrder,
  adjustmentId: 'adj-1',
  cardRefunds: [],
  manualRefundedCents: 0,
  chequesReturned: 0,
  writtenOffCents: 0,
  supplementInvoiceId: null,
  supplementCents: 0,
  signed: false,
  ...over,
});

const ADJ = (over: Partial<ShopOrderAdjustment> = {}): ShopOrderAdjustment => ({
  id: 'adj-1',
  kind: 'EXCHANGE',
  createdAt: '2026-09-14T10:00:00.000Z',
  reason: 'Taille',
  returnedLabel: 'T-shirt — L',
  returnedQty: 1,
  newLabel: 'Kimono — 140',
  newQty: 1,
  differenceCents: 1500,
  refundedCents: 0,
  writtenOffCents: 0,
  supplementInvoiceId: 'inv-sup',
  supplementInvoiceStatus: 'OPEN',
  signed: true,
  ...over,
});

const VARIANT = (over: Partial<ShopProductVariant> = {}) =>
  ({
    id: 'v-1',
    label: 'L',
    unitPriceCents: 2000,
    trackStock: true,
    available: 3,
    active: true,
    ...over,
  }) as ShopProductVariant;

const PRODUCT = (over: Partial<ShopProduct> = {}) =>
  ({
    id: 'p-1',
    name: 'T-shirt',
    active: true,
    preorderEnabled: false,
    variants: [VARIANT()],
    ...over,
  }) as ShopProduct;

const FORM = {
  reason: 'Taille',
  goodsReturned: false,
  signerName: 'Camille MARTIN',
  signature: 'data:image/png;base64,AAAA' as string | null,
};

describe('activeQty', () => {
  it('les unités encore dans la commande', () => {
    expect(activeQty({ quantity: 3, cancelledQty: 1 })).toBe(2);
    expect(activeQty({ quantity: 1, cancelledQty: 1 })).toBe(0);
  });
});

describe('exchangeChoices', () => {
  it('les déclinaisons actives des produits actifs, libellées comme la commande', () => {
    const choix = exchangeChoices([
      PRODUCT({
        variants: [
          VARIANT(),
          VARIANT({ id: 'v-off', active: false }),
          VARIANT({ id: 'v-libre', label: null, trackStock: false, available: null }),
        ],
      }),
      PRODUCT({ id: 'p-off', active: false, variants: [VARIANT({ id: 'v-x' })] }),
    ]);

    expect(choix).toEqual([
      { variantId: 'v-1', label: 'T-shirt — L', unitPriceCents: 2000, available: 3, preorder: false },
      { variantId: 'v-libre', label: 'T-shirt', unitPriceCents: 2000, available: null, preorder: false },
    ]);
  });
});

describe('exchangeChoiceLabel', () => {
  const choix = { variantId: 'v-1', label: 'T-shirt — L', unitPriceCents: 2000, preorder: false };

  it('le prix, et ce qu’il en reste', () => {
    expect(exchangeChoiceLabel({ ...choix, available: 3 })).toBe('T-shirt — L · 20,00 € · 3 en stock');
    expect(exchangeChoiceLabel({ ...choix, available: 0 })).toBe('T-shirt — L · 20,00 € · épuisé');
    expect(exchangeChoiceLabel({ ...choix, available: 0, preorder: true })).toBe(
      'T-shirt — L · 20,00 € · épuisé, sur commande',
    );
    expect(exchangeChoiceLabel({ ...choix, available: null })).toBe('T-shirt — L · 20,00 €');
  });
});

describe('adjustmentMoneyLines', () => {
  it('article plus cher : le reste à payer', () => {
    expect(adjustmentMoneyLines(PREVIEW({ supplementCents: 1500 }))).toEqual([
      'Reste à payer de 15,00 € : facture à régler en ligne ou au club',
    ]);
  });

  it('ce qui est rendu, éteint, annulé, et la commande réglée', () => {
    expect(
      adjustmentMoneyLines(
        PREVIEW({
          refunds: [
            { kind: 'CHEQUE_PARTIAL', paymentId: 'p-1', amountCents: 1000, chequeNumber: '0012' },
          ],
          writeOffCents: 1000,
          invoiceVoided: true,
          settlesOrder: true,
        }),
      ),
    ).toEqual([
      'Chèque n° 0012 encore au club : 10,00 € à reverser par virement, le chèque reste à remettre en banque',
      'Reste dû réduit de 10,00 € par un avoir',
      'Facture jamais réglée : annulée',
      'La commande est entièrement réglée',
    ]);
  });

  it('rien ne bouge : le dit', () => {
    expect(adjustmentMoneyLines(PREVIEW())).toEqual(['Aucun mouvement d’argent']);
  });
});

describe('adjustmentGoodsLines', () => {
  it('ce qui attendait, ce qui est libéré, ce qui revient', () => {
    expect(
      adjustmentGoodsLines(
        PREVIEW({ fromAwaiting: 2, releaseUnits: 1, returnUnits: 1 }),
        'T-shirt — L',
      ),
    ).toEqual([
      'T-shirt — L : 2 en attente d’arrivage, retirés',
      'T-shirt — L : 1 réservé, libéré',
      'T-shirt — L : 1 à reprendre',
    ]);
    expect(
      adjustmentGoodsLines(PREVIEW({ fromAwaiting: 1, releaseUnits: 2 }), 'T-shirt — L'),
    ).toEqual(['T-shirt — L : 1 en attente d’arrivage, retiré', 'T-shirt — L : 2 réservés, libérés']);
  });

  it('l’article pris, et ce qui attendra l’arrivage', () => {
    expect(
      adjustmentGoodsLines(
        PREVIEW({ newItemLabel: 'Kimono — 140', newItemUnitPriceCents: 3500, newItemAwaitingUnits: 1 }),
        'T-shirt — L',
      ),
    ).toEqual(['Pris : Kimono — 140 (35,00 € l’unité), 1 en attente d’arrivage']);
    expect(
      adjustmentGoodsLines(
        PREVIEW({ newItemLabel: 'Kimono — 140', newItemUnitPriceCents: 3500, newItemAwaitingUnits: 0 }),
        'T-shirt — L',
      ),
    ).toEqual(['Pris : Kimono — 140 (35,00 € l’unité)']);
  });

  it('rien à reprendre', () => {
    expect(adjustmentGoodsLines(PREVIEW(), 'T-shirt — L')).toEqual(['Rien à reprendre']);
  });
});

describe('adjustFormError', () => {
  it('un refus du serveur passe avant tout', () => {
    expect(
      adjustFormError(PREVIEW({ blockers: ['C’est le dernier article de la commande.'] }), FORM),
    ).toBe('C’est le dernier article de la commande.');
  });

  it('commande remise : l’article rapporté, puis la signature de l’échange', () => {
    const remise = PREVIEW({ delivered: true, signatureRequired: true });

    expect(adjustFormError(remise, FORM)).toMatch(/rapporter l’article/);
    expect(adjustFormError(remise, { ...FORM, goodsReturned: true, signature: null })).toMatch(
      /fais signer/,
    );
    expect(adjustFormError(remise, { ...FORM, goodsReturned: true, signerName: '  ' })).toMatch(
      /fais signer/,
    );
    expect(adjustFormError(remise, { ...FORM, goodsReturned: true })).toBeNull();
  });

  it('le motif est obligatoire, blancs exclus', () => {
    expect(adjustFormError(PREVIEW(), { ...FORM, reason: '   ' })).toMatch(/motif/);
    expect(adjustFormError(PREVIEW(), FORM)).toBeNull();
  });
});

describe('adjustmentToast', () => {
  it('un remboursement carte refusé se dit, avec son montant et sa raison', () => {
    expect(
      adjustmentToast(
        RESULT({
          cardRefunds: [{ paymentId: 'p-1', amountCents: 800, ok: false, error: 'charge_disputed' }],
        }),
        true,
      ),
    ).toEqual({
      tone: 'error',
      message:
        'Échange enregistré, mais le remboursement carte a échoué : 8,00 € (charge_disputed). Relance-le depuis la facture.',
    });
  });

  it('résume ce qui a été fait', () => {
    expect(
      adjustmentToast(
        RESULT({
          cardRefunds: [{ paymentId: 'p-1', amountCents: 500, ok: true, error: null }],
          manualRefundedCents: 1000,
          chequesReturned: 1,
          writtenOffCents: 300,
          supplementCents: 1500,
          signed: true,
        }),
        true,
      ),
    ).toEqual({
      tone: 'success',
      message:
        'Échange enregistré. Remboursement carte de 5,00 € lancé. 10,00 € remboursés. 1 chèque à rendre. Reste dû réduit de 3,00 €. Reste à payer de 15,00 € à encaisser. Bon d’échange disponible.',
    });
    expect(adjustmentToast(RESULT({ chequesReturned: 2 }), false).message).toBe(
      'Article annulé. 2 chèques à rendre.',
    );
  });
});

describe('adjustmentHistoryLabel', () => {
  it('échange : ce qui est rendu, ce qui est pris, le reste à payer et son état', () => {
    expect(adjustmentHistoryLabel(ADJ())).toBe(
      'Échange : 1 × T-shirt — L contre 1 × Kimono — 140 · reste à payer 15,00 € (à régler) — Taille',
    );
    expect(adjustmentHistoryLabel(ADJ({ supplementInvoiceStatus: 'PAID' }))).toMatch(/\(réglé\)/);
    expect(adjustmentHistoryLabel(ADJ({ supplementInvoiceStatus: 'VOID' }))).toMatch(/\(annulé\)/);
  });

  it('annulation : ce qui est rendu et éteint', () => {
    expect(
      adjustmentHistoryLabel(
        ADJ({
          kind: 'LINE_CANCEL',
          newLabel: null,
          newQty: null,
          differenceCents: -2000,
          refundedCents: 1000,
          writtenOffCents: 1000,
          supplementInvoiceId: null,
          supplementInvoiceStatus: null,
          signed: false,
          reason: null,
        }),
      ),
    ).toBe('Annulation : 1 × T-shirt — L · 10,00 € remboursés · reste dû réduit de 10,00 €');
  });
});
