import { Module, forwardRef } from '@nestjs/common';
import { AiModule } from '../ai/ai.module';
import { ClubModuleEnabledGuard } from '../common/guards/club-module-enabled.guard';
import { ClubProjectAccessGuard } from '../common/guards/club-project-access.guard';
import { PrismaModule } from '../prisma/prisma.module';
import { TelegramModule } from '../telegram/telegram.module';
import { VitrineModule } from '../vitrine/vitrine.module';
import { ProjectAdminResolver } from './project-admin.resolver';
import { ProjectAgentContextService } from './project-agent-context.service';
import { ProjectContributorResolver } from './project-contributor.resolver';
import { ProjectContributorService } from './project-contributor.service';
import { ProjectLiveItemService } from './project-live-item.service';
import { ProjectLivePhaseService } from './project-live-phase.service';
import { ProjectModerationService } from './project-moderation.service';
import { ProjectReportService } from './project-report.service';
import { ProjectService } from './project.service';

/**
 * Module « Événements / Projets ».
 *
 * Expose :
 *   - ProjectAdminResolver (CRUD projet, phases, contributeurs, items,
 *     rapports) derrière ClubProjectAccessGuard.
 *   - ProjectContributorResolver (soumission d'items, quota, liste des
 *     projets du viewer) ouvert aux contributeurs actifs.
 *
 * Exporte les services pour permettre aux autres modules (members,
 * messaging, agent) d'appeler par ex. `autoRevokeForInactiveMember` ou
 * `isActiveContributor` sans cycle d'import.
 */
@Module({
  imports: [
    PrismaModule,
    TelegramModule,
    forwardRef(() => AiModule),
    forwardRef(() => VitrineModule),
  ],
  providers: [
    ProjectService,
    ProjectContributorService,
    ProjectLivePhaseService,
    ProjectLiveItemService,
    ProjectModerationService,
    ProjectReportService,
    ProjectAgentContextService,
    ProjectAdminResolver,
    ProjectContributorResolver,
    ClubModuleEnabledGuard,
    ClubProjectAccessGuard,
  ],
  exports: [
    ProjectService,
    ProjectContributorService,
    ProjectLivePhaseService,
    ProjectLiveItemService,
    ProjectReportService,
    ProjectAgentContextService,
  ],
})
export class ProjectsModule {}
