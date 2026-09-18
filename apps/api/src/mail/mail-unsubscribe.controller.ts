import { BadRequestException, Body, Controller, HttpCode, Post, Query } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { PrismaService } from '../prisma/prisma.service';
import { ClubSendingDomainService } from './club-sending-domain.service';
import { readUnsubscribeToken, unsubscribeSecret } from './unsubscribe-token';

/**
 * Désinscription des campagnes, sans compte ni session.
 *
 * Deux usages, un seul chemin :
 * - la boîte mail du destinataire, qui poste toute seule sur l'URL de
 *   `List-Unsubscribe` quand il clique « Se désabonner » (RFC 8058) ;
 * - la page du portail, qui poste la même chose pour celui qui suit le lien.
 *
 * Le jeton signé porte le club et l'adresse : rien d'autre n'est accepté, et
 * aucune information n'est rendue sur l'existence de l'adresse.
 */
@Controller('mail')
export class MailUnsubscribeController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly domains: ClubSendingDomainService,
  ) {}

  @Post('unsubscribe')
  @HttpCode(200)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  async unsubscribe(
    @Query('token') tokenQuery?: string,
    @Body() body?: { token?: string },
  ): Promise<{ ok: true; clubName: string | null }> {
    const token = (tokenQuery ?? body?.token ?? '').trim();
    const secret = unsubscribeSecret();
    const claim = secret ? readUnsubscribeToken(token, secret) : null;
    if (!claim) {
      throw new BadRequestException('Lien de désinscription invalide.');
    }
    const club = await this.prisma.club.findUnique({
      where: { id: claim.clubId },
      select: { id: true, name: true },
    });
    if (!club) {
      throw new BadRequestException('Lien de désinscription invalide.');
    }
    await this.domains.upsertSuppression(
      club.id,
      claim.email,
      'desinscription',
    );
    return { ok: true, clubName: club.name };
  }
}
