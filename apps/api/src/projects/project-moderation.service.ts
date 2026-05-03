import { Injectable, Logger } from '@nestjs/common';
import type { ProjectLiveItem } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Modération IA des items live (photos / vidéos).
 *
 * **v1 (stub)** : décision par défaut = APPROVED, score 0.8, reason vide.
 * L'objectif de ce premier jet est de débloquer la pipeline complète
 * (submit → aiDecision → humanDecision → publication). La vraie intégration
 * OpenRouter vision (analyse pertinence + qualité photo / NSFW) viendra
 * dans un patch suivant, sans rien changer à la signature de `moderate()`.
 *
 * Garantie v1 : si la pipeline crash (dépassement quota IA, API down…),
 * on écrit `aiDecision=ERROR` et on laisse à l'admin la revue humaine.
 * L'item n'est JAMAIS publié automatiquement sans validation humaine.
 */
@Injectable()
export class ProjectModerationService {
  private readonly logger = new Logger(ProjectModerationService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Décision IA sur un item fraîchement uploadé. Renvoie la ligne mise
   * à jour (aiDecision / aiReason / aiScore / aiCheckedAt).
   */
  async moderate(itemId: string): Promise<ProjectLiveItem> {
    const item = await this.prisma.projectLiveItem.findUnique({
      where: { id: itemId },
    });
    if (!item) {
      throw new Error(`ProjectLiveItem ${itemId} introuvable`);
    }
    try {
      // TODO(v1.1) : appel OpenRouter vision avec prompt contextualisé
      // (titre projet, description, samples d'items déjà approuvés) →
      // JSON strict `{ approved, reason, score }`.
      // Pour l'instant, stub optimiste — les items passent tous à
      // APPROVED IA et attendent la revue humaine qui est la source de
      // vérité pour la publication.
      return await this.prisma.projectLiveItem.update({
        where: { id: item.id },
        data: {
          aiDecision: 'APPROVED',
          aiScore: 0.8,
          aiReason: null,
          aiCheckedAt: new Date(),
        },
      });
    } catch (err) {
      this.logger.warn(
        `moderate(${itemId}) failed — falling back to ERROR : ${
          err instanceof Error ? err.message : err
        }`,
      );
      return this.prisma.projectLiveItem.update({
        where: { id: item.id },
        data: {
          aiDecision: 'ERROR',
          aiReason:
            'Erreur technique durant la modération IA — revue humaine requise.',
          aiCheckedAt: new Date(),
        },
      });
    }
  }
}
