import {
  listUnsubscribeHeader,
  memberPortalOrigin,
  publicApiOrigin,
} from './unsubscribe-urls';

describe('adresses de désinscription', () => {
  const avant = { ...process.env };
  afterEach(() => {
    process.env = { ...avant };
  });

  it('déduit l’API du portail quand rien ne la donne', () => {
    delete process.env.API_BASE_URL;
    process.env.MEMBER_PORTAL_ORIGIN = 'https://portail.clubflow.topdigital.re';
    expect(publicApiOrigin()).toBe('https://api.clubflow.topdigital.re');
  });

  it('garde le préfixe d’environnement', () => {
    delete process.env.API_BASE_URL;
    process.env.MEMBER_PORTAL_ORIGIN =
      'https://staging.portail.clubflow.topdigital.re';
    expect(publicApiOrigin()).toBe('https://staging.api.clubflow.topdigital.re');
  });

  it('préfère API_BASE_URL quand elle est posée', () => {
    process.env.API_BASE_URL = 'https://api.exemple.re/';
    process.env.MEMBER_PORTAL_ORIGIN = 'https://portail.clubflow.topdigital.re';
    expect(publicApiOrigin()).toBe('https://api.exemple.re');
  });

  it('ne retient que la première origine du portail', () => {
    process.env.MEMBER_PORTAL_ORIGIN =
      'https://portail.exemple.re, https://autre.exemple.re';
    expect(memberPortalOrigin()).toBe('https://portail.exemple.re');
  });

  it('en développement, l’API locale', () => {
    delete process.env.API_BASE_URL;
    process.env.MEMBER_PORTAL_ORIGIN = 'http://localhost:5174';
    expect(publicApiOrigin()).toBe('http://localhost:3000');
  });

  it('l’en-tête donne d’abord l’adresse appelée automatiquement', () => {
    delete process.env.API_BASE_URL;
    process.env.MEMBER_PORTAL_ORIGIN = 'https://portail.exemple.re';

    expect(listUnsubscribeHeader('jeton.abc')).toBe(
      '<https://api.exemple.re/mail/unsubscribe?token=jeton.abc>, ' +
        '<https://portail.exemple.re/desinscription?token=jeton.abc>',
    );
  });
});
