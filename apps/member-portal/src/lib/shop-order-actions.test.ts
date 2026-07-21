import { describe, expect, it } from 'vitest';
import {
  canCancelOrder,
  canPayOnSiteAtCheckout,
  canRepayOrder,
  orderStatusBadge,
} from './shop-order-actions';
import type { ViewerShopOrderStatus } from './viewer-types';

const STATUSES: ViewerShopOrderStatus[] = ['PENDING', 'PAID', 'CANCELLED'];

describe('canRepayOrder — PENDING ET payable en ligne', () => {
  it('vrai seulement pour une commande PENDING AVEC facture', () => {
    expect(canRepayOrder({ status: 'PENDING', payableOnline: true })).toBe(true);
    expect(canRepayOrder({ status: 'PAID', payableOnline: true })).toBe(false);
    expect(canRepayOrder({ status: 'CANCELLED', payableOnline: true })).toBe(
      false,
    );
  });

  it('FAUX pour une commande « sur place » (PENDING sans facture)', () => {
    // Le cas que ce champ existe pour trancher : sans facture, le repay Stripe
    // échouerait — on ne propose donc pas « Payer », seulement « Annuler ».
    expect(canRepayOrder({ status: 'PENDING', payableOnline: false })).toBe(
      false,
    );
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
      expect(canRepayOrder({ status: s, payableOnline: true })).toBe(false);
      expect(canCancelOrder(s)).toBe(false);
    }
  });
});

describe('canPayOnSiteAtCheckout — « Régler sur place » réservé à la validation du panier', () => {
  it('vrai à la validation du panier (aucun orderId)', () => {
    expect(canPayOnSiteAtCheckout()).toBe(true);
    expect(canPayOnSiteAtCheckout(undefined)).toBe(true);
    expect(canPayOnSiteAtCheckout(null)).toBe(true);
  });

  it('faux en reprise de paiement (une commande est visée)', () => {
    // Mode repay : la modale reçoit l'id de la commande PENDING à repayer.
    // Le règlement sur place n'a alors aucun sens (la commande existe déjà).
    expect(canPayOnSiteAtCheckout('order_123')).toBe(false);
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
