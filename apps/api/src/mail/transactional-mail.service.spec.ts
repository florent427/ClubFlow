import { BadRequestException } from '@nestjs/common';
import { TransactionalMailService } from './transactional-mail.service';

function makeDomains() {
  return {
    getAuthMailProfile: jest.fn().mockResolvedValue({
      fqdn: 'mail.demo.fr',
      from: { name: 'Demo', address: 'noreply@mail.demo.fr' },
    }),
    getVerifiedMailProfile: jest.fn(),
  };
}

function makeTransport() {
  return {
    sendEmail: jest.fn().mockResolvedValue({ providerMessageId: 'msg-1' }),
    registerDomain: jest.fn(),
    refreshDomain: jest.fn(),
  };
}

function makeService() {
  const domains = makeDomains();
  const transport = makeTransport();
  const svc = new TransactionalMailService(
    domains as never,
    transport as never,
  );
  return { svc, domains, transport };
}

const OPTIONS = {
  clubName: 'Demo',
  visitorName: 'Jean Dupont',
  visitorEmail: 'jean@example.fr',
  visitorPhone: '0692 00 00 00',
  message: 'Bonjour,\nje voudrais un cours d’essai.',
};

describe('TransactionalMailService.sendVitrineContactMessage', () => {
  it('refuse un destinataire invalide sans rien envoyer', async () => {
    const { svc, transport } = makeService();
    await expect(
      svc.sendVitrineContactMessage('club-1', 'pas-un-email', OPTIONS),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(transport.sendEmail).not.toHaveBeenCalled();
  });

  it('envoie au club, From du profil, Reply-To sur le visiteur', async () => {
    const { svc, domains, transport } = makeService();
    await svc.sendVitrineContactMessage('club-1', ' bureau@demo.fr ', OPTIONS);
    expect(domains.getAuthMailProfile).toHaveBeenCalledWith('club-1');
    expect(transport.sendEmail).toHaveBeenCalledTimes(1);
    const sent = transport.sendEmail.mock.calls[0][0];
    expect(sent).toMatchObject({
      clubId: 'club-1',
      kind: 'transactional',
      from: { name: 'Demo', address: 'noreply@mail.demo.fr' },
      to: 'bureau@demo.fr',
      replyTo: 'jean@example.fr',
    });
    expect(sent.subject).toBe(
      'Demo — Nouveau message de Jean Dupont via le site',
    );
    expect(sent.text).toContain('Jean Dupont');
    expect(sent.text).toContain('jean@example.fr');
    expect(sent.text).toContain('0692 00 00 00');
    expect(sent.text).toContain('je voudrais un cours d’essai.');
    expect(sent.html).toContain('0692 00 00 00');
  });

  it('échappe le HTML fourni par le visiteur', async () => {
    const { svc, transport } = makeService();
    await svc.sendVitrineContactMessage('club-1', 'bureau@demo.fr', {
      ...OPTIONS,
      visitorName: '<b>Jean</b>',
      message: '<script>alert(1)</script> & "quotes"',
    });
    const sent = transport.sendEmail.mock.calls[0][0];
    expect(sent.html).not.toContain('<script>');
    expect(sent.html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(sent.html).toContain('&amp; &quot;quotes&quot;');
    expect(sent.html).toContain('&lt;b&gt;Jean&lt;/b&gt;');
    // Le texte brut, lui, reste tel quel.
    expect(sent.text).toContain('<script>alert(1)</script>');
  });

  it('omet le téléphone quand absent et nomme « Visiteur » sans nom', async () => {
    const { svc, transport } = makeService();
    await svc.sendVitrineContactMessage('club-1', 'bureau@demo.fr', {
      ...OPTIONS,
      visitorName: '  ',
      visitorPhone: null,
    });
    const sent = transport.sendEmail.mock.calls[0][0];
    expect(sent.subject).toBe('Demo — Nouveau message de Visiteur via le site');
    expect(sent.text).not.toContain('Téléphone');
    expect(sent.html).not.toContain('Téléphone');
  });

  it('neutralise les retours à la ligne du nom dans le Subject', async () => {
    const { svc, transport } = makeService();
    await svc.sendVitrineContactMessage('club-1', 'bureau@demo.fr', {
      ...OPTIONS,
      visitorName: 'Jean\r\nBcc: victime@example.fr',
    });
    const sent = transport.sendEmail.mock.calls[0][0];
    expect(sent.subject).not.toMatch(/[\r\n]/);
    expect(sent.subject).toContain('Jean Bcc: victime@example.fr');
  });
});

describe('TransactionalMailService.sendShopDeliveryNote', () => {
  const PDF = Buffer.from('%PDF-bon');
  const OPTS = {
    clubName: 'Dojo <Sud>',
    buyerName: 'Camillah & co',
    orderReference: 'CMD-ABCDEF12',
    deliveredAt: new Date('2026-09-13T15:00:00Z'),
    pdf: PDF,
  };

  it('refuse une adresse invalide sans rien envoyer', async () => {
    const { svc, transport } = makeService();

    await expect(
      svc.sendShopDeliveryNote('club-1', 'pas-un-email', OPTS),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(transport.sendEmail).not.toHaveBeenCalled();
  });

  it('joint le PDF, depuis le profil du club, contenu échappé', async () => {
    const { svc, domains, transport } = makeService();

    await svc.sendShopDeliveryNote('club-1', ' maman@example.fr ', OPTS);

    expect(domains.getAuthMailProfile).toHaveBeenCalledWith('club-1');
    const sent = transport.sendEmail.mock.calls[0][0];
    expect(sent).toMatchObject({
      clubId: 'club-1',
      kind: 'transactional',
      from: { name: 'Demo', address: 'noreply@mail.demo.fr' },
      to: 'maman@example.fr',
      subject: 'Bon de livraison — Dojo <Sud>',
    });
    expect(sent.attachments).toEqual([
      {
        filename: 'Bon_de_livraison_CMD-ABCDEF12.pdf',
        content: PDF,
        contentType: 'application/pdf',
      },
    ]);
    expect(sent.html).toContain('Dojo &lt;Sud&gt;');
    expect(sent.html).toContain('Camillah &amp; co');
    expect(sent.html).not.toContain('<Sud>');
    expect(sent.text).toContain('retirée le 13/09/2026');
  });
});

describe('TransactionalMailService.sendShopExchangeNote', () => {
  const PDF = Buffer.from('%PDF-echange');
  const OPTS = {
    clubName: 'Dojo <Sud>',
    buyerName: 'Camillah & co',
    exchangeReference: 'ECH-12345678',
    orderReference: 'CMD-ABCDEF12',
    exchangedAt: new Date('2026-09-14T15:00:00Z'),
    pdf: PDF,
  };

  it('refuse une adresse invalide sans rien envoyer', async () => {
    const { svc, transport } = makeService();

    await expect(
      svc.sendShopExchangeNote('club-1', 'pas-un-email', OPTS),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(transport.sendEmail).not.toHaveBeenCalled();
  });

  it('joint le bon d’échange, depuis le profil du club, contenu échappé', async () => {
    const { svc, domains, transport } = makeService();

    await svc.sendShopExchangeNote('club-1', ' maman@example.fr ', OPTS);

    expect(domains.getAuthMailProfile).toHaveBeenCalledWith('club-1');
    const sent = transport.sendEmail.mock.calls[0][0];
    expect(sent).toMatchObject({
      clubId: 'club-1',
      kind: 'transactional',
      from: { name: 'Demo', address: 'noreply@mail.demo.fr' },
      to: 'maman@example.fr',
      subject: 'Bon d’échange — Dojo <Sud>',
    });
    expect(sent.attachments).toEqual([
      expect.objectContaining({
        filename: expect.stringContaining('ECH-12345678'),
        content: PDF,
        contentType: 'application/pdf',
      }),
    ]);
    expect(sent.html).toContain('ECH-12345678');
    expect(sent.html).toContain('CMD-ABCDEF12');
    expect(sent.html).toContain('Dojo &lt;Sud&gt;');
    expect(sent.html).toContain('Camillah &amp; co');
    expect(sent.html).not.toContain('<Sud>');
    expect(sent.text).toContain('du 14/09/2026');
  });
});
