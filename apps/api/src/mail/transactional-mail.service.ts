import { BadRequestException, Injectable, Inject } from '@nestjs/common';
import { MAIL_TRANSPORT } from './mail.constants';
import type { MailTransport } from './mail-transport.interface';
import { ClubSendingDomainService } from './club-sending-domain.service';

@Injectable()
export class TransactionalMailService {
  constructor(
    private readonly domains: ClubSendingDomainService,
    @Inject(MAIL_TRANSPORT) private readonly transport: MailTransport,
  ) {}

  async sendEmailVerificationLink(
    clubId: string,
    to: string,
    verifyUrl: string,
  ): Promise<void> {
    const trimmed = to.trim();
    if (!trimmed || !trimmed.includes('@')) {
      throw new BadRequestException('Adresse e-mail invalide');
    }
    const profile = await this.domains.getVerifiedMailProfile(
      clubId,
      'transactional',
    );
    await this.transport.sendEmail({
      clubId,
      kind: 'transactional',
      from: profile.from,
      to: trimmed,
      subject: 'ClubFlow — confirmez votre adresse e-mail',
      html: `<p>Bonjour,</p><p>Pour activer votre compte, veuillez confirmer votre adresse e-mail :</p><p><a href="${verifyUrl}">Confirmer mon e-mail</a></p><p>Lien (copier-coller) : ${verifyUrl}</p>`,
      text: `Confirmez votre adresse e-mail en ouvrant ce lien : ${verifyUrl}`,
    });
  }

  async sendTestEmail(clubId: string, to: string): Promise<void> {
    const trimmed = to.trim();
    if (!trimmed || !trimmed.includes('@')) {
      throw new BadRequestException('Adresse e-mail invalide');
    }
    const profile = await this.domains.getVerifiedMailProfile(
      clubId,
      'transactional',
    );
    await this.transport.sendEmail({
      clubId,
      kind: 'transactional',
      from: profile.from,
      to: trimmed,
      subject: 'ClubFlow — e-mail de test',
      html: `<p>Ceci est un e-mail de test envoyé depuis ClubFlow pour le club (${clubId}).</p>`,
      text: 'E-mail de test ClubFlow.',
    });
  }
}
