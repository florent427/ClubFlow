import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ClubPaymentMethod } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Service de gestion des routes de paiement (mapping
 * `ClubPaymentMethod → ClubFinancialAccount`).
 *
 * En v1 : 1 route par (clubId, method). Pas de discriminator
 * (multi-Stripe) ; à ajouter en v2 si nécessaire.
 */
@Injectable()
export class ClubPaymentRoutesService {
  constructor(private readonly prisma: PrismaService) {}

  async listAll(clubId: string) {
    return this.prisma.clubPaymentRoute.findMany({
      where: { clubId },
      orderBy: { method: 'asc' },
      include: {
        financialAccount: { include: { accountingAccount: true } },
      },
    });
  }

  /**
   * Upsert d'une route. Si une route existe déjà pour ce (clubId, method),
   * on la met à jour. Sinon on la crée.
   *
   * Vérifie que le `financialAccountId` cible appartient au club et est
   * actif (pas de routage vers un compte archivé).
   */
  async upsert(
    clubId: string,
    method: ClubPaymentMethod,
    financialAccountId: string,
  ) {
    const fin = await this.prisma.clubFinancialAccount.findFirst({
      where: { clubId, id: financialAccountId },
    });
    if (!fin) {
      throw new NotFoundException('Compte financier introuvable');
    }
    if (!fin.isActive) {
      throw new BadRequestException(
        'Impossible de router vers un compte archivé.',
      );
    }
    return this.prisma.clubPaymentRoute.upsert({
      where: { clubId_method: { clubId, method } },
      create: {
        clubId,
        method,
        financialAccountId,
        isDefault: true,
      },
      update: {
        financialAccountId,
      },
      include: {
        financialAccount: { include: { accountingAccount: true } },
      },
    });
  }

  /**
   * Suppression d'une route — le routage retombe alors sur la cascade
   * `kindFromMethod` puis fallback BANK.
   */
  async delete(clubId: string, id: string): Promise<boolean> {
    const route = await this.prisma.clubPaymentRoute.findFirst({
      where: { clubId, id },
    });
    if (!route) throw new NotFoundException('Route introuvable');
    await this.prisma.clubPaymentRoute.delete({ where: { id } });
    return true;
  }
}
