import { Field, Float, ID, Int, ObjectType, registerEnumType } from '@nestjs/graphql';

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

export enum VitrineArticleGenerationStatusEnum {
  NONE = 'NONE',
  PENDING = 'PENDING',
  DONE = 'DONE',
  FAILED = 'FAILED',
}
registerEnumType(VitrineArticleGenerationStatusEnum, {
  name: 'VitrineArticleGenerationStatus',
});

export enum VitrineArticleChannelEnum {
  NEWS = 'NEWS',
  BLOG = 'BLOG',
}
registerEnumType(VitrineArticleChannelEnum, {
  name: 'VitrineArticleChannel',
  description:
    "Canal de publication d'un article : NEWS (affiché sur /actualites, brèves courtes) ou BLOG (affiché sur /blog, articles de fond). Même structure et mêmes fonctionnalités de création.",
});

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
export class VitrineArticleFaqItemGraph {
  @Field()
  question!: string;

  @Field()
  answer!: string;
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

  @Field(() => ID, { nullable: true })
  coverImageId!: string | null;

  @Field(() => String, { nullable: true })
  coverImageAlt!: string | null;

  @Field(() => VitrineArticleStatusEnum)
  status!: VitrineArticleStatusEnum;

  @Field(() => VitrineArticleChannelEnum, {
    description:
      "Canal de publication (NEWS = /actualites, BLOG = /blog). Même UX de création, seul l'emplacement public change.",
  })
  channel!: VitrineArticleChannelEnum;

  @Field(() => Date, { nullable: true })
  publishedAt!: Date | null;

  @Field()
  updatedAt!: Date;

  @Field(() => Boolean, {
    description: 'Article épinglé en tête de la liste /blog.',
  })
  pinned!: boolean;

  @Field(() => Int, {
    description: 'Ordre manuel (drag-and-drop). Plus petit = plus haut.',
  })
  sortOrder!: number;

  // --- SEO ---
  @Field(() => String, { nullable: true })
  seoTitle!: string | null;

  @Field(() => String, { nullable: true })
  seoDescription!: string | null;

  @Field(() => [String])
  seoKeywords!: string[];

  @Field(() => String, { nullable: true })
  seoH1!: string | null;

  @Field(() => [VitrineArticleFaqItemGraph])
  seoFaq!: VitrineArticleFaqItemGraph[];

  @Field(() => String, { nullable: true })
  seoCanonicalUrl!: string | null;

  @Field(() => Boolean)
  seoNoindex!: boolean;

  @Field(() => ID, { nullable: true })
  seoOgImageId!: string | null;

  @Field(() => String, { nullable: true })
  seoOgImageUrl!: string | null;

  // --- Génération IA en arrière-plan ---
  @Field(() => VitrineArticleGenerationStatusEnum)
  generationStatus!: VitrineArticleGenerationStatusEnum;

  @Field(() => String, { nullable: true })
  generationProgress!: string | null;

  @Field(() => String, { nullable: true })
  generationError!: string | null;

  @Field(() => [String])
  generationWarnings!: string[];

  // --- Catégories ---
  @Field(() => [ArticleCategoryLinkGraph])
  categories!: ArticleCategoryLinkGraph[];
}

/** Catégorie liée à un article (minimal — id + slug + name + color). */
@ObjectType()
export class ArticleCategoryLinkGraph {
  @Field(() => ID)
  id!: string;
  @Field()
  slug!: string;
  @Field()
  name!: string;
  @Field(() => String, { nullable: true })
  color!: string | null;
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

  @Field(() => Int, {
    description: 'Ordre manuel (drag-and-drop).',
  })
  sortOrder!: number;

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

// ============================================
// Catégorie
// ============================================

@ObjectType()
export class VitrineCategoryGraph {
  @Field(() => ID) id!: string;
  @Field() slug!: string;
  @Field() name!: string;
  @Field(() => String, { nullable: true }) description!: string | null;
  @Field(() => String, { nullable: true }) color!: string | null;
  @Field(() => Int) sortOrder!: number;
  @Field(() => Int) articleCount!: number;
  @Field() createdAt!: Date;
  @Field() updatedAt!: Date;
}

// ============================================
// Commentaire
// ============================================

export enum VitrineCommentStatusEnum {
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  NEEDS_REVIEW = 'NEEDS_REVIEW',
  REJECTED = 'REJECTED',
  SPAM = 'SPAM',
}
registerEnumType(VitrineCommentStatusEnum, { name: 'VitrineCommentStatus' });

@ObjectType()
export class VitrineCommentGraph {
  @Field(() => ID) id!: string;
  @Field(() => ID) articleId!: string;
  @Field() articleSlug!: string;
  @Field() articleTitle!: string;
  @Field() authorName!: string;
  @Field() authorEmail!: string;
  @Field() body!: string;
  @Field(() => VitrineCommentStatusEnum) status!: VitrineCommentStatusEnum;
  @Field(() => Float, { nullable: true }) aiScore!: number | null;
  @Field(() => String, { nullable: true }) aiCategory!: string | null;
  @Field(() => String, { nullable: true }) aiReason!: string | null;
  @Field(() => String, { nullable: true }) adminReplyBody!: string | null;
  @Field(() => String, { nullable: true }) adminReplyAuthorName!: string | null;
  @Field(() => Date, { nullable: true }) adminReplyAt!: Date | null;
  @Field() createdAt!: Date;
}

@ObjectType()
export class PublicVitrineCommentGraph {
  @Field(() => ID) id!: string;
  @Field() authorName!: string;
  @Field() body!: string;
  @Field() createdAt!: Date;
  @Field(() => String, { nullable: true }) adminReplyBody!: string | null;
  @Field(() => String, { nullable: true }) adminReplyAuthorName!: string | null;
  @Field(() => Date, { nullable: true }) adminReplyAt!: Date | null;
}

@ObjectType()
export class SubmitCommentResultGraph {
  @Field() success!: boolean;
  @Field(() => ID, { nullable: true }) commentId!: string | null;
  @Field(() => VitrineCommentStatusEnum) status!: VitrineCommentStatusEnum;
  @Field() message!: string;
}
