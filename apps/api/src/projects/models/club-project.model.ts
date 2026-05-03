import { Field, ID, Int, ObjectType, registerEnumType } from '@nestjs/graphql';
import {
  ProjectContributorRole,
  ProjectLiveItemAiDecision,
  ProjectLiveItemHumanDecision,
  ProjectLiveItemKind,
  ProjectLiveItemPublication,
  ProjectLivePhaseState,
  ProjectReportStatus,
  ProjectReportTemplate,
  ProjectSectionKind,
  ProjectStatus,
} from '@prisma/client';

registerEnumType(ProjectStatus, { name: 'ProjectStatus' });
registerEnumType(ProjectLivePhaseState, { name: 'ProjectLivePhaseState' });
registerEnumType(ProjectSectionKind, { name: 'ProjectSectionKind' });
registerEnumType(ProjectContributorRole, { name: 'ProjectContributorRole' });
registerEnumType(ProjectLiveItemKind, { name: 'ProjectLiveItemKind' });
registerEnumType(ProjectLiveItemAiDecision, {
  name: 'ProjectLiveItemAiDecision',
});
registerEnumType(ProjectLiveItemHumanDecision, {
  name: 'ProjectLiveItemHumanDecision',
});
registerEnumType(ProjectLiveItemPublication, {
  name: 'ProjectLiveItemPublication',
});
registerEnumType(ProjectReportTemplate, { name: 'ProjectReportTemplate' });
registerEnumType(ProjectReportStatus, { name: 'ProjectReportStatus' });

@ObjectType()
export class ClubProjectGraph {
  @Field(() => ID)
  id!: string;

  @Field(() => ID)
  clubId!: string;

  @Field()
  slug!: string;

  @Field()
  title!: string;

  @Field(() => String, { nullable: true })
  summary!: string | null;

  @Field(() => String, { nullable: true })
  description!: string | null;

  @Field(() => ProjectStatus)
  status!: ProjectStatus;

  @Field(() => Date, { nullable: true })
  startsAt!: Date | null;

  @Field(() => Date, { nullable: true })
  endsAt!: Date | null;

  @Field(() => ID, { nullable: true })
  posterAssetId!: string | null;

  @Field(() => ID, { nullable: true })
  coverImageId!: string | null;

  /** URL publique directe de la cover (null si pas de coverImageId). */
  @Field(() => String, { nullable: true })
  coverImageUrl!: string | null;

  /** URL publique de l'affiche/poster (null si pas de posterAssetId). */
  @Field(() => String, { nullable: true })
  posterAssetUrl!: string | null;

  @Field(() => Int, { nullable: true })
  budgetPlannedCents!: number | null;

  @Field(() => Int)
  maxPhotosPerContributorPerPhase!: number;

  @Field(() => Int)
  maxVideosPerContributorPerPhase!: number;

  @Field(() => Int)
  maxTextsPerContributorPerPhase!: number;

  @Field()
  showContributorCredits!: boolean;

  @Field(() => ID)
  createdByUserId!: string;

  @Field()
  createdAt!: Date;

  @Field()
  updatedAt!: Date;
}

@ObjectType()
export class ProjectSectionAttachmentGraph {
  @Field(() => ID)
  id!: string;

  @Field()
  fileName!: string;

  @Field()
  mimeType!: string;

  @Field(() => Int)
  sizeBytes!: number;

  @Field(() => String, { nullable: true })
  publicUrl!: string | null;

  @Field()
  uploadedAt!: Date;
}

@ObjectType()
export class ProjectSectionGraph {
  @Field(() => ID)
  id!: string;

  @Field(() => ID)
  projectId!: string;

  @Field(() => ProjectSectionKind)
  kind!: ProjectSectionKind;

  @Field()
  label!: string;

  @Field(() => Int)
  sortOrder!: number;

  /** JSON sérialisé (Tiptap ProseMirror doc). Client parse avec JSON.parse. */
  @Field(() => String, { nullable: true })
  bodyJson!: string | null;

  @Field()
  createdAt!: Date;

  @Field()
  updatedAt!: Date;
}

@ObjectType()
export class ProjectLivePhaseGraph {
  @Field(() => ID)
  id!: string;

  @Field(() => ID)
  projectId!: string;

  @Field()
  label!: string;

  @Field()
  startsAt!: Date;

  @Field()
  endsAt!: Date;

  @Field(() => ProjectLivePhaseState)
  state!: ProjectLivePhaseState;

  @Field(() => Date, { nullable: true })
  openedAt!: Date | null;

  @Field(() => Date, { nullable: true })
  closedAt!: Date | null;
}

@ObjectType()
export class ProjectContributorGraph {
  @Field(() => ID)
  id!: string;

  @Field(() => ID)
  projectId!: string;

  @Field(() => ID, { nullable: true })
  memberId!: string | null;

  @Field(() => ID, { nullable: true })
  contactId!: string | null;

  @Field(() => ProjectContributorRole)
  role!: ProjectContributorRole;

  @Field(() => ID)
  addedByUserId!: string;

  @Field()
  addedAt!: Date;

  @Field(() => Date, { nullable: true })
  revokedAt!: Date | null;

  @Field(() => String, { nullable: true })
  revokedReason!: string | null;

  @Field(() => String, { nullable: true })
  displayName!: string | null;

  @Field(() => String, { nullable: true })
  photoUrl!: string | null;
}

@ObjectType()
export class ProjectLiveItemMediaRef {
  @Field(() => String, { nullable: true })
  publicUrl!: string | null;

  @Field()
  mimeType!: string;

  @Field(() => String, { nullable: true })
  fileName!: string | null;
}

@ObjectType()
export class ProjectLiveItemGraph {
  @Field(() => ID)
  id!: string;

  @Field(() => ID)
  projectId!: string;

  @Field(() => ID, { nullable: true })
  phaseId!: string | null;

  @Field(() => ID)
  contributorId!: string;

  @Field(() => ProjectLiveItemKind)
  kind!: ProjectLiveItemKind;

  /** Nul pour kind=TEXT, renseigné pour PHOTO et VIDEO. */
  @Field(() => ID, { nullable: true })
  mediaAssetId!: string | null;

  /** Renseigné uniquement pour kind=TEXT. */
  @Field(() => String, { nullable: true })
  textContent!: string | null;

  @Field()
  submittedAt!: Date;

  @Field()
  submittedDuringLive!: boolean;

  @Field(() => ProjectLiveItemAiDecision)
  aiDecision!: ProjectLiveItemAiDecision;

  @Field(() => String, { nullable: true })
  aiReason!: string | null;

  @Field(() => Number, { nullable: true })
  aiScore!: number | null;

  @Field(() => Date, { nullable: true })
  aiCheckedAt!: Date | null;

  @Field(() => ProjectLiveItemHumanDecision)
  humanDecision!: ProjectLiveItemHumanDecision;

  @Field(() => ID, { nullable: true })
  humanDecidedBy!: string | null;

  @Field(() => Date, { nullable: true })
  humanDecidedAt!: Date | null;

  @Field(() => ProjectLiveItemPublication)
  publishedTo!: ProjectLiveItemPublication;

  @Field(() => ID, { nullable: true })
  publishedRefId!: string | null;

  @Field(() => ProjectLiveItemMediaRef, { nullable: true })
  mediaAsset!: ProjectLiveItemMediaRef | null;
}

@ObjectType()
export class ProjectReportGraph {
  @Field(() => ID)
  id!: string;

  @Field(() => ID)
  projectId!: string;

  @Field(() => ProjectReportTemplate)
  template!: ProjectReportTemplate;

  @Field(() => ProjectReportStatus)
  status!: ProjectReportStatus;

  /** Prompt libre fourni par l'admin pour template=CUSTOM. Null pour les presets. */
  @Field(() => String, { nullable: true })
  customPrompt!: string | null;

  /** JSON sérialisé (Tiptap doc). Client parse avec JSON.parse. */
  @Field(() => String)
  bodyJson!: string;

  @Field(() => [String])
  sourceLiveItemIds!: string[];

  @Field(() => [String])
  sourceContributorMemberIds!: string[];

  @Field(() => [String])
  sourceContributorContactIds!: string[];

  @Field(() => ProjectLiveItemPublication)
  publishedTo!: ProjectLiveItemPublication;

  @Field(() => ID, { nullable: true })
  publishedRefId!: string | null;

  @Field(() => ID, { nullable: true })
  generatedByAgentConversationId!: string | null;

  @Field(() => ID)
  createdByUserId!: string;

  @Field()
  createdAt!: Date;

  @Field(() => Date, { nullable: true })
  publishedAt!: Date | null;
}

@ObjectType()
export class LiveItemQuotaInfo {
  @Field(() => ID, { nullable: true })
  phaseId!: string | null;

  @Field(() => String, { nullable: true })
  phaseLabel!: string | null;

  @Field(() => Int)
  maxPhotos!: number;

  @Field(() => Int)
  usedPhotos!: number;

  @Field(() => Int)
  maxVideos!: number;

  @Field(() => Int)
  usedVideos!: number;

  @Field(() => Int)
  maxTexts!: number;

  @Field(() => Int)
  usedTexts!: number;

  @Field()
  phaseIsLive!: boolean;
}
