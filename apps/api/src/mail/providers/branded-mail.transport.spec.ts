import type { PrismaService } from '../../prisma/prisma.service';
import { isFullHtmlDocument } from '../branding/club-mail-layout';
import type {
  MailTransport,
  SendClubEmailParams,
} from '../mail-transport.interface';
import {
  BrandedMailTransport,
  humanUnsubscribeUrl,
} from './branded-mail.transport';

/**
 * L'enveloppe est posée au goulot pour qu'aucun point d'envoi ne puisse y
 * échapper. Ces tests vérifient donc surtout ce qui traverse : le corps est
 * habillé, TOUT le reste (destinataire, objet, pièces jointes, en-tête de
 * désinscription) arrive intact au transport réel.
 */

const CLUB = 'club-1';

const CLUB_ROW = {
  name: 'Shotokan Karaté Sud Réunion',
  logoUrl: 'https://api.clubflow.topdigital.re/media/abc',
  address: '77 T chemin du Maniron',
  contactEmail: 'sksr.club@yahoo.fr',
  contactPhone: '0692934246',
  siret: '79857312700015',
  legalMentions: 'Association loi 1901',
  vitrinePaletteJson: { ink: '#0a0908', accent: '#c9a96a', paper: '#f5f1e8' },
};

type Where = { id: string };

function monde(row: typeof CLUB_ROW | null = CLUB_ROW) {
  const inner = {
    registerDomain: jest.fn(async (fqdn: string) => ({
      providerDomainId: `p-${fqdn}`,
      records: [],
    })),
    refreshDomain: jest.fn(async (id: string) => ({
      providerDomainId: id,
      records: [],
      verified: true,
      failed: false,
    })),
    sendEmail: jest.fn(async (_params: SendClubEmailParams) => ({
      providerMessageId: 'mid-1',
    })),
  };
  const prisma = {
    club: {
      // Le double honore le `where` qu'on lui passe : si le transport
      // oubliait le clubId, il servirait la charte d'un autre club.
      findUnique: jest.fn(async ({ where }: { where: Where }) =>
        row && where.id === CLUB ? { ...row } : null,
      ),
    },
  };
  const transport = new BrandedMailTransport(
    inner as unknown as MailTransport,
    prisma as unknown as PrismaService,
  );
  return { transport, inner, prisma };
}

/** Paramètres réellement remis au transport réel. */
function dernierEnvoi(inner: { sendEmail: jest.Mock }): SendClubEmailParams {
  const calls = inner.sendEmail.mock.calls;
  if (!calls.length) {
    throw new Error("le transport réel n'a pas été appelé");
  }
  return calls[calls.length - 1][0] as SendClubEmailParams;
}

function params(over: Partial<SendClubEmailParams> = {}): SendClubEmailParams {
  return {
    clubId: CLUB,
    kind: 'transactional',
    from: { name: 'SKSR', address: 'noreply@clubflow.topdigital.re' },
    to: 'membre@exemple.fr',
    subject: 'Objet',
    html: '<p>Bonjour,</p>',
    text: 'Bonjour,',
    ...over,
  };
}

describe('BrandedMailTransport.sendEmail', () => {
  it('habille le corps de la charte du club avant de l’expédier', async () => {
    const w = monde();

    await w.transport.sendEmail(params());

    const envoye = dernierEnvoi(w.inner);
    expect(isFullHtmlDocument(envoye.html)).toBe(true);
    expect(envoye.html).toContain('<p>Bonjour,</p>');
    expect(envoye.html).toContain('#0a0908');
    expect(envoye.html).toContain('Shotokan Karaté Sud Réunion');
  });

  it('laisse passer intacts destinataire, objet, expéditeur et pièces jointes', async () => {
    const w = monde();
    const piece = {
      filename: 'facture.pdf',
      content: Buffer.from('x'),
      contentType: 'application/pdf',
    };

    await w.transport.sendEmail(params({ attachments: [piece], replyTo: 'a@b.fr' }));

    const envoye = dernierEnvoi(w.inner);
    expect(envoye.to).toBe('membre@exemple.fr');
    expect(envoye.subject).toBe('Objet');
    expect(envoye.from).toEqual({
      name: 'SKSR',
      address: 'noreply@clubflow.topdigital.re',
    });
    expect(envoye.replyTo).toBe('a@b.fr');
    expect(envoye.attachments).toEqual([piece]);
    expect(envoye.clubId).toBe(CLUB);
    expect(envoye.kind).toBe('transactional');
  });

  it('complète la version texte de la signature du club', async () => {
    const w = monde();

    await w.transport.sendEmail(params());

    const envoye = dernierEnvoi(w.inner);
    expect(envoye.text).toContain('Bonjour,');
    expect(envoye.text).toContain('Shotokan Karaté Sud Réunion');
    expect(envoye.text).toContain('sksr.club@yahoo.fr');
  });

  it('n’invente pas de version texte quand l’appelant n’en fournit pas', async () => {
    const w = monde();

    await w.transport.sendEmail(params({ text: undefined }));

    const envoye = dernierEnvoi(w.inner);
    expect(envoye.text).toBeUndefined();
  });

  it('reprend dans le pied le lien de désinscription destiné à un humain', async () => {
    const w = monde();

    await w.transport.sendEmail(
      params({
        kind: 'campaign',
        listUnsubscribe:
          '<https://api.test/mail/unsubscribe?token=t>, <https://portail.test/desinscription?token=t>',
      }),
    );

    const envoye = dernierEnvoi(w.inner);
    expect(envoye.html).toContain('https://portail.test/desinscription?token=t');
    expect(envoye.text).toContain('https://portail.test/desinscription?token=t');
    // L'en-tête d'origine part tel quel : c'est lui que Gmail appelle.
    expect(envoye.listUnsubscribe).toBe(
      '<https://api.test/mail/unsubscribe?token=t>, <https://portail.test/desinscription?token=t>',
    );
  });

  it('expédie quand même si le club est introuvable, habillé en plateforme', async () => {
    const w = monde(null);

    const res = await w.transport.sendEmail(params());

    expect(res.providerMessageId).toBe('mid-1');
    const envoye = dernierEnvoi(w.inner);
    expect(envoye.html).toContain('ClubFlow');
    expect(envoye.html).not.toContain('#c9a96a');
  });

  it('lit la charte du club nommé dans l’envoi, pas d’un autre', async () => {
    const w = monde();

    await w.transport.sendEmail(params({ clubId: 'club-2' }));

    expect(w.prisma.club.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'club-2' } }),
    );
    const envoye = dernierEnvoi(w.inner);
    expect(envoye.html).not.toContain('Shotokan');
  });

  it('remonte l’échec du transport réel au lieu de l’avaler', async () => {
    const w = monde();
    w.inner.sendEmail.mockRejectedValueOnce(new Error('SMTP down'));

    await expect(w.transport.sendEmail(params())).rejects.toThrow('SMTP down');
  });
});

describe('BrandedMailTransport — opérations de domaine', () => {
  it('délègue sans rien changer', async () => {
    const w = monde();

    await expect(w.transport.registerDomain('exemple.fr')).resolves.toEqual({
      providerDomainId: 'p-exemple.fr',
      records: [],
    });
    await expect(w.transport.refreshDomain('p-1')).resolves.toMatchObject({
      verified: true,
    });
  });
});

describe('humanUnsubscribeUrl', () => {
  it('prend la dernière URL, celle de la page du portail', () => {
    expect(
      humanUnsubscribeUrl('<https://api.test/mail/unsubscribe?t=1>, <https://portail.test/d?t=1>'),
    ).toBe('https://portail.test/d?t=1');
  });

  it('ignore un mailto et rend null quand il n’y a rien d’exploitable', () => {
    expect(humanUnsubscribeUrl('<mailto:stop@exemple.fr>')).toBeNull();
    expect(humanUnsubscribeUrl(undefined)).toBeNull();
    expect(humanUnsubscribeUrl('')).toBeNull();
  });
});

describe('BrandedMailTransport — texte d’aperçu', () => {
  it('pose le preheader fourni, une seule fois échappé', async () => {
    const w = monde();

    await w.transport.sendEmail(
      params({ preheader: 'Marie O’Brien & fils vous invitent' }),
    );

    const envoye = dernierEnvoi(w.inner);
    expect(envoye.html).toContain('Marie O’Brien &amp; fils vous invitent');
    expect(envoye.html).not.toContain('&amp;amp;');
  });

  it('n’insère rien quand l’appelant n’en fournit pas', async () => {
    const w = monde();

    await w.transport.sendEmail(params());

    expect(dernierEnvoi(w.inner).html).not.toContain('display:none');
  });
});
