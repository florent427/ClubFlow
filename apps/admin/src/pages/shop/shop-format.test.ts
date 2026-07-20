import { describe, expect, it } from 'vitest';
import {
  DISCREPANCY_REASONS,
  fmtCostOrUnknown,
  fmtMarginRate,
  previewReceiptLine,
} from './shop-format';

/**
 * Ce que ces tests protègent : l'écran ANNONCE une conséquence avant que le
 * trésorier valide. Si l'annonce et la règle serveur divergent, l'interface
 * ment au moment précis où elle est censée éclairer — et solde des lignes
 * qu'on attendait encore.
 */

describe('previewReceiptLine — le motif pilote la machine à états', () => {
  const base = { orderedQty: 20, alreadyReceived: 0, note: '' };

  it('sans écart : la ligne se solde d’elle-même, aucun motif exigé', () => {
    const p = previewReceiptLine({ ...base, receivedQty: 20, reason: null });
    expect(p.hasDiscrepancy).toBe(false);
    expect(p.willClose).toBe(true);
    expect(p.blocker).toBeNull();
  });

  it('écart sans motif : bloqué', () => {
    const p = previewReceiptLine({ ...base, receivedQty: 17, reason: null });
    expect(p.hasDiscrepancy).toBe(true);
    expect(p.blocker).toContain('motif est obligatoire');
  });

  it('BACKORDER laisse la ligne OUVERTE avec son reliquat', () => {
    const p = previewReceiptLine({
      ...base,
      receivedQty: 17,
      reason: 'BACKORDER',
    });
    expect(p.willClose).toBe(false);
    expect(p.remaining).toBe(3);
    expect(p.blocker).toBeNull();
  });

  it.each([
    'SUPPLIER_SHORTAGE',
    'DAMAGED_IN_TRANSIT',
    'PICKING_ERROR',
    'OVER_DELIVERY',
  ] as const)('%s solde la ligne', (reason) => {
    const p = previewReceiptLine({ ...base, receivedQty: 17, reason });
    expect(p.willClose).toBe(true);
  });

  it('BACKORDER est le SEUL motif qui laisse ouvert', () => {
    expect(DISCREPANCY_REASONS.filter((r) => r.keepsOpen)).toEqual([
      expect.objectContaining({ value: 'BACKORDER' }),
    ]);
  });

  it('OTHER solde ET exige un commentaire', () => {
    const without = previewReceiptLine({
      ...base,
      receivedQty: 17,
      reason: 'OTHER',
    });
    expect(without.blocker).toContain('commentaire');
    const withNote = previewReceiptLine({
      ...base,
      receivedQty: 17,
      reason: 'OTHER',
      note: 'colis ouvert',
    });
    expect(withNote.blocker).toBeNull();
    expect(withNote.willClose).toBe(true);
  });

  it('le cumul, pas la seule livraison, décide de l’écart', () => {
    // 12 déjà reçus + 8 = 20 commandés : conforme, malgré une livraison
    // partielle. Comparer 8 à 20 exigerait un motif à tort.
    const p = previewReceiptLine({
      orderedQty: 20,
      alreadyReceived: 12,
      receivedQty: 8,
      reason: null,
      note: '',
    });
    expect(p.hasDiscrepancy).toBe(false);
    expect(p.blocker).toBeNull();
  });

  it('recevoir 0 est licite, avec son motif', () => {
    const p = previewReceiptLine({
      ...base,
      receivedQty: 0,
      reason: 'SUPPLIER_SHORTAGE',
    });
    expect(p.blocker).toBeNull();
    expect(p.willClose).toBe(true);
  });
});

describe('honnêteté d’affichage du reporting', () => {
  it('un coût inconnu s’affiche « — », JAMAIS 0 €', () => {
    expect(fmtCostOrUnknown(null)).toBe('—');
    expect(fmtCostOrUnknown(0)).toBe('0,00 €');
  });

  it('une marge inconnue ne devient pas 100 %', () => {
    expect(fmtMarginRate(null)).toBe('—');
    expect(fmtMarginRate(0.4)).toBe('40,0 %');
  });
});
