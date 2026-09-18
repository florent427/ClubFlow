import { describe, expect, it } from 'vitest';
import { adminHostFromMemberPortalHost } from './admin-switch';

describe('adminHostFromMemberPortalHost', () => {
  it('déduit l’administration du sous-domaine du portail', () => {
    expect(
      adminHostFromMemberPortalHost('portail.clubflow.topdigital.re'),
    ).toBe('app.clubflow.topdigital.re');
  });

  it('garde le préfixe de l’environnement', () => {
    expect(
      adminHostFromMemberPortalHost('staging.portail.clubflow.topdigital.re'),
    ).toBe('staging.app.clubflow.topdigital.re');
  });

  it('renvoie null quand l’hôte ne suit pas ce schéma', () => {
    expect(adminHostFromMemberPortalHost('localhost')).toBeNull();
    expect(adminHostFromMemberPortalHost('sksr.re')).toBeNull();
    expect(adminHostFromMemberPortalHost('monportail.sksr.re')).toBeNull();
  });
});
