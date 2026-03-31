import { Logger } from '@nestjs/common';
import type { PrismaService } from '../prisma/prisma.service';

/**
 * MVP single-tenant : CLUB_ID doit pointer vers un club existant.
 * Échoue au démarrage si manquant ou invalide.
 */
export async function assertClubIdConfigured(
  prisma: PrismaService,
): Promise<string> {
  const raw = process.env.CLUB_ID?.trim();
  if (!raw) {
    Logger.error(
      'CLUB_ID est requis (UUID du club). Voir apps/api/.env.example.',
    );
    process.exit(1);
  }
  const club = await prisma.club.findUnique({ where: { id: raw } });
  if (!club) {
    Logger.error(
      `CLUB_ID=${raw} : aucun club avec cet identifiant en base.`,
    );
    process.exit(1);
  }
  return raw;
}
