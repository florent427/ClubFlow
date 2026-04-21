import { Field, ID, InputType, Int } from '@nestjs/graphql';
import {
  IsArray,
  IsBoolean,
  IsEmail,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  MaxLength,
} from 'class-validator';
import {
  VitrineArticleStatusEnum,
  VitrinePageStatusEnum,
} from '../models/vitrine-models';

@InputType()
export class UpsertVitrinePageInput {
  @Field() @IsString() @Length(1, 60)
  slug!: string;

  @Field({ nullable: true }) @IsOptional() @IsString() @MaxLength(60)
  templateKey?: string;

  @Field(() => VitrinePageStatusEnum, { nullable: true })
  @IsOptional() @IsEnum(VitrinePageStatusEnum)
  status?: VitrinePageStatusEnum;

  @Field(() => String, { nullable: true }) @IsOptional() @IsString() @MaxLength(200)
  seoTitle?: string;

  @Field(() => String, { nullable: true }) @IsOptional() @IsString() @MaxLength(400)
  seoDescription?: string;

  @Field(() => ID, { nullable: true }) @IsOptional() @IsUUID()
  seoOgImageId?: string;

  /** JSON sérialisé du tableau sectionsJson. */
  @Field() @IsString() @Length(2, 200000)
  sectionsJson!: string;
}

@InputType()
export class UpdateVitrinePageSectionInput {
  @Field(() => ID) @IsUUID()
  pageId!: string;

  @Field() @IsString() @Length(1, 80)
  sectionId!: string;

  /** JSON sérialisé des props à merger sur la section. */
  @Field() @IsString() @Length(2, 100000)
  patchJson!: string;
}

@InputType()
export class ReorderVitrinePageSectionsInput {
  @Field(() => ID) @IsUUID()
  pageId!: string;

  @Field(() => [String]) @IsArray() @IsString({ each: true })
  orderedSectionIds!: string[];
}

// ---- Array patches (items des listes) ----

@InputType()
export class UpdateSectionListItemInput {
  @Field(() => ID) @IsUUID()
  pageId!: string;

  @Field() @IsString() @Length(1, 80)
  sectionId!: string;

  @Field() @IsString() @Length(1, 80)
  listField!: string;

  @Field(() => Int) @IsInt()
  index!: number;

  /** JSON sérialisé du patch (deep-merge sur l'item). */
  @Field() @IsString() @Length(2, 100000)
  patchJson!: string;
}

@InputType()
export class AddSectionListItemInput {
  @Field(() => ID) @IsUUID()
  pageId!: string;

  @Field() @IsString() @Length(1, 80)
  sectionId!: string;

  @Field() @IsString() @Length(1, 80)
  listField!: string;

  /** JSON sérialisé du nouvel item (objet ou primitive). */
  @Field() @IsString() @Length(2, 100000)
  itemJson!: string;

  @Field(() => Int, { nullable: true }) @IsOptional() @IsInt()
  atIndex?: number;
}

@InputType()
export class RemoveSectionListItemInput {
  @Field(() => ID) @IsUUID()
  pageId!: string;

  @Field() @IsString() @Length(1, 80)
  sectionId!: string;

  @Field() @IsString() @Length(1, 80)
  listField!: string;

  @Field(() => Int) @IsInt()
  index!: number;
}

@InputType()
export class ReorderSectionListItemsInput {
  @Field(() => ID) @IsUUID()
  pageId!: string;

  @Field() @IsString() @Length(1, 80)
  sectionId!: string;

  @Field() @IsString() @Length(1, 80)
  listField!: string;

  @Field(() => [Int]) @IsArray() @IsInt({ each: true })
  newOrder!: number[];
}

@InputType()
export class UpdateVitrinePageSeoInput {
  @Field(() => ID) @IsUUID()
  pageId!: string;

  @Field(() => String, { nullable: true }) @IsOptional() @IsString() @MaxLength(200)
  seoTitle?: string;

  @Field(() => String, { nullable: true }) @IsOptional() @IsString() @MaxLength(400)
  seoDescription?: string;

  @Field(() => ID, { nullable: true }) @IsOptional() @IsUUID()
  seoOgImageId?: string;
}

@InputType()
export class RestoreVitrineRevisionInput {
  @Field(() => ID) @IsUUID()
  pageId!: string;

  @Field(() => ID) @IsUUID()
  revisionId!: string;
}

@InputType()
export class SetVitrinePageStatusInput {
  @Field(() => ID) @IsUUID()
  pageId!: string;

  @Field(() => VitrinePageStatusEnum) @IsEnum(VitrinePageStatusEnum)
  status!: VitrinePageStatusEnum;
}

// ------- Articles -------

@InputType()
export class CreateVitrineArticleInput {
  @Field() @IsString() @Length(1, 200)
  title!: string;

  @Field({ nullable: true }) @IsOptional() @IsString() @Length(1, 160)
  slug?: string;

  @Field(() => String, { nullable: true }) @IsOptional() @IsString() @MaxLength(500)
  excerpt?: string;

  /** JSON sérialisé du body rich-text (tableau de paragraphes ou Tiptap). */
  @Field() @IsString() @Length(2, 200000)
  bodyJson!: string;

  @Field(() => ID, { nullable: true }) @IsOptional() @IsUUID()
  coverImageId?: string;

  @Field(() => Boolean, { nullable: true }) @IsOptional() @IsBoolean()
  publishNow?: boolean;
}

@InputType()
export class UpdateVitrineArticleInput {
  @Field(() => ID) @IsUUID()
  id!: string;

  @Field({ nullable: true }) @IsOptional() @IsString() @Length(1, 200)
  title?: string;

  @Field({ nullable: true }) @IsOptional() @IsString() @Length(1, 160)
  slug?: string;

  @Field(() => String, { nullable: true }) @IsOptional() @IsString() @MaxLength(500)
  excerpt?: string;

  @Field({ nullable: true }) @IsOptional() @IsString() @Length(2, 200000)
  bodyJson?: string;

  @Field(() => ID, { nullable: true }) @IsOptional() @IsUUID()
  coverImageId?: string;
}

@InputType()
export class SetVitrineArticleStatusInput {
  @Field(() => ID) @IsUUID()
  id!: string;

  @Field(() => VitrineArticleStatusEnum) @IsEnum(VitrineArticleStatusEnum)
  status!: VitrineArticleStatusEnum;
}

// ------- Annonces -------

@InputType()
export class CreateVitrineAnnouncementInput {
  @Field() @IsString() @Length(1, 200)
  title!: string;

  @Field() @IsString() @Length(1, 4000)
  body!: string;

  @Field(() => Boolean, { nullable: true }) @IsOptional() @IsBoolean()
  pinned?: boolean;

  @Field(() => Boolean, { nullable: true }) @IsOptional() @IsBoolean()
  publishNow?: boolean;
}

@InputType()
export class UpdateVitrineAnnouncementInput {
  @Field(() => ID) @IsUUID()
  id!: string;

  @Field({ nullable: true }) @IsOptional() @IsString() @Length(1, 200)
  title?: string;

  @Field({ nullable: true }) @IsOptional() @IsString() @Length(1, 4000)
  body?: string;

  @Field(() => Boolean, { nullable: true }) @IsOptional() @IsBoolean()
  pinned?: boolean;

  @Field(() => Date, { nullable: true }) @IsOptional()
  publishedAt?: Date | null;
}

// ------- Galerie -------

@InputType()
export class AddVitrineGalleryPhotoInput {
  @Field(() => ID) @IsUUID()
  mediaAssetId!: string;

  @Field(() => String, { nullable: true }) @IsOptional() @IsString() @MaxLength(200)
  caption?: string;

  @Field(() => String, { nullable: true }) @IsOptional() @IsString() @MaxLength(60)
  category?: string;

  @Field(() => Int, { nullable: true }) @IsOptional() @IsInt()
  sortOrder?: number;
}

@InputType()
export class UpdateVitrineGalleryPhotoInput {
  @Field(() => ID) @IsUUID()
  id!: string;

  @Field(() => String, { nullable: true }) @IsOptional() @IsString() @MaxLength(200)
  caption?: string;

  @Field(() => String, { nullable: true }) @IsOptional() @IsString() @MaxLength(60)
  category?: string;

  @Field(() => Int, { nullable: true }) @IsOptional() @IsInt()
  sortOrder?: number;
}

// ------- Settings vitrine -------

@InputType()
export class UpdateVitrineBrandingInput {
  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  kanjiTagline?: string | null;

  /** JSON sérialisé du footer ; vide/null = reset au fallback. */
  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(20000)
  footerJson?: string | null;

  /** JSON sérialisé de la palette ; vide/null = reset (SKSR par défaut).
   * Schéma : { ink, ink2, paper, accent, goldBright, vermillion, line, muted } */
  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  paletteJson?: string | null;

  /** JSON sérialisé des fonts ; vide/null = reset. Schéma : { serif, sans, jp }. */
  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  fontsJson?: string | null;
}

@InputType()
export class UpdateVitrineSettingsInput {
  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  customDomain?: string | null;

  @Field(() => Boolean, { nullable: true })
  @IsOptional()
  @IsBoolean()
  vitrinePublished?: boolean;
}

// ------- Public contact -------

@InputType()
export class SubmitVitrineContactInput {
  @Field() @IsString() @Length(1, 60)
  clubSlug!: string;

  @Field({ nullable: true }) @IsOptional() @IsString() @MaxLength(80)
  firstName?: string;

  @Field({ nullable: true }) @IsOptional() @IsString() @MaxLength(80)
  lastName?: string;

  @Field() @IsEmail() @MaxLength(200)
  email!: string;

  @Field(() => String, { nullable: true }) @IsOptional() @IsString() @MaxLength(40)
  phone?: string;

  @Field() @IsString() @Length(1, 5000)
  message!: string;
}
