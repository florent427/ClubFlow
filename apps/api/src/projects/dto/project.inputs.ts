import { Field, ID, InputType, Int } from '@nestjs/graphql';
import {
  ProjectLiveItemHumanDecision,
  ProjectLiveItemKind,
  ProjectLiveItemPublication,
  ProjectReportTemplate,
  ProjectStatus,
} from '@prisma/client';
import {
  IsBoolean,
  IsDate,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

@InputType()
export class CreateClubProjectInput {
  @Field()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title!: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  summary?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(10_000)
  description?: string;

  @Field(() => Date, { nullable: true })
  @IsOptional()
  @IsDate()
  startsAt?: Date;

  @Field(() => Date, { nullable: true })
  @IsOptional()
  @IsDate()
  endsAt?: Date;

  @Field(() => ID, { nullable: true })
  @IsOptional()
  @IsString()
  posterAssetId?: string;

  @Field(() => ID, { nullable: true })
  @IsOptional()
  @IsString()
  coverImageId?: string;

  @Field(() => Int, { nullable: true })
  @IsOptional()
  @IsInt()
  @Min(0)
  budgetPlannedCents?: number;

  @Field(() => Int, { nullable: true })
  @IsOptional()
  @IsInt()
  @Min(0)
  maxPhotosPerContributorPerPhase?: number;

  @Field(() => Int, { nullable: true })
  @IsOptional()
  @IsInt()
  @Min(0)
  maxVideosPerContributorPerPhase?: number;

  @Field(() => Int, { nullable: true })
  @IsOptional()
  @IsInt()
  @Min(0)
  maxTextsPerContributorPerPhase?: number;
}

@InputType()
export class UpdateClubProjectInput {
  @Field(() => ID)
  @IsString()
  id!: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  summary?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(10_000)
  description?: string;

  @Field(() => Date, { nullable: true })
  @IsOptional()
  @IsDate()
  startsAt?: Date;

  @Field(() => Date, { nullable: true })
  @IsOptional()
  @IsDate()
  endsAt?: Date;

  @Field(() => ID, { nullable: true })
  @IsOptional()
  @IsString()
  posterAssetId?: string;

  @Field(() => ID, { nullable: true })
  @IsOptional()
  @IsString()
  coverImageId?: string;

  @Field(() => Int, { nullable: true })
  @IsOptional()
  @IsInt()
  budgetPlannedCents?: number;

  @Field(() => Int, { nullable: true })
  @IsOptional()
  @IsInt()
  @Min(0)
  maxPhotosPerContributorPerPhase?: number;

  @Field(() => Int, { nullable: true })
  @IsOptional()
  @IsInt()
  @Min(0)
  maxVideosPerContributorPerPhase?: number;

  @Field(() => Int, { nullable: true })
  @IsOptional()
  @IsInt()
  @Min(0)
  maxTextsPerContributorPerPhase?: number;

  @Field({ nullable: true })
  @IsOptional()
  @IsBoolean()
  showContributorCredits?: boolean;

  @Field(() => ProjectStatus, { nullable: true })
  @IsOptional()
  @IsEnum(ProjectStatus)
  status?: ProjectStatus;
}

@InputType()
export class RenameProjectSectionInput {
  @Field(() => ID)
  id!: string;

  @Field()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  label!: string;
}

@InputType()
export class UpdateProjectSectionBodyInput {
  @Field(() => ID)
  id!: string;

  /** JSON Tiptap stringifié. On parse côté service. */
  @Field()
  @IsString()
  bodyJson!: string;
}

@InputType()
export class CreateProjectLivePhaseInput {
  @Field(() => ID)
  @IsString()
  projectId!: string;

  @Field()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  label!: string;

  @Field(() => Date)
  @IsDate()
  startsAt!: Date;

  @Field(() => Date)
  @IsDate()
  endsAt!: Date;
}

@InputType()
export class UpdateProjectLivePhaseInput {
  @Field(() => ID)
  @IsString()
  id!: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  label?: string;

  @Field(() => Date, { nullable: true })
  @IsOptional()
  @IsDate()
  startsAt?: Date;

  @Field(() => Date, { nullable: true })
  @IsOptional()
  @IsDate()
  endsAt?: Date;
}

@InputType()
export class InviteProjectContributorInput {
  @Field(() => ID)
  @IsString()
  projectId!: string;

  @Field(() => ID, { nullable: true })
  @IsOptional()
  @IsString()
  memberId?: string;

  @Field(() => ID, { nullable: true })
  @IsOptional()
  @IsString()
  contactId?: string;
}

@InputType()
export class SubmitProjectLiveItemInput {
  @Field(() => ID)
  @IsString()
  projectId!: string;

  @Field(() => ProjectLiveItemKind)
  @IsEnum(ProjectLiveItemKind)
  kind!: ProjectLiveItemKind;

  /** Requis pour PHOTO et VIDEO. Nul pour TEXT. */
  @Field(() => ID, { nullable: true })
  @IsOptional()
  @IsString()
  mediaAssetId?: string;

  /** Requis pour TEXT. Max 4000 caractères. Nul pour PHOTO / VIDEO. */
  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  textContent?: string;
}

@InputType()
export class DecideProjectLiveItemInput {
  @Field(() => ID)
  @IsString()
  id!: string;

  @Field(() => ProjectLiveItemHumanDecision)
  @IsEnum(ProjectLiveItemHumanDecision)
  decision!: ProjectLiveItemHumanDecision;
}

@InputType()
export class PublishProjectLiveItemInput {
  @Field(() => ID)
  @IsString()
  id!: string;

  @Field(() => ProjectLiveItemPublication)
  @IsEnum(ProjectLiveItemPublication)
  target!: ProjectLiveItemPublication;
}

@InputType()
export class GenerateProjectReportInput {
  @Field(() => ID)
  @IsString()
  projectId!: string;

  @Field(() => ProjectReportTemplate)
  @IsEnum(ProjectReportTemplate)
  template!: ProjectReportTemplate;

  /**
   * Prompt libre pour template=CUSTOM. Ignoré pour les 3 presets prédéfinis
   * (COMPETITIF, FESTIF, BILAN). Max 2000 caractères.
   */
  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  customPrompt?: string;
}

@InputType()
export class UpdateProjectReportInput {
  @Field(() => ID)
  @IsString()
  id!: string;

  @Field(() => ProjectReportTemplate, { nullable: true })
  @IsOptional()
  @IsEnum(ProjectReportTemplate)
  template?: ProjectReportTemplate;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  bodyJson?: string;
}

@InputType()
export class PublishProjectReportInput {
  @Field(() => ID)
  @IsString()
  id!: string;

  @Field(() => ProjectLiveItemPublication)
  @IsEnum(ProjectLiveItemPublication)
  target!: ProjectLiveItemPublication;
}
