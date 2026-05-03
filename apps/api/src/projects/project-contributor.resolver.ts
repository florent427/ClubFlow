import { BadRequestException, UseGuards } from '@nestjs/common';
import { Args, ID, Mutation, Query, Resolver } from '@nestjs/graphql';
import type { Club } from '@prisma/client';
import { CurrentClub } from '../common/decorators/current-club.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequireClubModule } from '../common/decorators/require-club-module.decorator';
import { ClubContextGuard } from '../common/guards/club-context.guard';
import { ClubModuleEnabledGuard } from '../common/guards/club-module-enabled.guard';
import { GqlJwtAuthGuard } from '../common/guards/gql-jwt-auth.guard';
import type { RequestUser } from '../common/types/request-user';
import { ModuleCode } from '../domain/module-registry/module-codes';
import { PrismaService } from '../prisma/prisma.service';
import { SubmitProjectLiveItemInput } from './dto/project.inputs';
import {
  ClubProjectGraph,
  LiveItemQuotaInfo,
  ProjectLiveItemGraph,
  ProjectLivePhaseGraph,
} from './models/club-project.model';
import { ProjectContributorService } from './project-contributor.service';
import { ProjectLiveItemService } from './project-live-item.service';
import { ProjectLivePhaseService } from './project-live-phase.service';

/**
 * Resolver exposé aux contributeurs (Member ou Contact lié à un user).
 *
 * N'applique PAS `ClubProjectAccessGuard` — les droits sont vérifiés par
 * `ProjectContributorService.isActiveContributor()` qui tolère à la fois
 * les Members et les Contacts. Le `ClubModuleEnabledGuard` reste en place
 * pour désactiver les queries si le club n'a pas activé `PROJECTS`.
 */
@Resolver()
@UseGuards(GqlJwtAuthGuard, ClubContextGuard, ClubModuleEnabledGuard)
@RequireClubModule(ModuleCode.PROJECTS)
export class ProjectContributorResolver {
  constructor(
    private readonly prisma: PrismaService,
    private readonly contributors: ProjectContributorService,
    private readonly phases: ProjectLivePhaseService,
    private readonly items: ProjectLiveItemService,
  ) {}

  /**
   * Projets où le viewer est contributeur actif.
   *
   * Match prioritaire : `Member.userId === viewer.userId` ou
   * `Contact.userId === viewer.userId`.
   *
   * Fallback : si un Member a été créé en amont par l'admin sans que le
   * lien `userId` ait été synchronisé (cas typique : Member créé dans
   * l'annuaire, user créé plus tard lors de l'inscription), on retombe
   * sur un match par **email normalisé** tant que `Member.userId` est
   * encore NULL (garde-fou : pas de collision avec un Member déjà lié
   * à un autre utilisateur).
   */
  @Query(() => [ClubProjectGraph], { name: 'myProjectContributions' })
  async myProjectContributions(
    @CurrentClub() club: Club,
    @CurrentUser() user: RequestUser,
  ): Promise<ClubProjectGraph[]> {
    const normalizedEmail = user.email.trim().toLowerCase();
    const contributions = await this.prisma.projectContributor.findMany({
      where: {
        revokedAt: null,
        project: { clubId: club.id },
        OR: [
          { member: { userId: user.userId } },
          { contact: { userId: user.userId } },
          {
            member: {
              userId: null,
              email: { equals: normalizedEmail, mode: 'insensitive' },
            },
          },
        ],
      },
      include: {
        project: {
          include: {
            coverImage: { select: { publicUrl: true } },
            posterAsset: { select: { publicUrl: true } },
          },
        },
      },
      orderBy: { addedAt: 'desc' },
    });
    // Déduplique par projectId (un user pourrait matcher par Member et Contact).
    const seen = new Set<string>();
    const unique: typeof contributions = [];
    for (const c of contributions) {
      if (seen.has(c.projectId)) continue;
      seen.add(c.projectId);
      unique.push(c);
    }
    return unique.map((c) => ({
      ...c.project,
      coverImageUrl: c.project.coverImage?.publicUrl ?? null,
      posterAssetUrl: c.project.posterAsset?.publicUrl ?? null,
    })) as ClubProjectGraph[];
  }

  /**
   * Items live du viewer sur un projet donné (les items qu'il a lui-même
   * soumis, quel que soit leur statut).
   */
  @Query(() => [ProjectLiveItemGraph], { name: 'myProjectLiveItems' })
  async myProjectLiveItems(
    @CurrentClub() club: Club,
    @CurrentUser() user: RequestUser,
    @Args('projectId', { type: () => ID }) projectId: string,
  ): Promise<ProjectLiveItemGraph[]> {
    const rows = await this.items.listMineForProject(
      club.id,
      user.userId,
      projectId,
      user.email,
    );
    return rows as unknown as ProjectLiveItemGraph[];
  }

  /**
   * État du quota courant pour le viewer + phase active. Sert à l'UI
   * upload pour afficher « Photos 7/10 restantes · Vidéos 2/3 restantes ».
   */
  @Query(() => LiveItemQuotaInfo, { name: 'myProjectLiveItemQuota' })
  async myProjectLiveItemQuota(
    @CurrentClub() club: Club,
    @CurrentUser() user: RequestUser,
    @Args('projectId', { type: () => ID }) projectId: string,
  ): Promise<LiveItemQuotaInfo> {
    const contributor = await this.contributors.isActiveContributor(
      user.userId,
      projectId,
      user.email,
    );
    if (!contributor) {
      throw new BadRequestException(
        'Tu n’es pas contributeur actif de ce projet.',
      );
    }
    const project = await this.prisma.clubProject.findFirst({
      where: { id: projectId, clubId: club.id },
      select: {
        maxPhotosPerContributorPerPhase: true,
        maxVideosPerContributorPerPhase: true,
        maxTextsPerContributorPerPhase: true,
      },
    });
    if (!project) {
      throw new BadRequestException('Projet introuvable.');
    }
    const phase = await this.phases.currentLivePhase(
      club.id,
      projectId,
      new Date(),
    );
    if (!phase) {
      return {
        phaseId: null,
        phaseLabel: null,
        phaseIsLive: false,
        maxPhotos: project.maxPhotosPerContributorPerPhase,
        maxVideos: project.maxVideosPerContributorPerPhase,
        maxTexts: project.maxTextsPerContributorPerPhase,
        usedPhotos: 0,
        usedVideos: 0,
        usedTexts: 0,
      };
    }
    const [usedPhotos, usedVideos, usedTexts] = await Promise.all([
      this.items.countActiveForQuota(contributor.id, phase.id, 'PHOTO'),
      this.items.countActiveForQuota(contributor.id, phase.id, 'VIDEO'),
      this.items.countActiveForQuota(contributor.id, phase.id, 'TEXT'),
    ]);
    return {
      phaseId: phase.id,
      phaseLabel: phase.label,
      phaseIsLive: true,
      maxPhotos: project.maxPhotosPerContributorPerPhase,
      maxVideos: project.maxVideosPerContributorPerPhase,
      maxTexts: project.maxTextsPerContributorPerPhase,
      usedPhotos,
      usedVideos,
      usedTexts,
    };
  }

  /**
   * Liste des phases du projet (toutes : UPCOMING / LIVE / CLOSED) pour
   * que le contributeur voie ce qui est à venir et déjà passé. Utile
   * pour la page upload qui l'affiche au-dessus du formulaire.
   */
  @Query(() => [ProjectLivePhaseGraph], { name: 'myProjectPhases' })
  async myProjectPhases(
    @CurrentClub() club: Club,
    @CurrentUser() user: RequestUser,
    @Args('projectId', { type: () => ID }) projectId: string,
  ): Promise<ProjectLivePhaseGraph[]> {
    const contributor = await this.contributors.isActiveContributor(
      user.userId,
      projectId,
      user.email,
    );
    if (!contributor) {
      throw new BadRequestException(
        'Tu n’es pas contributeur actif de ce projet.',
      );
    }
    return this.phases.listForProject(club.id, projectId) as Promise<
      ProjectLivePhaseGraph[]
    >;
  }

  @Mutation(() => ProjectLiveItemGraph)
  submitProjectLiveItem(
    @CurrentClub() club: Club,
    @CurrentUser() user: RequestUser,
    @Args('input') input: SubmitProjectLiveItemInput,
  ): Promise<ProjectLiveItemGraph> {
    return this.items.submit(
      club.id,
      user.userId,
      {
        projectId: input.projectId,
        kind: input.kind,
        mediaAssetId: input.mediaAssetId ?? null,
        textContent: input.textContent ?? null,
      },
      user.email,
    ) as unknown as Promise<ProjectLiveItemGraph>;
  }

  @Mutation(() => Boolean)
  deleteMyProjectLiveItem(
    @CurrentClub() club: Club,
    @CurrentUser() user: RequestUser,
    @Args('id', { type: () => ID }) id: string,
  ): Promise<boolean> {
    return this.items.deleteOwn(club.id, user.userId, id, user.email);
  }
}
