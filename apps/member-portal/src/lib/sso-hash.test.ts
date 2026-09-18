import { describe, expect, it } from 'vitest';
import { parseSsoHash } from './sso-hash';

describe('parseSsoHash', () => {
  it('lit le jeton et le club envoyés par l’administration', () => {
    expect(parseSsoHash('#sso=jeton.abc&club=club-1')).toEqual({
      token: 'jeton.abc',
      clubId: 'club-1',
    });
  });

  it('décode les valeurs échappées', () => {
    const token = 'a.b+c/d=';
    const hash = `#sso=${encodeURIComponent(token)}&club=${encodeURIComponent('club 2')}`;
    expect(parseSsoHash(hash)).toEqual({ token, clubId: 'club 2' });
  });

  it('ignore un fragment sans session', () => {
    expect(parseSsoHash('')).toBeNull();
    expect(parseSsoHash('#')).toBeNull();
    expect(parseSsoHash('#section-factures')).toBeNull();
    expect(parseSsoHash('#sso=jeton.abc')).toBeNull();
    expect(parseSsoHash('#club=club-1')).toBeNull();
  });
});
