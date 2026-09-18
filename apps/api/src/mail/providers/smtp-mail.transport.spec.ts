import * as SpfDns from './spf-dns-check';
import { SmtpMailTransport } from './smtp-mail.transport';

describe('SmtpMailTransport', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
    delete process.env.SMTP_AUTO_VERIFY_DOMAIN;
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

  it.each([
    ['absente', undefined],
    ['à false', 'false'],
    ['vide', ''],
  ])(
    'refreshDomain : SMTP_AUTO_VERIFY_DOMAIN %s → rien de vérifié, ni prêt ni en échec (audit 1.4)',
    async (_cas, valeur) => {
      if (valeur !== undefined) process.env.SMTP_AUTO_VERIFY_DOMAIN = valeur;
      const t = SmtpMailTransport.fromEnv();
      const reg = await t.registerDomain('club.example');
      const snap = await t.refreshDomain(reg.providerDomainId);
      expect(snap).toEqual({
        providerDomainId: reg.providerDomainId,
        records: [],
        verified: false,
        failed: false,
        inconclusive: true,
      });
    },
  );

  it.each(['true', '1', 'yes', 'TRUE'])(
    'refreshDomain : SMTP_AUTO_VERIFY_DOMAIN=%s demandé explicitement → prêt',
    async (valeur) => {
      process.env.SMTP_AUTO_VERIFY_DOMAIN = valeur;
      const t = SmtpMailTransport.fromEnv();
      const snap = await t.refreshDomain((await t.registerDomain('dev.local')).providerDomainId);
      expect(snap.verified).toBe(true);
      expect(snap.inconclusive).toBeUndefined();
    },
  );

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

describe('SmtpMailTransport.sendEmail — pièces jointes', () => {
  it('transmet les pièces jointes au relais SMTP', async () => {
    const sendMail = jest.fn().mockResolvedValue({ messageId: 'm-1' });
    const transport = new SmtpMailTransport({ sendMail } as never);
    const pdf = Buffer.from('%PDF-bon');

    await transport.sendEmail({
      clubId: 'club-1',
      kind: 'transactional',
      from: { name: 'Dojo', address: 'noreply@dojo.fr' },
      to: 'maman@example.fr',
      subject: 'Bon de livraison',
      html: '<p>ci-joint</p>',
      attachments: [
        { filename: 'Bon.pdf', content: pdf, contentType: 'application/pdf' },
      ],
    });

    expect(sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        attachments: [
          { filename: 'Bon.pdf', content: pdf, contentType: 'application/pdf' },
        ],
      }),
    );
  });
});

describe('SmtpMailTransport.sendEmail — désinscription', () => {
  const envoi = async (listUnsubscribe?: string) => {
    const sendMail = jest.fn().mockResolvedValue({ messageId: 'm-1' });
    const transport = new SmtpMailTransport({ sendMail } as never);
    await transport.sendEmail({
      clubId: 'club-1',
      kind: 'campaign',
      from: { name: 'Dojo', address: 'noreply@dojo.fr' },
      to: 'parent@example.fr',
      subject: 'Stage de Toussaint',
      html: '<p>Inscriptions ouvertes</p>',
      listUnsubscribe,
    });
    return (sendMail.mock.calls[0][0] as { headers: Record<string, string> })
      .headers;
  };

  it('accompagne le lien de l’en-tête un clic : sans lui, aucun bouton « Se désabonner »', async () => {
    const headers = await envoi('<https://api.exemple.re/mail/unsubscribe?token=t>');

    expect(headers['List-Unsubscribe']).toBe(
      '<https://api.exemple.re/mail/unsubscribe?token=t>',
    );
    expect(headers['List-Unsubscribe-Post']).toBe('List-Unsubscribe=One-Click');
  });

  it('sans lien, aucun des deux en-têtes', async () => {
    const headers = await envoi(undefined);

    expect(headers['List-Unsubscribe']).toBeUndefined();
    expect(headers['List-Unsubscribe-Post']).toBeUndefined();
  });
});
