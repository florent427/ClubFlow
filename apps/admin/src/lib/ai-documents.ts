import { gql } from '@apollo/client';

export type AiUsageFeature =
  | 'ARTICLE_GENERATION'
  | 'IMAGE_GENERATION'
  | 'OTHER';

export const CLUB_AI_SETTINGS = gql`
  query ClubAiSettings {
    clubAiSettings {
      apiKeyMasked
      hasApiKey
      textModel
      imageModel
      tokensInputUsed
      tokensOutputUsed
      imagesGenerated
      curatedTextModels
      curatedImageModels
    }
  }
`;

export const UPDATE_CLUB_AI_SETTINGS = gql`
  mutation UpdateClubAiSettings($input: UpdateAiSettingsInput!) {
    updateClubAiSettings(input: $input) {
      apiKeyMasked
      hasApiKey
      textModel
      imageModel
      tokensInputUsed
      tokensOutputUsed
      imagesGenerated
      curatedTextModels
      curatedImageModels
    }
  }
`;

export const CLUB_AI_USAGE_LOGS = gql`
  query ClubAiUsageLogs($limit: Int) {
    clubAiUsageLogs(limit: $limit) {
      id
      createdAt
      feature
      model
      inputTokens
      outputTokens
      imagesGenerated
      costCents
    }
  }
`;

export const GENERATE_VITRINE_ARTICLE_DRAFT = gql`
  mutation GenerateVitrineArticleDraft(
    $input: GenerateVitrineArticleDraftInput!
  ) {
    generateVitrineArticleDraft(input: $input) {
      title
      slug
      seoTitle
      seoDescription
      excerpt
      h1
      sections {
        h2
        paragraphs
        inlineImagePrompt
        inlineImageAlt
        inlineImageAssetId
        inlineImageUrl
      }
      faq {
        question
        answer
      }
      keywords
      featuredImagePrompt
      featuredImageAlt
      featuredImageAssetId
      featuredImageUrl
      totalInputTokens
      totalOutputTokens
      totalImagesGenerated
    }
  }
`;

export interface AiSettings {
  apiKeyMasked: string | null;
  hasApiKey: boolean;
  textModel: string;
  imageModel: string;
  tokensInputUsed: number;
  tokensOutputUsed: number;
  imagesGenerated: number;
  curatedTextModels: string[];
  curatedImageModels: string[];
}

export interface AiUsageLog {
  id: string;
  createdAt: string;
  feature: AiUsageFeature;
  model: string;
  inputTokens: number;
  outputTokens: number;
  imagesGenerated: number;
  costCents: number | null;
}

export interface AiArticleDraftSection {
  h2: string;
  paragraphs: string[];
  inlineImagePrompt: string | null;
  inlineImageAlt: string | null;
  inlineImageAssetId: string | null;
  inlineImageUrl: string | null;
}

export interface AiArticleDraft {
  title: string;
  slug: string;
  seoTitle: string;
  seoDescription: string;
  excerpt: string;
  h1: string;
  sections: AiArticleDraftSection[];
  faq: Array<{ question: string; answer: string }>;
  keywords: string[];
  featuredImagePrompt: string | null;
  featuredImageAlt: string | null;
  featuredImageAssetId: string | null;
  featuredImageUrl: string | null;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalImagesGenerated: number;
}
