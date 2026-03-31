import { spfTxtIncludesIp4, normalizeIpv4 } from './spf-dns-check';

describe('spfTxtIncludesIp4', () => {
  it('normalizeIpv4 rejette les valeurs invalides', () => {
    expect(normalizeIpv4('999.1.1.1')).toBe('');
    expect(normalizeIpv4('not-ip')).toBe('');
    expect(normalizeIpv4('10.0.0.1')).toBe('10.0.0.1');
  });

  it('retourne false si resolveTxt échoue', async () => {
    const resolveTxt = jest.fn().mockRejectedValue(
      Object.assign(new Error('ENOTFOUND'), { code: 'ENOTFOUND' }),
    );
    await expect(
      spfTxtIncludesIp4('missing.example', '1.2.3.4', resolveTxt),
    ).resolves.toBe(false);
  });

  it('retourne true si un TXT commence par v=spf1 et contient ip4 exact', async () => {
    const resolveTxt = jest.fn().mockResolvedValue([
      ['v=spf1 ip4:203.0.113.10 include:_spf.example.com -all'],
    ]);
    await expect(
      spfTxtIncludesIp4('club.example', '203.0.113.10', resolveTxt),
    ).resolves.toBe(true);
  });

  it('accepte ip4 avec masque /32', async () => {
    const resolveTxt = jest
      .fn()
      .mockResolvedValue([['v=spf1 ip4:203.0.113.10/32 -all']]);
    await expect(
      spfTxtIncludesIp4('club.example', '203.0.113.10', resolveTxt),
    ).resolves.toBe(true);
  });

  it('retourne false si ip4 différent (pas de préfixe ambigu)', async () => {
    const resolveTxt = jest.fn().mockResolvedValue([['v=spf1 ip4:203.0.113.1 -all']]);
    await expect(
      spfTxtIncludesIp4('club.example', '203.0.113.10', resolveTxt),
    ).resolves.toBe(false);
  });

  it('retourne false sans enregistrement v=spf1', async () => {
    const resolveTxt = jest.fn().mockResolvedValue([['some other txt']]);
    await expect(
      spfTxtIncludesIp4('club.example', '203.0.113.10', resolveTxt),
    ).resolves.toBe(false);
  });
});
