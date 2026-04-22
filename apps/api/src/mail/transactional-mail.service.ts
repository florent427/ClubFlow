import { BadRequestException, Injectable, Inject } from '@nestjs/common';
import { MAIL_TRANSPORT } from './mail.constants';
import type { MailTransport } from './mail-transport.interface';
import { ClubSendingDomainService } from './club-sending-domain.service';

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

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

  /**
   * Invitation Telegram : bouton CTA + texte (HTML compatible clients mail).
   */
  async sendTelegramInviteEmail(
    clubId: string,
    to: string,
    options: {
      clubName: string;
      memberFirstName: string;
      inviteUrl: string;
      expiresAt: Date;
    },
  ): Promise<void> {
    const trimmed = to.trim();
    if (!trimmed || !trimmed.includes('@')) {
      throw new BadRequestException('Adresse e-mail invalide');
    }
    const profile = await this.domains.getVerifiedMailProfile(
      clubId,
      'transactional',
    );
    const { clubName, memberFirstName, inviteUrl, expiresAt } = options;
    const safeClub = escapeHtml(clubName);
    const safeFirst = escapeHtml(memberFirstName.trim() || 'Bonjour');
    const expiresFr = expiresAt.toLocaleString('fr-FR', {
      dateStyle: 'long',
      timeStyle: 'short',
    });
    const subject = `${clubName} — Reliez Telegram pour recevoir les messages du club`;
    const html = `
<!DOCTYPE html>
<html lang="fr">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="margin:0;padding:0;background:#f4f6f8;font-family:Georgia,'Times New Roman',serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4f6f8;padding:24px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:520px;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(15,23,42,0.08);">
          <tr>
            <td style="background:linear-gradient(135deg,#0f766e 0%,#134e4a 100%);padding:28px 24px;text-align:center;">
              <p style="margin:0;font-size:13px;letter-spacing:0.12em;text-transform:uppercase;color:rgba(255,255,255,0.85);">ClubFlow</p>
              <h1 style="margin:8px 0 0;font-size:22px;line-height:1.25;color:#ffffff;font-weight:600;">${safeClub}</h1>
            </td>
          </tr>
          <tr>
            <td style="padding:28px 24px 8px;color:#1e293b;font-size:16px;line-height:1.6;">
              <p style="margin:0 0 16px;">Bonjour ${safeFirst},</p>
              <p style="margin:0 0 16px;">Pour recevoir les messages du club sur <strong>Telegram</strong>, ouvrez le bouton ci-dessous depuis votre téléphone (l’application Telegram s’ouvrira).</p>
            </td>
          </tr>
          <tr>
            <td align="center" style="padding:8px 24px 28px;">
              <a href="${inviteUrl}" style="display:inline-block;padding:14px 28px;background:#0d9488;color:#ffffff;text-decoration:none;font-weight:600;font-size:16px;border-radius:999px;font-family:system-ui,-apple-system,sans-serif;">Ouvrir dans Telegram</a>
            </td>
          </tr>
          <tr>
            <td style="padding:0 24px 24px;color:#64748b;font-size:13px;line-height:1.5;border-top:1px solid #e2e8f0;">
              <p style="margin:16px 0 8px;">Ce lien expire le <strong>${escapeHtml(expiresFr)}</strong>.</p>
              <p style="margin:0;">Si le bouton ne fonctionne pas, copiez ce lien dans votre navigateur :<br/><span style="word-break:break-all;color:#0f766e;">${escapeHtml(inviteUrl)}</span></p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`.trim();
    const text = [
      `Bonjour ${memberFirstName.trim() || ''},`,
      '',
      `${clubName} vous invite à relier Telegram pour recevoir les messages du club.`,
      '',
      `Ouvrez ce lien (depuis le téléphone de préférence) : ${inviteUrl}`,
      '',
      `Ce lien expire le ${expiresFr}.`,
    ]
      .filter(Boolean)
      .join('\n');
    await this.transport.sendEmail({
      clubId,
      kind: 'transactional',
      from: profile.from,
      to: trimmed,
      subject,
      html,
      text,
    });
  }

  async sendPasswordResetLink(
    clubId: string,
    to: string,
    resetUrl: string,
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
      subject: 'ClubFlow — réinitialisation de votre mot de passe',
      html: `<p>Bonjour,</p><p>Vous avez demandé à réinitialiser votre mot de passe. Ce lien est valable 1 heure :</p><p><a href="${resetUrl}">Réinitialiser mon mot de passe</a></p><p>Lien (copier-coller) : ${resetUrl}</p><p>Si vous n'êtes pas à l'origine de cette demande, ignorez cet e-mail.</p>`,
      text: `Réinitialisez votre mot de passe en ouvrant ce lien (valable 1 heure) : ${resetUrl}`,
    });
  }

  /**
   * Invitation à rejoindre un foyer familial (co-payeur ou observateur).
   * Envoyée par un parent/payeur via le portail membre.
   */
  async sendFamilyInviteEmail(
    clubId: string,
    to: string,
    options: {
      clubName: string;
      inviterName: string;
      role: 'COPAYER' | 'VIEWER';
      inviteUrl: string;
      code: string;
      expiresAt: Date;
    },
  ): Promise<void> {
    const trimmed = to.trim();
    if (!trimmed || !trimmed.includes('@')) {
      throw new BadRequestException('Adresse e-mail invalide');
    }
    const profile = await this.domains.getVerifiedMailProfile(
      clubId,
      'transactional',
    );
    const { clubName, inviterName, role, inviteUrl, code, expiresAt } = options;
    const safeClub = escapeHtml(clubName);
    const safeInviter = escapeHtml(inviterName.trim() || 'Un parent');
    const safeCode = escapeHtml(code);
    const safeUrl = escapeHtml(inviteUrl);
    const expiresFr = expiresAt.toLocaleString('fr-FR', {
      dateStyle: 'long',
      timeStyle: 'short',
    });
    const roleLabel = role === 'COPAYER' ? 'co-payeur' : 'observateur';
    const roleHint =
      role === 'COPAYER'
        ? 'En tant que co-payeur, vous créerez un foyer relié au sien et partagerez les factures et les enfants.'
        : 'En tant qu’observateur, vous rejoindrez directement son foyer en lecture seule.';
    const subject = `${clubName} — ${safeInviter} vous invite à rejoindre son espace familial`;
    const html = `
<!DOCTYPE html>
<html lang="fr">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="margin:0;padding:0;background:#f4f6f8;font-family:Georgia,'Times New Roman',serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4f6f8;padding:24px 12px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:520px;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(15,23,42,0.08);">
        <tr><td style="background:linear-gradient(135deg,#1a237e 0%,#303f9f 100%);padding:28px 24px;text-align:center;">
          <p style="margin:0;font-size:13px;letter-spacing:0.12em;text-transform:uppercase;color:rgba(255,255,255,0.85);">ClubFlow</p>
          <h1 style="margin:8px 0 0;font-size:22px;line-height:1.25;color:#ffffff;font-weight:600;">${safeClub}</h1>
        </td></tr>
        <tr><td style="padding:28px 24px 8px;color:#1e293b;font-size:16px;line-height:1.6;">
          <p style="margin:0 0 16px;">Bonjour,</p>
          <p style="margin:0 0 16px;"><strong>${safeInviter}</strong> vous invite à rejoindre son espace familial sur ${safeClub} en tant que <strong>${roleLabel}</strong>.</p>
          <p style="margin:0 0 16px;color:#475569;font-size:14px;">${roleHint}</p>
        </td></tr>
        <tr><td align="center" style="padding:8px 24px 20px;">
          <a href="${safeUrl}" style="display:inline-block;padding:14px 28px;background:#1a237e;color:#ffffff;text-decoration:none;font-weight:600;font-size:16px;border-radius:999px;font-family:system-ui,-apple-system,sans-serif;">Accepter l'invitation</a>
        </td></tr>
        <tr><td style="padding:0 24px 20px;color:#475569;font-size:14px;line-height:1.5;text-align:center;">
          <p style="margin:0 0 8px;">Ou utilisez ce code :</p>
          <p style="margin:0;padding:10px 16px;background:#f1f5f9;border-radius:8px;display:inline-block;font-family:ui-monospace,monospace;font-size:18px;font-weight:700;letter-spacing:0.1em;color:#1e293b;">${safeCode}</p>
        </td></tr>
        <tr><td style="padding:0 24px 24px;color:#64748b;font-size:13px;line-height:1.5;border-top:1px solid #e2e8f0;">
          <p style="margin:16px 0 8px;">Cette invitation expire le <strong>${escapeHtml(expiresFr)}</strong>.</p>
          <p style="margin:0;">Si le bouton ne fonctionne pas, copiez ce lien :<br/><span style="word-break:break-all;color:#1a237e;">${safeUrl}</span></p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`.trim();
    const text = [
      `Bonjour,`,
      '',
      `${inviterName.trim() || 'Un parent'} vous invite à rejoindre son espace familial sur ${clubName} en tant que ${roleLabel}.`,
      '',
      roleHint,
      '',
      `Lien d'invitation : ${inviteUrl}`,
      `Code : ${code}`,
      '',
      `Ce lien expire le ${expiresFr}.`,
    ].join('\n');
    await this.transport.sendEmail({
      clubId,
      kind: 'transactional',
      from: profile.from,
      to: trimmed,
      subject,
      html,
      text,
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
