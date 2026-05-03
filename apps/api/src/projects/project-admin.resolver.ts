import { UseGuards } from '@nestjs/common';
import { Args, ID, Mutation, Query, Resolver } from '@nestjs/graphql';
import type { Club } from '@prisma/client';
import { CurrentClub } from '../common/decorators/current-club.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequireClubModule } from '../common/decorators/require-club-module.decorator';
import { ClubContextGuard } from '../common/guards/club-context.guard';
import { ClubModuleEnabledGuard } from '../common/guards/club-module-enabled.guard';
import { ClubProjectAccessGuard } from '../common/guards/club-project-access.guard';
import { GqlJwtAuthGuard } from '../common/guards/gql-jwt-auth.guard';
import type { RequestUser } from '../common/types/request-user';
import { ModuleCode } from '../domain/module-registry/module-codes';
import {
  CreateClubProjectInput,
  CreateProjectLivePhaseInput,
  DecideProjectLiveItemInput,
  GenerateProjectReportInput,
  InviteProjectContributorInput,
  PublishProjectLiveItemInput,
  PublishProjectReportInput,
  RenameProjectSectionInput,
  UpdateClubProjectInput,
  UpdateProjectLivePhaseInput,
  UpdateProjectReportInput,
  UpdateProjectSectionBodyInput,
} from './dto/project.inputs';
import {
  ClubProjectGraph,
  ProjectContributorGraph,
  ProjectLiveItemGraph,
  ProjectLivePhaseGraph,
  ProjectReportGraph,
  ProjectSectionAttachmentGraph,
  ProjectSectionGraph,
} from './models/club-project.model';
import { ProjectContributorService } from './project-contributor.service';
import { ProjectLiveItemService } from './project-live-item.service';
import { ProjectLivePhaseService } from './project-live-phase.service';
import { ProjectReportService } from './project-report.service';
import {
  ProjectService,
  type ClubProjectWithAssets,
} from './project.service';

/**
 * Projette un `ClubProject` enrichi (`coverImage`, `posterAsset`) vers
 * la forme exposée côté GraphQL (`ClubProjectGraph` avec URLs directes).
 * Centralisé pour éviter la duplication dans chaque resolver.
 */
function projectToGraph(row: ClubProjectWithAssets): ClubProjectGraph {
  return {
    ...row,
    coverImageUrl: row.coverImage?.publicUrl ?? null,
    posterAssetUrl: row.posterAsset?.publicUrl ?? null,
  } as ClubProjectGraph;
}

@Resolver()
@UseGuards(
  GqlJwtAuthGuard,
  ClubContextGuard,
  ClubModuleEnabledGuard,
  ClubProjectAccessGuard,
)
@RequireClubModule(ModuleCode.PROJECTS)
export class ProjectAdminResolver {
  constructor(
    private readonly projects: ProjectService,
    private readonly phases: ProjectLivePhaseService,
    private readonly contributors: ProjectContributorService,
    private readonly items: ProjectLiveItemService,
    private readonly reports: ProjectReportService,
  ) {}

  // ---------- Projets ----------

  @Query(() => [ClubProjectGraph], { name: 'clubProjects' })
  async clubProjects(
    @CurrentClub() club: Club,
  ): Promise<ClubProjectGraph[]> {
    const rows = await this.projects.listForClub(club.id);
    return rows.map(projectToGraph);
  }

  @Query(() => ClubProjectGraph, { name: 'clubProject' })
  async clubProject(
    @CurrentClub() club: Club,
    @Args('id', { type: () => ID }) id: string,
  ): Promise<ClubProjectGraph> {
    const row = await this.projects.getByIdForClub(club.id, id);
    return projectToGraph(row);
  }

  @Mutation(() => ClubProjectGraph)
  async createClubProject(
    @CurrentClub() club: Club,
    @CurrentUser() user: RequestUser,
    @Args('input') input: CreateClubProjectInput,
  ): Promise<ClubProjectGraph> {
    const row = await this.projects.create(club.id, user.userId, {
      title: input.title,
      summary: input.summary ?? null,
      description: input.description ?? null,
      startsAt: input.startsAt ?? null,
      endsAt: input.endsAt ?? null,
      posterAssetId: input.posterAssetId ?? null,
      coverImageId: input.coverImageId ?? null,
      budgetPlannedCents: input.budgetPlannedCents ?? null,
      maxPhotosPerContributorPerPhase:
        input.maxPhotosPerContributorPerPhase ?? undefined,
      maxVideosPerContributorPerPhase:
        input.maxVideosPerContributorPerPhase ?? undefined,
      maxTextsPerContributorPerPhase:
        input.maxTextsPerContributorPerPhase ?? undefined,
    });
    return projectToGraph(row);
  }

  @Mutation(() => ClubProjectGraph)
  async updateClubProject(
    @CurrentClub() club: Club,
    @Args('input') input: UpdateClubProjectInput,
  ): Promise<ClubProjectGraph> {
    const { id, ...patch } = input;
    const row = await this.projects.update(club.id, id, {
      ...(patch.title !== undefined ? { title: patch.title } : {}),
      ...(patch.summary !== undefined ? { summary: patch.summary } : {}),
      ...(patch.description !== undefined
        ? { description: patch.description }
        : {}),
      ...(patch.startsAt !== undefined ? { startsAt: patch.startsAt } : {}),
      ...(patch.endsAt !== undefined ? { endsAt: patch.endsAt } : {}),
      ...(patch.posterAssetId !== undefined
        ? { posterAssetId: patch.posterAssetId }
        : {}),
      ...(patch.coverImageId !== undefined
        ? { coverImageId: patch.coverImageId }
        : {}),
      ...(patch.budgetPlannedCents !== undefined
        ? { budgetPlannedCents: patch.budgetPlannedCents }
        : {}),
      ...(patch.maxPhotosPerContributorPerPhase !== undefined
        ? {
            maxPhotosPerContributorPerPhase:
              patch.maxPhotosPerContributorPerPhase,
          }
        : {}),
      ...(patch.maxVideosPerContributorPerPhase !== undefined
        ? {
            maxVideosPerContributorPerPhase:
              patch.maxVideosPerContributorPerPhase,
          }
        : {}),
      ...(patch.maxTextsPerContributorPerPhase !== undefined
        ? {
            maxTextsPerContributorPerPhase:
              patch.maxTextsPerContributorPerPhase,
          }
        : {}),
      ...(patch.showContributorCredits !== undefined
        ? { showContributorCredits: patch.showContributorCredits }
        : {}),
      ...(patch.status !== undefined ? { status: patch.status } : {}),
    });
    return projectToGraph(row);
  }

  @Mutation(() => Boolean)
  deleteClubProject(
    @CurrentClub() club: Club,
    @Args('id', { type: () => ID }) id: string,
  ): Promise<boolean> {
    return this.projects.delete(club.id, id);
  }

  // ---------- Sections ----------

  @Query(() => [ProjectSectionGraph], { name: 'clubProjectSections' })
  async clubProjectSections(
    @CurrentClub() club: Club,
    @Args('projectId', { type: () => ID }) projectId: string,
  ): Promise<ProjectSectionGraph[]> {
    await this.projects.getByIdForClub(club.id, projectId);
    const rows = await this.projects.getSectionsForProject(projectId);
    return rows.map((r) => ({
      ...r,
      bodyJson: r.bodyJson === null ? null : JSON.stringify(r.bodyJson),
    })) as ProjectSectionGraph[];
  }

  @Mutation(() => ProjectSectionGraph)
  async renameProjectSection(
    @CurrentClub() club: Club,
    @Args('input') input: RenameProjectSectionInput,
  ): Promise<ProjectSectionGraph> {
    const row = await this.projects.renameSection(
      club.id,
      input.id,
      input.label,
    );
    return {
      ...row,
      bodyJson: row.bodyJson === null ? null : JSON.stringify(row.bodyJson),
    } as ProjectSectionGraph;
  }

  @Mutation(() => Boolean)
  async reorderProjectSections(
    @CurrentClub() club: Club,
    @Args('projectId', { type: () => ID }) projectId: string,
    @Args('orderedSectionIds', { type: () => [ID] }) orderedSectionIds: string[],
  ): Promise<boolean> {
    await this.projects.reorderSections(club.id, projectId, orderedSectionIds);
    return true;
  }

  // ---------- Documents attachés aux sections ----------

  @Query(() => [ProjectSectionAttachmentGraph], {
    name: 'projectSectionAttachments',
  })
  projectSectionAttachments(
    @CurrentClub() club: Club,
    @Args('sectionId', { type: () => ID }) sectionId: string,
  ): Promise<ProjectSectionAttachmentGraph[]> {
    return this.projects.listSectionAttachments(
      club.id,
      sectionId,
    ) as Promise<ProjectSectionAttachmentGraph[]>;
  }

  @Mutation(() => Boolean)
  async attachProjectSectionDocument(
    @CurrentClub() club: Club,
    @Args('sectionId', { type: () => ID }) sectionId: string,
    @Args('mediaAssetId', { type: () => ID }) mediaAssetId: string,
  ): Promise<boolean> {
    await this.projects.attachDocumentToSection(
      club.id,
      sectionId,
      mediaAssetId,
    );
    return true;
  }

  @Mutation(() => Boolean)
  async detachProjectSectionDocument(
    @CurrentClub() club: Club,
    @Args('sectionId', { type: () => ID }) sectionId: string,
    @Args('mediaAssetId', { type: () => ID }) mediaAssetId: string,
  ): Promise<boolean> {
    await this.projects.detachDocumentFromSection(
      club.id,
      sectionId,
      mediaAssetId,
    );
    return true;
  }

  @Mutation(() => ProjectSectionGraph)
  async updateProjectSectionBody(
    @CurrentClub() club: Club,
    @Args('input') input: UpdateProjectSectionBodyInput,
  ): Promise<ProjectSectionGraph> {
    let parsed: unknown;
    try {
      parsed = JSON.parse(input.bodyJson);
    } catch {
      throw new Error('bodyJson invalide (JSON mal formé).');
    }
    const row = await this.projects.updateSectionBody(
      club.id,
      input.id,
      parsed as never,
    );
    return {
      ...row,
      bodyJson: row.bodyJson === null ? null : JSON.stringify(row.bodyJson),
    } as ProjectSectionGraph;
  }

  // ---------- Phases LIVE ----------

  @Query(() => [ProjectLivePhaseGraph], { name: 'clubProjectLivePhases' })
  clubProjectLivePhases(
    @CurrentClub() club: Club,
    @Args('projectId', { type: () => ID }) projectId: string,
  ): Promise<ProjectLivePhaseGraph[]> {
    return this.phases.listForProject(club.id, projectId) as Promise<
      ProjectLivePhaseGraph[]
    >;
  }

  @Mutation(() => ProjectLivePhaseGraph)
  createProjectLivePhase(
    @CurrentClub() club: Club,
    @Args('input') input: CreateProjectLivePhaseInput,
  ): Promise<ProjectLivePhaseGraph> {
    return this.phases.create(club.id, input.projectId, {
      label: input.label,
      startsAt: input.startsAt,
      endsAt: input.endsAt,
    }) as Promise<ProjectLivePhaseGraph>;
  }

  @Mutation(() => ProjectLivePhaseGraph)
  updateProjectLivePhase(
    @CurrentClub() club: Club,
    @Args('input') input: UpdateProjectLivePhaseInput,
  ): Promise<ProjectLivePhaseGraph> {
    const { id, ...rest } = input;
    return this.phases.update(club.id, id, rest) as Promise<
      ProjectLivePhaseGraph
    >;
  }

  @Mutation(() => ProjectLivePhaseGraph)
  openProjectLivePhase(
    @CurrentClub() club: Club,
    @Args('id', { type: () => ID }) id: string,
  ): Promise<ProjectLivePhaseGraph> {
    return this.phases.open(club.id, id) as Promise<ProjectLivePhaseGraph>;
  }

  @Mutation(() => ProjectLivePhaseGraph)
  closeProjectLivePhase(
    @CurrentClub() club: Club,
    @Args('id', { type: () => ID }) id: string,
  ): Promise<ProjectLivePhaseGraph> {
    return this.phases.close(club.id, id) as Promise<ProjectLivePhaseGraph>;
  }

  @Mutation(() => Boolean)
  deleteProjectLivePhase(
    @CurrentClub() club: Club,
    @Args('id', { type: () => ID }) id: string,
  ): Promise<boolean> {
    return this.phases.delete(club.id, id);
  }

  // ---------- Contributeurs ----------

  @Query(() => [ProjectContributorGraph], { name: 'projectContributors' })
  async projectContributors(
    @CurrentClub() club: Club,
    @Args('projectId', { type: () => ID }) projectId: string,
    @Args('includeRevoked', { type: () => Boolean, nullable: true })
    includeRevoked?: boolean,
  ): Promise<ProjectContributorGraph[]> {
    const rows = await this.contributors.listForProject(club.id, projectId, {
      includeRevoked: includeRevoked === true,
    });
    return rows.map((c) => {
      const person =
        (c as typeof c & {
          member?: {
            firstName: string | null;
            lastName: string | null;
            photoUrl: string | null;
          } | null;
          contact?: {
            firstName: string | null;
            lastName: string | null;
            photoUrl: string | null;
          } | null;
        }).member ??
        (c as typeof c & {
          contact?: {
            firstName: string | null;
            lastName: string | null;
            photoUrl: string | null;
          } | null;
        }).contact ??
        null;
      const displayName = person
        ? [person.firstName, person.lastName].filter(Boolean).join(' ') || null
        : null;
      return {
        ...c,
        displayName,
        photoUrl: person?.photoUrl ?? null,
      } as ProjectContributorGraph;
    });
  }

  @Mutation(() => ProjectContributorGraph)
  inviteProjectContributor(
    @CurrentClub() club: Club,
    @CurrentUser() user: RequestUser,
    @Args('input') input: InviteProjectContributorInput,
  ): Promise<ProjectContributorGraph> {
    return this.contributors.invite(
      club.id,
      input.projectId,
      user.userId,
      {
        memberId: input.memberId ?? null,
        contactId: input.contactId ?? null,
      },
    ) as Promise<ProjectContributorGraph>;
  }

  @Mutation(() => ProjectContributorGraph)
  revokeProjectContributor(
    @CurrentClub() club: Club,
    @Args('id', { type: () => ID }) id: string,
    @Args('reason', { type: () => String, nullable: true })
    reason?: string,
  ): Promise<ProjectContributorGraph> {
    return this.contributors.revoke(club.id, id, reason ?? null) as Promise<
      ProjectContributorGraph
    >;
  }

  // ---------- Items live ----------

  @Query(() => [ProjectLiveItemGraph], { name: 'projectLiveItems' })
  async projectLiveItems(
    @CurrentClub() club: Club,
    @Args('projectId', { type: () => ID }) projectId: string,
  ): Promise<ProjectLiveItemGraph[]> {
    const rows = await this.items.listForProject(club.id, projectId);
    return rows as unknown as ProjectLiveItemGraph[];
  }

  @Mutation(() => ProjectLiveItemGraph)
  decideProjectLiveItem(
    @CurrentClub() club: Club,
    @CurrentUser() user: RequestUser,
    @Args('input') input: DecideProjectLiveItemInput,
  ): Promise<ProjectLiveItemGraph> {
    return this.items.decideHumanReview(
      club.id,
      user.userId,
      input.id,
      input.decision,
    ) as unknown as Promise<ProjectLiveItemGraph>;
  }

  @Mutation(() => ProjectLiveItemGraph)
  publishProjectLiveItem(
    @CurrentClub() club: Club,
    @Args('input') input: PublishProjectLiveItemInput,
  ): Promise<ProjectLiveItemGraph> {
    return this.items.setPublished(
      club.id,
      input.id,
      input.target,
    ) as unknown as Promise<ProjectLiveItemGraph>;
  }

  // ---------- Rapports IA ----------

  @Query(() => [ProjectReportGraph], { name: 'projectReports' })
  async projectReports(
    @CurrentClub() club: Club,
    @Args('projectId', { type: () => ID }) projectId: string,
  ): Promise<ProjectReportGraph[]> {
    const rows = await this.reports.listForProject(club.id, projectId);
    return rows.map((r) => ({
      ...r,
      bodyJson: JSON.stringify(r.bodyJson),
    })) as unknown as ProjectReportGraph[];
  }

  @Mutation(() => ProjectReportGraph)
  async generateProjectReport(
    @CurrentClub() club: Club,
    @CurrentUser() user: RequestUser,
    @Args('input') input: GenerateProjectReportInput,
  ): Promise<ProjectReportGraph> {
    const report = await this.reports.generate(
      club.id,
      user.userId,
      input.projectId,
      input.template,
      input.customPrompt ?? null,
    );
    return {
      ...report,
      bodyJson: JSON.stringify(report.bodyJson),
    } as unknown as ProjectReportGraph;
  }

  @Mutation(() => ProjectReportGraph)
  async updateProjectReport(
    @CurrentClub() club: Club,
    @Args('input') input: UpdateProjectReportInput,
  ): Promise<ProjectReportGraph> {
    const patch: {
      template?: UpdateProjectReportInput['template'];
      bodyJson?: unknown;
    } = {};
    if (input.template !== undefined) patch.template = input.template;
    if (input.bodyJson !== undefined) {
      try {
        patch.bodyJson = JSON.parse(input.bodyJson);
      } catch {
        throw new Error('bodyJson invalide (JSON mal formé).');
      }
    }
    const row = await this.reports.update(club.id, input.id, patch as never);
    return {
      ...row,
      bodyJson: JSON.stringify(row.bodyJson),
    } as unknown as ProjectReportGraph;
  }

  @Mutation(() => ProjectReportGraph)
  async publishProjectReport(
    @CurrentClub() club: Club,
    @CurrentUser() user: RequestUser,
    @Args('input') input: PublishProjectReportInput,
  ): Promise<ProjectReportGraph> {
    const row = await this.reports.publish(
      club.id,
      user.userId,
      input.id,
      input.target,
    );
    return {
      ...row,
      bodyJson: JSON.stringify(row.bodyJson),
    } as unknown as ProjectReportGraph;
  }

  @Mutation(() => ProjectReportGraph)
  async unpublishProjectReport(
    @CurrentClub() club: Club,
    @Args('id', { type: () => ID }) id: string,
  ): Promise<ProjectReportGraph> {
    const row = await this.reports.unpublish(club.id, id);
    return {
      ...row,
      bodyJson: JSON.stringify(row.bodyJson),
    } as unknown as ProjectReportGraph;
  }

  @Mutation(() => Boolean)
  deleteProjectReport(
    @CurrentClub() club: Club,
    @Args('id', { type: () => ID }) id: string,
  ): Promise<boolean> {
    return this.reports.delete(club.id, id);
  }
}
