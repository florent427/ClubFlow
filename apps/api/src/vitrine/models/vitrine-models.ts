import { Field, ID, Int, ObjectType, registerEnumType } from '@nestjs/graphql';

export enum VitrinePageStatusEnum {
  DRAFT = 'DRAFT',
  PUBLISHED = 'PUBLISHED',
}
registerEnumType(VitrinePageStatusEnum, { name: 'VitrinePageStatus' });

export enum VitrineArticleStatusEnum {
  DRAFT = 'DRAFT',
  PUBLISHED = 'PUBLISHED',
  ARCHIVED = 'ARCHIVED',
}
registerEnumType(VitrineArticleStatusEnum, { name: 'VitrineArticleStatus' });

@ObjectType()
export class VitrinePageGraph {
  @Field(() => ID)
  id!: string;

  @Field()
  slug!: string;

  @Field()
  templateKey!: string;

  @Field(() => VitrinePageStatusEnum)
  status!: VitrinePageStatusEnum;

  @Field(() => String, { nullable: true })
  seoTitle!: string | null;

  @Field(() => String, { nullable: true })
  seoDescription!: string | null;

  @Field(() => String, { nullable: true })
  seoOgImageUrl!: string | null;

  /** Tableau JSON sérialisé (on évite un Scalar Json custom pour la simplicité). */
  @Field()
  sectionsJson!: string;

  @Field()
  updatedAt!: Date;
}

@ObjectType()
export class VitrinePageRevisionGraph {
  @Field(() => ID)
  id!: string;

  @Field()
  sectionsJson!: string;

  @Field(() => String, { nullable: true })
  authorUserId!: string | null;

  @Field()
  createdAt!: Date;
}

@ObjectType()
export class VitrineArticleGraph {
  @Field(() => ID)
  id!: string;

  @Field()
  slug!: string;

  @Field()
  title!: string;

  @Field(() => String, { nullable: true })
  excerpt!: string | null;

  /** Body rich-text sérialisé JSON. */
  @Field()
  bodyJson!: string;

  @Field(() => String, { nullable: true })
  coverImageUrl!: string | null;

  @Field(() => VitrineArticleStatusEnum)
  status!: VitrineArticleStatusEnum;

  @Field(() => Date, { nullable: true })
  publishedAt!: Date | null;

  @Field()
  updatedAt!: Date;
}

@ObjectType()
export class VitrineAnnouncementGraph {
  @Field(() => ID)
  id!: string;

  @Field()
  title!: string;

  @Field()
  body!: string;

  @Field()
  pinned!: boolean;

  @Field(() => Date, { nullable: true })
  publishedAt!: Date | null;
}

@ObjectType()
export class VitrineGalleryPhotoGraph {
  @Field(() => ID)
  id!: string;

  @Field()
  imageUrl!: string;

  @Field(() => String, { nullable: true })
  caption!: string | null;

  @Field(() => String, { nullable: true })
  category!: string | null;

  @Field(() => Int)
  sortOrder!: number;
}

@ObjectType()
export class PublicClubBrandingGraph {
  @Field(() => ID)
  clubId!: string;

  @Field()
  clubName!: string;

  @Field(() => String, { nullable: true })
  kanjiTagline!: string | null;

  @Field(() => String, { nullable: true })
  logoUrl!: string | null;

  /** Contenu du footer sérialisé (JSON) — Phase 1 fallback SKSR côté client. */
  @Field(() => String, { nullable: true })
  footerContent!: string | null;

  /** JSON sérialisé de la palette custom (si définie). */
  @Field(() => String, { nullable: true })
  paletteJson!: string | null;

  /** JSON sérialisé des fonts custom (si définies). */
  @Field(() => String, { nullable: true })
  fontsJson!: string | null;
}

@ObjectType()
export class VitrineMediaAssetGraph {
  @Field(() => ID)
  id!: string;

  @Field()
  publicUrl!: string;

  @Field()
  fileName!: string;

  @Field()
  mimeType!: string;

  @Field(() => Int)
  sizeBytes!: number;

  @Field(() => String, { nullable: true })
  ownerKind!: string | null;

  @Field(() => String, { nullable: true })
  ownerId!: string | null;

  @Field()
  createdAt!: Date;
}

@ObjectType()
export class SubmitVitrineContactResult {
  @Field()
  success!: boolean;

  @Field(() => String, { nullable: true })
  message!: string | null;
}

@ObjectType()
export class VitrineSettingsGraph {
  @Field(() => String, { nullable: true })
  customDomain!: string | null;

  @Field()
  vitrinePublished!: boolean;
}

@ObjectType()
export class VitrineBrandingGraph {
  @Field()
  clubName!: string;

  @Field(() => String, { nullable: true })
  logoUrl!: string | null;

  @Field(() => String, { nullable: true })
  kanjiTagline!: string | null;

  /** JSON sérialisé du contenu du footer. */
  @Field(() => String, { nullable: true })
  footerJson!: string | null;

  /** JSON sérialisé de la palette couleurs. */
  @Field(() => String, { nullable: true })
  paletteJson!: string | null;

  /** JSON sérialisé des typographies. */
  @Field(() => String, { nullable: true })
  fontsJson!: string | null;
}

@ObjectType()
export class VitrineEditTokenGraph {
  @Field()
  token!: string;

  @Field(() => Int)
  expiresInSeconds!: number;

  @Field()
  vitrineBaseUrl!: string;
}
