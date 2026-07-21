import { describe, expect, it } from 'vitest';
import {
  canCancelOrder,
  canRepayOrder,
  orderStatusBadge,
} from './shop-order-actions';
import type { ViewerShopOrderStatus } from './viewer-types';

const STATUSES: ViewerShopOrderStatus[] = ['PENDING', 'PAID', 'CANCELLED'];

describe('canRepayOrder — reprise de paiement réservée au PENDING', () => {
  it('vrai uniquement pour PENDING', () => {
    expect(canRepayOrder('PENDING')).toBe(true);
    expect(canRepayOrder('PAID')).toBe(false);
    expect(canRepayOrder('CANCELLED')).toBe(false);
  });
});

describe('canCancelOrder — annulation réservée au PENDING', () => {
  it('vrai uniquement pour PENDING', () => {
    expect(canCancelOrder('PENDING')).toBe(true);
    expect(canCancelOrder('PAID')).toBe(false);
    expect(canCancelOrder('CANCELLED')).toBe(false);
  });

  it('aucune action proposée sur une commande finale', () => {
    // Miroir du serveur : une PAID/CANCELLED n'expose ni repay ni cancel.
    for (const s of STATUSES.filter((x) => x !== 'PENDING')) {
      expect(canRepayOrder(s)).toBe(false);
      expect(canCancelOrder(s)).toBe(false);
    }
  });
});

describe('orderStatusBadge — libellé lisible par statut', () => {
  it('mappe chaque statut sur un libellé FR et une classe', () => {
    expect(orderStatusBadge('PENDING')).toEqual({
      label: 'En attente',
      cls: 'warn',
    });
    expect(orderStatusBadge('PAID')).toEqual({ label: 'Payée', cls: 'ok' });
    expect(orderStatusBadge('CANCELLED')).toEqual({
      label: 'Annulée',
      cls: 'muted',
    });
  });

  it('couvre tous les statuts sans retomber sur un défaut ambigu', () => {
    for (const s of STATUSES) {
      const b = orderStatusBadge(s);
      expect(b.label.length).toBeGreaterThan(0);
      expect(['ok', 'warn', 'muted']).toContain(b.cls);
    }
  });
});
