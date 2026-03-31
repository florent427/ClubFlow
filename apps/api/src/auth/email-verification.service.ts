import { createHmac, randomBytes } from 'crypto';
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class EmailVerificationService {
  constructor(private readonly prisma: PrismaService) {}

  private getPepper(): string {
    return (
      process.env.EMAIL_VERIFICATION_SECRET ??
      process.env.JWT_SECRET ??
      'change-me-in-development'
    );
  }

  hashRawToken(raw: string): string {
    return createHmac('sha256', this.getPepper()).update(raw).digest('hex');
  }

  generateRawToken(): string {
    return randomBytes(32).toString('base64url');
  }

  /** Crée un jeton valide 48h ; invalide les jetons non consommés précédents pour ce user. */
  async issueTokenForUser(userId: string): Promise<string> {
    await this.prisma.emailVerificationToken.deleteMany({
      where: { userId, consumedAt: null },
    });
    const raw = this.generateRawToken();
    const tokenHash = this.hashRawToken(raw);
    const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000);
    await this.prisma.emailVerificationToken.create({
      data: { userId, tokenHash, expiresAt },
    });
    return raw;
  }

  /** Retourne userId si jeton valide ; marque consommé. */
  async consumeRawToken(
    raw: string,
  ): Promise<{ userId: string } | null> {
    const trimmed = raw.trim();
    if (!trimmed) return null;
    const tokenHash = this.hashRawToken(trimmed);
    const row = await this.prisma.emailVerificationToken.findFirst({
      where: {
        tokenHash,
        consumedAt: null,
        expiresAt: { gt: new Date() },
      },
    });
    if (!row) return null;
    await this.prisma.emailVerificationToken.update({
      where: { id: row.id },
      data: { consumedAt: new Date() },
    });
    return { userId: row.userId };
  }
}
