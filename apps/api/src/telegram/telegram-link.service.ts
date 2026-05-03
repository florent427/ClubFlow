import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomBytes } from 'crypto';
import { TransactionalMailService } from '../mail/transactional-mail.service';
import { resolveMemberMailRecipients } from '../members/member-mail-recipients';
import { PrismaService } from '../prisma/prisma.service';

const LINK_TTL_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class TelegramLinkService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly transactionalMail: TransactionalMailService,
  ) {}

  private botUsername(): string {
    const u = process.env.TELEGRAM_BOT_USERNAME?.trim();
    if (!u) {
      throw new BadRequestException(
        'TELEGRAM_BOT_USERNAME manquant (nom du bot sans @, ex. MonClub_bot).',
      );
    }
    return u.replace(/^@/, '');
  }

  /**
   * Crée un jeton et retourne l’URL https://t.me/Bot?start=TOKEN
   */
  async createInviteLink(
    clubId: string,
    memberId: string,
  ): Promise<{ url: string; expiresAt: Date; emailSent: boolean }> {
    if (!process.env.TELEGRAM_BOT_TOKEN?.trim()) {
      throw new BadRequestException(
        'TELEGRAM_BOT_TOKEN manquant : impossible de générer un lien.',
      );
    }
    const username = this.botUsername();
    const member = await this.prisma.member.findFirst({
      where: { id: memberId, clubId },
      include: { club: { select: { name: true } } },
    });
    if (!member) {
      throw new NotFoundException('Membre introuvable');
    }
    if (member.telegramChatId) {
      throw new BadRequestException('Ce membre a déjà relié Telegram.');
    }
    // Destinataires du mail Telegram : le member lui-même + les
    // payeurs de son foyer. Permet aux parents de toujours recevoir
    // l'info même si l'enfant a une adresse perso.
    const recipients = await resolveMemberMailRecipients(
      this.prisma,
      memberId,
    );
    if (recipients.length === 0) {
      throw new BadRequestException(
        'Aucune adresse e-mail valide (ni sur le membre, ni sur les payeurs du foyer) pour envoyer l’invitation Telegram.',
      );
    }
    // Filtre les adresses en liste de suppression (un payeur peut
    // l'être individuellement sans bloquer les autres).
    const suppressedRows = await this.prisma.emailSuppression.findMany({
      where: { clubId, emailNormalized: { in: recipients } },
      select: { emailNormalized: true },
    });
    const suppressed = new Set(suppressedRows.map((r) => r.emailNormalized));
    const allowed = recipients.filter((r) => !suppressed.has(r));
    if (allowed.length === 0) {
      throw new BadRequestException(
        'Toutes les adresses sont en liste de suppression — envoi refusé.',
      );
    }
    const emailTo = allowed.join(', ');
    const token = randomBytes(16).toString('hex');
    const expiresAt = new Date(Date.now() + LINK_TTL_MS);
    await this.prisma.telegramLinkToken.create({
      data: {
        clubId,
        memberId,
        token,
        expiresAt,
      },
    });
    const url = `https://t.me/${username}?start=${token}`;
    await this.transactionalMail.sendTelegramInviteEmail(clubId, emailTo, {
      clubName: member.club.name,
      memberFirstName: member.firstName,
      inviteUrl: url,
      expiresAt,
    });
    return { url, expiresAt, emailSent: true };
  }

  async disconnectTelegram(clubId: string, memberId: string): Promise<boolean> {
    const m = await this.prisma.member.findFirst({
      where: { id: memberId, clubId },
    });
    if (!m) {
      throw new NotFoundException('Membre introuvable');
    }
    await this.prisma.member.update({
      where: { id: memberId },
      data: { telegramChatId: null, telegramLinkedAt: null },
    });
    return true;
  }

  /**
   * Traite un message entrant /start TOKEN (webhook Telegram).
   */
  async consumeStartPayload(
    token: string,
    telegramChatId: string,
  ): Promise<void> {
    const row = await this.prisma.telegramLinkToken.findUnique({
      where: { token },
    });
    if (!row || row.consumedAt) {
      return;
    }
    if (row.expiresAt.getTime() < Date.now()) {
      return;
    }
    await this.prisma.$transaction([
      this.prisma.member.update({
        where: { id: row.memberId },
        data: {
          telegramChatId,
          telegramLinkedAt: new Date(),
        },
      }),
      this.prisma.telegramLinkToken.update({
        where: { id: row.id },
        data: { consumedAt: new Date() },
      }),
    ]);
  }
}
