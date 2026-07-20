import { describe, expect, it } from 'vitest';
import { decodeJwtIdentity, decodeJwtPayload } from './jwt';

/** Fabrique un JWT de test : seule la charge utile compte ici. */
function jeton(payload: Record<string, unknown>): string {
  const json = JSON.stringify(payload);
  const octets = new TextEncoder().encode(json);
  const binaire = String.fromCharCode(...octets);
  const base64url = btoa(binaire)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
  return `entete.${base64url}.signature`;
}

describe('decodeJwtPayload', () => {
  it('rend « démo » et NON « dÃ©mo »', () => {
    // LE bug observé en production : `atob` rend une chaîne d'octets Latin-1,
    // donc le « é » (0xC3 0xA9 en UTF-8) ressortait comme les deux caractères
    // « Ã© » dans la barre du haut. Sans repasser les octets dans un décodeur
    // UTF-8, ce test est rouge.
    const p = decodeJwtPayload<{ displayName: string }>(
      jeton({ displayName: 'Admin démo' }),
    );

    expect(p?.displayName).toBe('Admin démo');
    expect(p?.displayName).not.toContain('Ã');
  });

  it('survit à une charge utile base64url (« - » et « _ »)', () => {
    // `atob` LÈVE sur ces caractères. Comme les appelants avalent l'exception,
    // la panne ne se voyait pas : le nom disparaissait simplement.
    //
    // Ces deux chaînes sont choisies pour que l'encodage produise réellement
    // un « - » ou un « _ » — un test qui n'en produirait aucun serait vert
    // sans rien prouver.
    const avecTirets = jeton({ displayName: 'çé~ÿ', n: 0xfbf0 });
    expect(avecTirets).toMatch(/[-_]/);

    const p = decodeJwtPayload<{ displayName: string }>(avecTirets);
    expect(p?.displayName).toBe('çé~ÿ');
  });

  it('accepte les emojis et les caractères hors plan de base', () => {
    const p = decodeJwtPayload<{ displayName: string }>(
      jeton({ displayName: 'Club 🏉 Réunion' }),
    );
    expect(p?.displayName).toBe('Club 🏉 Réunion');
  });

  it('rend null sur un jeton illisible plutôt que de lever', () => {
    expect(decodeJwtPayload('pas-un-jwt')).toBeNull();
    expect(decodeJwtPayload('')).toBeNull();
    expect(decodeJwtPayload('a.!!!.c')).toBeNull();
  });
});

describe('decodeJwtIdentity', () => {
  it('extrait le nom et l’email accentués', () => {
    expect(
      decodeJwtIdentity(
        jeton({ displayName: 'Amélie Dupré', email: 'a@b.re' }),
      ),
    ).toEqual({ displayName: 'Amélie Dupré', email: 'a@b.re' });
  });

  it('rend des null explicites quand les claims manquent', () => {
    expect(decodeJwtIdentity(jeton({ sub: 'x' }))).toEqual({
      displayName: null,
      email: null,
    });
  });
});
