import { describe, expect, it } from 'vitest';
import type { ModuleCodeStr } from './module-catalog';
import { modulesRequiredForPath, pathAllowed } from './club-modules-nav';

describe('modulesRequiredForPath', () => {
  it('planning', () => {
    expect(modulesRequiredForPath('/planning')).toEqual(['PLANNING']);
  });
  it('families needs MEMBERS and FAMILIES', () => {
    expect(modulesRequiredForPath('/members/families')).toEqual([
      'MEMBERS',
      'FAMILIES',
    ]);
  });
  it('documents needs DOCUMENTS', () => {
    expect(modulesRequiredForPath('/documents')).toEqual(['DOCUMENTS']);
    expect(modulesRequiredForPath('/documents/abc/editor')).toEqual([
      'DOCUMENTS',
    ]);
    expect(modulesRequiredForPath('/documents/abc/signatures')).toEqual([
      'DOCUMENTS',
    ]);
  });
  it('la messagerie suit MESSAGING, les campagnes COMMUNICATION', () => {
    expect(modulesRequiredForPath('/communication/messagerie')).toEqual([
      'MESSAGING',
    ]);
    expect(modulesRequiredForPath('/communication')).toEqual(['COMMUNICATION']);
  });
  it('chaque page suit le module de son entrée de menu', () => {
    expect(modulesRequiredForPath('/evenements')).toEqual(['EVENTS']);
    expect(modulesRequiredForPath('/projets')).toEqual(['PROJECTS']);
    expect(modulesRequiredForPath('/reservations')).toEqual(['BOOKING']);
    expect(modulesRequiredForPath('/vie-du-club')).toEqual(['CLUB_LIFE']);
    expect(modulesRequiredForPath('/blog')).toEqual(['BLOG']);
    expect(modulesRequiredForPath('/billing')).toEqual(['PAYMENT']);
    expect(modulesRequiredForPath('/settings/pricing-rules')).toEqual([
      'PAYMENT',
    ]);
    expect(modulesRequiredForPath('/settings/payments')).toEqual(['PAYMENT']);
    expect(modulesRequiredForPath('/settings/accounting')).toEqual([
      'ACCOUNTING',
    ]);
    // Le libellé voisin garde ses deux modules.
    expect(modulesRequiredForPath('/settings/adhesion-pricing-rules')).toEqual([
      'MEMBERS',
      'PAYMENT',
    ]);
  });
});

describe('pathAllowed', () => {
  it('denies planning when PLANNING off', () => {
    const isEnabled = (c: ModuleCodeStr) => c !== 'PLANNING';
    expect(pathAllowed('/planning', isEnabled)).toBe(false);
  });
  it('allows dashboard always', () => {
    expect(pathAllowed('/', () => false)).toBe(true);
  });
  it('denies documents when DOCUMENTS off', () => {
    const isEnabled = (c: ModuleCodeStr) => c !== 'DOCUMENTS';
    expect(pathAllowed('/documents', isEnabled)).toBe(false);
  });
  it('ouvre la messagerie à un club qui n’a pas les campagnes', () => {
    const messagerieSeule = (c: ModuleCodeStr) => c === 'MESSAGING';
    expect(pathAllowed('/communication/messagerie', messagerieSeule)).toBe(true);
    expect(pathAllowed('/communication', messagerieSeule)).toBe(false);
  });
  it('ferme la messagerie à un club qui n’a que les campagnes', () => {
    const campagnesSeules = (c: ModuleCodeStr) => c === 'COMMUNICATION';
    expect(pathAllowed('/communication/messagerie', campagnesSeules)).toBe(
      false,
    );
    expect(pathAllowed('/communication', campagnesSeules)).toBe(true);
  });
  it('ferme les pages des modules récents quand ils sont éteints', () => {
    const rien = () => false;
    for (const p of [
      '/evenements',
      '/projets',
      '/reservations',
      '/vie-du-club',
      '/blog',
      '/billing',
      '/settings/pricing-rules',
      '/settings/payments',
      '/settings/accounting',
    ]) {
      expect(pathAllowed(p, rien)).toBe(false);
    }
  });
});
