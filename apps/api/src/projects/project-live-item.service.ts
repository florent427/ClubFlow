import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type {
  ProjectLiveItem,
  ProjectLiveItemHumanDecision,
  ProjectLiveItemKind,
  ProjectLiveItemPublication,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ProjectLivePhaseService } from './project-live-phase.service';
import { ProjectModerationService } from './project-moderation.service';
import { ProjectContributorService } from './project-contributor.service';

/**
 * Pilote le flux complet d'un item live :
 *   1. `submit()` par un contributeur (check quota + phase courante)
 *   2. modération IA asynchrone (fire-and-forget)
 *   3. `decideHumanReview()` par un admin (override possible)
 *   4. `publish()` vers VitrineArticle ou ClubAnnouncement
 *   5. `deleteOwn()` par le contributeur (libère un slot quota)
 */
@Injectable()
export class ProjectLiveItemService {
  private readonly logger = new Logger(ProjectLiveItemService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly phases: ProjectLivePhaseService,
    private readonly moderation: ProjectModerationService,
    private readonly contributors: ProjectContributorService,
  ) {}

  // ---------- Queries ----------

  async listForProject(
    clubId: string,
    projectId: string,
    filters: {
      phaseId?: string;
      contributorId?: string;
      humanDecision?: ProjectLiveItemHumanDecision;
    } = {},
  ): Promise<ProjectLiveItem[]> {
    return this.prisma.projectLiveItem.findMany({
      where: {
        projectId,
        project: { clubId },
        ...(filters.phaseId ? { phaseId: filters.phaseId } : {}),
        ...(filters.contributorId
          ? { contributorId: filters.contributorId }
          : {}),
        ...(filters.humanDecision
          ? { humanDecision: filters.humanDecision }
          : {}),
      },
      orderBy: { submittedAt: 'desc' },
      include: {
        mediaAsset: {
          select: { publicUrl: true, mimeType: true, fileName: true },
        },
      },
    });
  }

  async listMineForProject(
    clubId: string,
    userId: string,
    projectId: string,
    userEmail?: string | null,
  ): Promise<ProjectLiveItem[]> {
    const contributor = await this.contributors.isActiveContributor(
      userId,
      projectId,
      userEmail,
    );
    if (!contributor) {
      throw new BadRequestException(
        'Tu n’es pas contributeur actif de ce projet.',
      );
    }
    return this.prisma.projectLiveItem.findMany({
      where: {
        projectId,
        project: { clubId },
        contributorId: contributor.id,
      },
      orderBy: { submittedAt: 'desc' },
      include: {
        mediaAsset: {
          select: { publicUrl: true, mimeType: true, fileName: true },
        },
      },
    });
  }

  /**
   * Compte le quota "actif" d'un contributeur sur une phase donnée. Un
   * item compte s'il n'a pas été REJETÉ (ni humain ni IA rejeté avec
   * décision humaine confirmée). Un rejet libère donc le slot, conforme
   * à la règle métier discutée avec l'utilisateur.
   */
  async countActiveForQuota(
    contributorId: string,
    phaseId: string,
    kind: ProjectLiveItemKind,
  ): Promise<number> {
    return this.prisma.projectLiveItem.count({
      where: {
        contributorId,
        phaseId,
        kind,
        NOT: { humanDecision: 'REJECTED' },
      },
    });
  }

  // ---------- Mutations ----------

  /**
   * Appelée par le contributeur après un upload de MediaAsset (kind IMAGE
   * pour PHOTO, OTHER pour VIDEO). Crée l'item, enclenche la modération
   * IA en arrière-plan et retourne immédiatement.
   */
  async submit(
    clubId: string,
    userId: string,
    input: {
      projectId: string;
      kind: ProjectLiveItemKind;
      mediaAssetId?: string | null;
      textContent?: string | null;
    },
    userEmail?: string | null,
  ): Promise<ProjectLiveItem> {
    const contributor = await this.contributors.isActiveContributor(
      userId,
      input.projectId,
      userEmail,
    );
    if (!contributor) {
      throw new BadRequestException(
        'Tu n’es pas contributeur actif de ce projet.',
      );
    }
    const project = await this.prisma.clubProject.findFirst({
      where: { id: input.projectId, clubId },
      select: {
        id: true,
        maxPhotosPerContributorPerPhase: true,
        maxVideosPerContributorPerPhase: true,
        maxTextsPerContributorPerPhase: true,
      },
    });
    if (!project) throw new NotFoundException('Projet introuvable.');

    // Validation kind-spécifique.
    if (input.kind === 'TEXT') {
      const text = input.textContent?.trim() ?? '';
      if (!text) {
        throw new BadRequestException(
          'Le contenu texte est requis pour une soumission de type TEXT.',
        );
      }
      if (text.length > 4000) {
        throw new BadRequestException(
          'Contenu texte trop long (max 4000 caractères).',
        );
      }
      if (input.mediaAssetId) {
        throw new BadRequestException(
          'Un item TEXT ne peut pas avoir de mediaAssetId.',
        );
      }
    } else {
      // PHOTO / VIDEO → mediaAssetId requis, pas de texte.
      if (!input.mediaAssetId) {
        throw new BadRequestException(
          `mediaAssetId requis pour un item ${input.kind}.`,
        );
      }
      const asset = await this.prisma.mediaAsset.findFirst({
        where: { id: input.mediaAssetId, clubId },
        select: { id: true, mimeType: true },
      });
      if (!asset) {
        throw new NotFoundException('Media asset introuvable pour ce club.');
      }
    }

    // Phase LIVE courante (null si aucun LIVE ouvert actuellement).
    const now = new Date();
    const activePhase = await this.phases.currentLivePhase(
      clubId,
      input.projectId,
      now,
    );
    const submittedDuringLive = activePhase !== null;
    const phaseId = activePhase?.id ?? null;

    // Quota — appliqué uniquement si phase active. Hors-phase, les uploads
    // « tardifs » sont libres (pour rattraper des photos post-fermeture).
    if (phaseId) {
      const used = await this.countActiveForQuota(
        contributor.id,
        phaseId,
        input.kind,
      );
      const limit =
        input.kind === 'PHOTO'
          ? project.maxPhotosPerContributorPerPhase
          : input.kind === 'VIDEO'
            ? project.maxVideosPerContributorPerPhase
            : project.maxTextsPerContributorPerPhase;
      const label =
        input.kind === 'PHOTO'
          ? 'photos'
          : input.kind === 'VIDEO'
            ? 'vidéos'
            : 'textes';
      if (used >= limit) {
        throw new BadRequestException(
          `Quota atteint : ${limit} ${label} maximum par phase. ` +
            `Supprime une de tes soumissions existantes pour en ajouter une nouvelle.`,
        );
      }
    }

    const item = await this.prisma.projectLiveItem.create({
      data: {
        projectId: input.projectId,
        phaseId,
        contributorId: contributor.id,
        kind: input.kind,
        mediaAssetId: input.mediaAssetId ?? null,
        textContent:
          input.kind === 'TEXT'
            ? (input.textContent?.trim() ?? null)
            : null,
        submittedDuringLive,
      },
    });

    // Modération IA en arrière-plan (non-bloquant).
    void this.moderation.moderate(item.id).catch((err) => {
      this.logger.warn(
        `background moderation failed for item=${item.id} : ${
          err instanceof Error ? err.message : err
        }`,
      );
    });

    return item;
  }

  async decideHumanReview(
    clubId: string,
    adminUserId: string,
    itemId: string,
    decision: ProjectLiveItemHumanDecision,
  ): Promise<ProjectLiveItem> {
    const item = await this.prisma.projectLiveItem.findFirst({
      where: { id: itemId, project: { clubId } },
    });
    if (!item) throw new NotFoundException('Item introuvable.');
    return this.prisma.projectLiveItem.update({
      where: { id: item.id },
      data: {
        humanDecision: decision,
        humanDecidedBy: adminUserId,
        humanDecidedAt: new Date(),
      },
    });
  }

  async setPublished(
    clubId: string,
    itemId: string,
    target: ProjectLiveItemPublication,
    publishedRefId?: string | null,
  ): Promise<ProjectLiveItem> {
    const item = await this.prisma.projectLiveItem.findFirst({
      where: { id: itemId, project: { clubId } },
    });
    if (!item) throw new NotFoundException('Item introuvable.');
    return this.prisma.projectLiveItem.update({
      where: { id: item.id },
      data: {
        publishedTo: target,
        publishedRefId: publishedRefId ?? null,
      },
    });
  }

  /**
   * Suppression par le contributeur lui-même. L'item est supprimé (FK
   * cascade enlève aussi l'éventuelle liaison vers le MediaAsset via
   * `onDelete` sur la FK mediaAssetId — non, en fait l'FK est en CASCADE
   * depuis MediaAsset → LiveItem, pas l'inverse ; on laisse donc le
   * MediaAsset orphelin côté club. Nettoyage manuel via la gallery si
   * besoin).
   */
  async deleteOwn(
    clubId: string,
    userId: string,
    itemId: string,
    userEmail?: string | null,
  ): Promise<boolean> {
    const normalizedEmail = userEmail?.trim().toLowerCase();
    const or: Array<Record<string, unknown>> = [
      { member: { userId } },
      { contact: { userId } },
    ];
    if (normalizedEmail) {
      // Fallback : Member non encore lié à un user mais même email.
      or.push({
        member: {
          userId: null,
          email: { equals: normalizedEmail, mode: 'insensitive' },
        },
      });
    }
    const contributor = await this.prisma.projectLiveItem.findFirst({
      where: {
        id: itemId,
        project: { clubId },
        contributor: { OR: or },
      },
      select: { id: true },
    });
    if (!contributor) return false;
    await this.prisma.projectLiveItem.delete({ where: { id: contributor.id } });
    return true;
  }
}
