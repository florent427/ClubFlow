import { describe, expect, it } from 'vitest';
import {
  cancelFormError,
  cancellationToast,
  lineGoodsLabel,
  planMoneyLines,
  refundLabel,
} from './shop-order-cancellation';
import type {
  ShopOrder,
  ShopOrderCancellationLine,
  ShopOrderCancellationPreview,
  ShopOrderCancellationResult,
  ShopOrderRefundAction,
} from './types';

const PREVIEW = (
  over: Partial<ShopOrderCancellationPreview> = {},
): ShopOrderCancellationPreview => ({
  blockers: [],
  delivered: false,
  exited: true,
  writeOffCents: 0,
  voidInvoice: false,
  refunds: [],
  lines: [],
  ...over,
});

const RESULT = (
  over: Partial<ShopOrderCancellationResult> = {},
): ShopOrderCancellationResult => ({
  order: {} as ShopOrder,
  cardRefunds: [],
  manualRefundedCents: 0,
  chequesReturned: 0,
  writtenOffCents: 0,
  invoiceVoided: false,
  ...over,
});

const LINE = (
  over: Partial<ShopOrderCancellationLine> = {},
): ShopOrderCancellationLine => ({
  lineId: 'l-1',
  label: 'T-shirt — L',
  returnUnits: 0,
  releaseUnits: 0,
  awaitingUnits: 0,
  ...over,
});

describe('refundLabel', () => {
  const CAS: Array<[Omit<ShopOrderRefundAction, 'paymentId'>, string]> = [
    [
      { kind: 'CARD', amountCents: 4000, chequeNumber: null },
      'Carte bancaire : 40,00 € remboursés par Stripe',
    ],
    [
      { kind: 'CASH', amountCents: 1550, chequeNumber: null },
      'Espèces : 15,50 € à rendre',
    ],
    [
      { kind: 'TRANSFER', amountCents: 4000, chequeNumber: null },
      'Virement : 40,00 € à reverser',
    ],
    [
      { kind: 'CHEQUE_RETURN', amountCents: 4000, chequeNumber: '0012' },
      'Chèque n° 0012 (40,00 €) : rendu à l’adhérent',
    ],
    [
      { kind: 'CHEQUE_RETURN', amountCents: 4000, chequeNumber: null },
      'Chèque (40,00 €) : rendu à l’adhérent',
    ],
    [
      { kind: 'CHEQUE_DEPOSITED', amountCents: 4000, chequeNumber: '0012' },
      'Chèque n° 0012 déjà remis en banque : 40,00 € à reverser par virement',
    ],
    [
      { kind: 'CHEQUE_PARTIAL', amountCents: 1500, chequeNumber: '0012' },
      'Chèque n° 0012 encore au club : 15,00 € à reverser par virement, le chèque reste à remettre en banque',
    ],
  ];

  it.each(CAS)('%o', (action, attendu) => {
    expect(refundLabel({ paymentId: 'p-1', ...action })).toBe(attendu);
  });
});

describe('planMoneyLines', () => {
  it('chaque remboursement, puis le reste dû éteint', () => {
    expect(
      planMoneyLines(
        PREVIEW({
          refunds: [
            { kind: 'CASH', paymentId: 'p-1', amountCents: 1500, chequeNumber: null },
          ],
          writeOffCents: 2500,
        }),
      ),
    ).toEqual(['Espèces : 15,00 € à rendre', 'Reste dû de 25,00 € annulé par un avoir']);
  });

  it('facture sans règlement : annulée', () => {
    expect(planMoneyLines(PREVIEW({ voidInvoice: true }))).toEqual([
      'Facture annulée : aucun règlement encaissé',
    ]);
  });

  it('rien à rendre ni à éteindre : le dit', () => {
    expect(planMoneyLines(PREVIEW())).toEqual(['Aucun règlement à rendre']);
  });
});

describe('lineGoodsLabel', () => {
  it('reprise et attente éteinte', () => {
    expect(lineGoodsLabel(LINE({ returnUnits: 2, awaitingUnits: 1 }))).toBe(
      '2 à reprendre · 1 en attente d’arrivage, annulés',
    );
  });

  it('réservation libérée, au singulier et au pluriel', () => {
    expect(lineGoodsLabel(LINE({ releaseUnits: 1 }))).toBe('1 réservé, libéré');
    expect(lineGoodsLabel(LINE({ releaseUnits: 3 }))).toBe('3 réservés, libérés');
  });

  it('rien à reprendre', () => {
    expect(lineGoodsLabel(LINE())).toBe('Rien à reprendre');
  });
});

describe('cancelFormError', () => {
  it('un refus du serveur passe avant tout', () => {
    expect(
      cancelFormError(PREVIEW({ blockers: ['Cette commande est déjà annulée.'] }), {
        reason: 'Erreur',
        goodsReturned: true,
      }),
    ).toBe('Cette commande est déjà annulée.');
  });

  it('le motif est obligatoire, blancs exclus', () => {
    expect(cancelFormError(PREVIEW(), { reason: '   ', goodsReturned: false })).toMatch(
      /motif/,
    );
  });

  it('commande remise : exige les articles rapportés', () => {
    const preview = PREVIEW({ delivered: true });

    expect(cancelFormError(preview, { reason: 'Taille', goodsReturned: false })).toMatch(
      /rapporter les articles/,
    );
    expect(cancelFormError(preview, { reason: 'Taille', goodsReturned: true })).toBeNull();
  });

  it('commande non remise : le motif suffit', () => {
    expect(cancelFormError(PREVIEW(), { reason: 'Taille', goodsReturned: false })).toBeNull();
  });
});

describe('cancellationToast', () => {
  it('un remboursement carte refusé se dit, avec son montant et sa raison', () => {
    expect(
      cancellationToast(
        RESULT({
          cardRefunds: [
            { paymentId: 'p-1', amountCents: 4000, ok: false, error: 'charge_disputed' },
          ],
        }),
      ),
    ).toEqual({
      tone: 'error',
      message:
        'Commande annulée, mais le remboursement carte a échoué : 40,00 € (charge_disputed). Relance-le depuis la facture.',
    });
  });

  it('résume tout ce qui a été fait', () => {
    expect(
      cancellationToast(
        RESULT({
          cardRefunds: [{ paymentId: 'p-1', amountCents: 2000, ok: true, error: null }],
          manualRefundedCents: 1500,
          chequesReturned: 1,
          writtenOffCents: 500,
          invoiceVoided: false,
        }),
      ),
    ).toEqual({
      tone: 'success',
      message:
        'Commande annulée. Remboursement carte de 20,00 € lancé. 15,00 € remboursés. 1 chèque à rendre. Reste dû de 5,00 € annulé.',
    });
  });

  it('commande jamais réglée : facture annulée', () => {
    expect(cancellationToast(RESULT({ invoiceVoided: true }))).toEqual({
      tone: 'success',
      message: 'Commande annulée. Facture annulée.',
    });
  });

  it('plusieurs chèques', () => {
    expect(cancellationToast(RESULT({ chequesReturned: 2 })).message).toBe(
      'Commande annulée. 2 chèques à rendre.',
    );
  });
});
