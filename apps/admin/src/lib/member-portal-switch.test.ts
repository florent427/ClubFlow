import { describe, expect, it } from 'vitest';
import {
  memberPortalHostFromAdminHost,
  memberPortalSwitchUrl,
} from './member-portal-switch';

describe('memberPortalHostFromAdminHost', () => {
  it('déduit le portail du sous-domaine de l’admin', () => {
    expect(memberPortalHostFromAdminHost('app.clubflow.topdigital.re')).toBe(
      'portail.clubflow.topdigital.re',
    );
  });

  it('garde le préfixe de l’environnement', () => {
    expect(
      memberPortalHostFromAdminHost('staging.app.clubflow.topdigital.re'),
    ).toBe('staging.portail.clubflow.topdigital.re');
  });

  it('renvoie null quand l’hôte ne suit pas ce schéma', () => {
    expect(memberPortalHostFromAdminHost('localhost')).toBeNull();
    expect(memberPortalHostFromAdminHost('sksr.re')).toBeNull();
    expect(memberPortalHostFromAdminHost('application.sksr.re')).toBeNull();
  });
});

describe('memberPortalSwitchUrl', () => {
  it('passe la session dans le fragment, seul canal entre deux origines', () => {
    expect(
      memberPortalSwitchUrl('https://portail.example.re/', 'jeton.abc', 'c1'),
    ).toBe('https://portail.example.re/#sso=jeton.abc&club=c1');
  });

  it('échappe le jeton et le club', () => {
    expect(memberPortalSwitchUrl('/membre', 'a+b/c=', 'club 2')).toBe(
      '/membre#sso=a%2Bb%2Fc%3D&club=club%202',
    );
  });

  it('ajoute à un fragment déjà présent', () => {
    expect(memberPortalSwitchUrl('/membre#deja', 'j', 'c')).toBe(
      '/membre#deja&sso=j&club=c',
    );
  });
});
