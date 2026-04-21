import { Field, ID, Int, ObjectType, registerEnumType } from '@nestjs/graphql';
import { AiUsageFeature } from '@prisma/client';

registerEnumType(AiUsageFeature, { name: 'AiUsageFeature' });

@ObjectType()
export class AiSettingsGraph {
  @Field(() => String, { nullable: true })
  apiKeyMasked!: string | null;

  @Field()
  hasApiKey!: boolean;

  @Field()
  textModel!: string;

  @Field()
  imageModel!: string;

  @Field(() => Int)
  tokensInputUsed!: number;

  @Field(() => Int)
  tokensOutputUsed!: number;

  @Field(() => Int)
  imagesGenerated!: number;

  @Field(() => [String])
  curatedTextModels!: string[];

  @Field(() => [String])
  curatedImageModels!: string[];
}

@ObjectType()
export class AiUsageLogGraph {
  @Field(() => ID)
  id!: string;

  @Field()
  createdAt!: Date;

  @Field(() => AiUsageFeature)
  feature!: AiUsageFeature;

  @Field()
  model!: string;

  @Field(() => Int)
  inputTokens!: number;

  @Field(() => Int)
  outputTokens!: number;

  @Field(() => Int)
  imagesGenerated!: number;

  @Field(() => Int, { nullable: true })
  costCents!: number | null;
}

@ObjectType()
export class AiArticleDraftSectionGraph {
  @Field() h2!: string;
  @Field(() => [String]) paragraphs!: string[];
  @Field(() => String, { nullable: true }) inlineImagePrompt!: string | null;
  @Field(() => String, { nullable: true }) inlineImageAlt!: string | null;
  /** Si l'image inline a été générée, id du MediaAsset associé. */
  @Field(() => ID, { nullable: true }) inlineImageAssetId!: string | null;
  @Field(() => String, { nullable: true }) inlineImageUrl!: string | null;
}

@ObjectType()
export class AiArticleFaqItemGraph {
  @Field() question!: string;
  @Field() answer!: string;
}

@ObjectType()
export class AiArticleDraftGraph {
  @Field() title!: string;
  @Field() slug!: string;
  @Field() seoTitle!: string;
  @Field() seoDescription!: string;
  @Field() excerpt!: string;
  @Field() h1!: string;
  @Field(() => [AiArticleDraftSectionGraph]) sections!: AiArticleDraftSectionGraph[];
  @Field(() => [AiArticleFaqItemGraph]) faq!: AiArticleFaqItemGraph[];
  @Field(() => [String]) keywords!: string[];

  @Field(() => String, { nullable: true }) featuredImagePrompt!: string | null;
  @Field(() => String, { nullable: true }) featuredImageAlt!: string | null;
  @Field(() => ID, { nullable: true }) featuredImageAssetId!: string | null;
  @Field(() => String, { nullable: true }) featuredImageUrl!: string | null;

  /** Récap consommation pour ce draft. */
  @Field(() => Int) totalInputTokens!: number;
  @Field(() => Int) totalOutputTokens!: number;
  @Field(() => Int) totalImagesGenerated!: number;
}
