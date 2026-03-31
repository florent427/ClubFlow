import * as SpfDns from './spf-dns-check';
import { SmtpMailTransport } from './smtp-mail.transport';

describe('SmtpMailTransport', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
    delete process.env.SMTP_DNS_SPF_CHECK;
    delete process.env.SMTP_PUBLIC_EGRESS_IP;
    delete process.env.SMTP_DMARC_RUA_EMAIL;
  });

  it('registerDomain et refreshDomain (auto-verify)', async () => {
    process.env.SMTP_AUTO_VERIFY_DOMAIN = 'true';
    const t = SmtpMailTransport.fromEnv();
    const reg = await t.registerDomain('test.local');
    expect(reg.providerDomainId).toContain('smtp:');
    const snap = await t.refreshDomain(reg.providerDomainId);
    expect(snap.verified).toBe(true);
    expect(snap.failed).toBe(false);
  });

  it('refreshDomain: SMTP_DNS_SPF_CHECK sans IP publique → failed', async () => {
    process.env.SMTP_DNS_SPF_CHECK = 'true';
    process.env.SMTP_AUTO_VERIFY_DOMAIN = 'false';
    const t = SmtpMailTransport.fromEnv();
    const reg = await t.registerDomain('club.example');
    const snap = await t.refreshDomain(reg.providerDomainId);
    expect(snap.verified).toBe(false);
    expect(snap.failed).toBe(true);
    expect(snap.records.some((r) => r.type === 'TXT')).toBe(true);
  });

  it('refreshDomain: SMTP_DNS_SPF_CHECK + SPF OK → verified même si auto-verify false', async () => {
    process.env.SMTP_DNS_SPF_CHECK = 'true';
    process.env.SMTP_PUBLIC_EGRESS_IP = '203.0.113.10';
    process.env.SMTP_AUTO_VERIFY_DOMAIN = 'false';
    jest.spyOn(SpfDns, 'spfTxtIncludesIp4').mockResolvedValue(true);
    const t = SmtpMailTransport.fromEnv();
    const reg = await t.registerDomain('club.example');
    const snap = await t.refreshDomain(reg.providerDomainId);
    expect(snap.verified).toBe(true);
    expect(snap.failed).toBe(false);
  });

  it('registerDomain: sans SMTP_PUBLIC_EGRESS_IP → records vides', async () => {
    process.env.SMTP_AUTO_VERIFY_DOMAIN = 'true';
    const t = SmtpMailTransport.fromEnv();
    const reg = await t.registerDomain('club.example');
    expect(reg.records).toEqual([]);
  });

  it('registerDomain: avec IP sortante → TXT SPF (~all) suggéré', async () => {
    process.env.SMTP_AUTO_VERIFY_DOMAIN = 'true';
    process.env.SMTP_PUBLIC_EGRESS_IP = '203.0.113.10';
    const t = SmtpMailTransport.fromEnv();
    const reg = await t.registerDomain('club.example');
    expect(reg.records).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'TXT',
          value: 'v=spf1 ip4:203.0.113.10 ~all',
        }),
      ]),
    );
  });

  it('registerDomain: DMARC RUA optionnel', async () => {
    process.env.SMTP_AUTO_VERIFY_DOMAIN = 'true';
    process.env.SMTP_PUBLIC_EGRESS_IP = '203.0.113.10';
    process.env.SMTP_DMARC_RUA_EMAIL = 'dmarc@example.com';
    const t = SmtpMailTransport.fromEnv();
    const reg = await t.registerDomain('club.example');
    expect(reg.records).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'TXT',
          name: '_dmarc',
          value: 'v=DMARC1; p=none; rua=mailto:dmarc@example.com',
        }),
      ]),
    );
  });

  it('refreshDomain: SMTP_DNS_SPF_CHECK + SPF KO → failed', async () => {
    process.env.SMTP_DNS_SPF_CHECK = 'true';
    process.env.SMTP_PUBLIC_EGRESS_IP = '203.0.113.10';
    jest.spyOn(SpfDns, 'spfTxtIncludesIp4').mockResolvedValue(false);
    const t = SmtpMailTransport.fromEnv();
    const reg = await t.registerDomain('club.example');
    const snap = await t.refreshDomain(reg.providerDomainId);
    expect(snap.verified).toBe(false);
    expect(snap.failed).toBe(true);
  });
});
