import 'server-only';
import { fetchGraphQL } from './graphql-client';

/**
 * Fetchers pour les données dynamiques que la vitrine peut injecter dans
 * certains blocs (FeaturedArticles, Announcements, Gallery).
 */

export type VitrineArticleChannel = 'NEWS' | 'BLOG';

export interface VitrineArticleSummary {
  slug: string;
  title: string;
  excerpt: string | null;
  coverImageUrl: string | null;
  publishedAt: string | null;
  channel?: VitrineArticleChannel;
}

export interface VitrineArticleCategory {
  id: string;
  slug: string;
  name: string;
  color: string | null;
}

export interface VitrineArticleFull extends VitrineArticleSummary {
  bodyJson: string;
  coverImageAlt: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
  seoKeywords: string[];
  seoH1: string | null;
  seoCanonicalUrl: string | null;
  seoNoindex: boolean;
  seoOgImageUrl: string | null;
  seoFaq: Array<{ question: string; answer: string }>;
  categories: VitrineArticleCategory[];
  channel: VitrineArticleChannel;
}

export interface VitrineCategoryPublic {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  color: string | null;
  articleCount: number;
}

export interface VitrineCommentPublic {
  id: string;
  authorName: string;
  body: string;
  createdAt: string;
  adminReplyBody: string | null;
  adminReplyAuthorName: string | null;
  adminReplyAt: string | null;
}

export interface VitrineAnnouncementPublic {
  id: string;
  title: string;
  body: string;
  pinned: boolean;
  publishedAt: string | null;
}

export interface VitrineGalleryPhotoPublic {
  id: string;
  imageUrl: string;
  caption: string | null;
  category: string | null;
}

const LIST_ARTICLES = /* GraphQL */ `
  query PublicVitrineArticles(
    $clubSlug: String!
    $limit: Int
    $channel: VitrineArticleChannel
  ) {
    publicVitrineArticles(
      clubSlug: $clubSlug
      limit: $limit
      channel: $channel
    ) {
      slug
      title
      excerpt
      coverImageUrl
      publishedAt
      channel
    }
  }
`;

const GET_ARTICLE = /* GraphQL */ `
  query PublicVitrineArticle($clubSlug: String!, $slug: String!) {
    publicVitrineArticle(clubSlug: $clubSlug, slug: $slug) {
      slug
      title
      excerpt
      bodyJson
      coverImageUrl
      coverImageAlt
      publishedAt
      channel
      seoTitle
      seoDescription
      seoKeywords
      seoH1
      seoCanonicalUrl
      seoNoindex
      seoOgImageUrl
      seoFaq {
        question
        answer
      }
      categories {
        id
        slug
        name
        color
      }
    }
  }
`;

const LIST_CATEGORIES = /* GraphQL */ `
  query PublicVitrineCategories($clubSlug: String!) {
    publicVitrineCategories(clubSlug: $clubSlug) {
      id
      slug
      name
      description
      color
      articleCount
    }
  }
`;

const LIST_ARTICLES_BY_CATEGORY = /* GraphQL */ `
  query PublicVitrineArticlesByCategory(
    $clubSlug: String!
    $categorySlug: String!
    $limit: Int
  ) {
    publicVitrineArticlesByCategory(
      clubSlug: $clubSlug
      categorySlug: $categorySlug
      limit: $limit
    ) {
      slug
      title
      excerpt
      coverImageUrl
      publishedAt
    }
  }
`;

const LIST_COMMENTS = /* GraphQL */ `
  query PublicVitrineArticleComments(
    $clubSlug: String!
    $articleSlug: String!
  ) {
    publicVitrineArticleComments(
      clubSlug: $clubSlug
      articleSlug: $articleSlug
    ) {
      id
      authorName
      body
      createdAt
      adminReplyBody
      adminReplyAuthorName
      adminReplyAt
    }
  }
`;

const LIST_ANNOUNCEMENTS = /* GraphQL */ `
  query PublicVitrineAnnouncements($clubSlug: String!) {
    publicVitrineAnnouncements(clubSlug: $clubSlug) {
      id
      title
      body
      pinned
      publishedAt
    }
  }
`;

const LIST_GALLERY = /* GraphQL */ `
  query PublicVitrineGalleryPhotos($clubSlug: String!, $category: String) {
    publicVitrineGalleryPhotos(clubSlug: $clubSlug, category: $category) {
      id
      imageUrl
      caption
      category
    }
  }
`;

export async function fetchArticles(
  clubSlug: string,
  limit = 20,
  channel: VitrineArticleChannel | null = null,
): Promise<VitrineArticleSummary[]> {
  try {
    const data = await fetchGraphQL<{
      publicVitrineArticles: VitrineArticleSummary[];
    }>(
      LIST_ARTICLES,
      { clubSlug, limit, channel: channel ?? null },
      { revalidate: 120, tags: [`vitrine-articles:${clubSlug}`] },
    );
    return data.publicVitrineArticles;
  } catch (err) {
    console.error('[vitrine] fetchArticles failed', err);
    return [];
  }
}

export async function fetchArticle(
  clubSlug: string,
  slug: string,
): Promise<VitrineArticleFull | null> {
  try {
    const data = await fetchGraphQL<{
      publicVitrineArticle: VitrineArticleFull | null;
    }>(
      GET_ARTICLE,
      { clubSlug, slug },
      {
        revalidate: 120,
        tags: [`vitrine-article:${clubSlug}:${slug}`],
      },
    );
    return data.publicVitrineArticle;
  } catch (err) {
    console.error('[vitrine] fetchArticle failed', err);
    return null;
  }
}

export async function fetchAnnouncements(
  clubSlug: string,
): Promise<VitrineAnnouncementPublic[]> {
  try {
    const data = await fetchGraphQL<{
      publicVitrineAnnouncements: VitrineAnnouncementPublic[];
    }>(
      LIST_ANNOUNCEMENTS,
      { clubSlug },
      { revalidate: 120, tags: [`vitrine-announcements:${clubSlug}`] },
    );
    return data.publicVitrineAnnouncements;
  } catch (err) {
    console.error('[vitrine] fetchAnnouncements failed', err);
    return [];
  }
}

export async function fetchGalleryPhotos(
  clubSlug: string,
  category: string | null = null,
): Promise<VitrineGalleryPhotoPublic[]> {
  try {
    const data = await fetchGraphQL<{
      publicVitrineGalleryPhotos: VitrineGalleryPhotoPublic[];
    }>(
      LIST_GALLERY,
      { clubSlug, category },
      { revalidate: 300, tags: [`vitrine-gallery:${clubSlug}`] },
    );
    return data.publicVitrineGalleryPhotos;
  } catch (err) {
    console.error('[vitrine] fetchGalleryPhotos failed', err);
    return [];
  }
}

export async function fetchCategories(
  clubSlug: string,
): Promise<VitrineCategoryPublic[]> {
  try {
    const data = await fetchGraphQL<{
      publicVitrineCategories: VitrineCategoryPublic[];
    }>(
      LIST_CATEGORIES,
      { clubSlug },
      { revalidate: 300, tags: [`vitrine-categories:${clubSlug}`] },
    );
    return data.publicVitrineCategories;
  } catch (err) {
    console.error('[vitrine] fetchCategories failed', err);
    return [];
  }
}

export async function fetchArticlesByCategory(
  clubSlug: string,
  categorySlug: string,
  limit = 20,
): Promise<VitrineArticleSummary[]> {
  try {
    const data = await fetchGraphQL<{
      publicVitrineArticlesByCategory: VitrineArticleSummary[];
    }>(
      LIST_ARTICLES_BY_CATEGORY,
      { clubSlug, categorySlug, limit },
      {
        revalidate: 120,
        tags: [
          `vitrine-articles:${clubSlug}`,
          `vitrine-category:${clubSlug}:${categorySlug}`,
        ],
      },
    );
    return data.publicVitrineArticlesByCategory;
  } catch (err) {
    console.error('[vitrine] fetchArticlesByCategory failed', err);
    return [];
  }
}

export async function fetchArticleComments(
  clubSlug: string,
  articleSlug: string,
): Promise<VitrineCommentPublic[]> {
  try {
    const data = await fetchGraphQL<{
      publicVitrineArticleComments: VitrineCommentPublic[];
    }>(
      LIST_COMMENTS,
      { clubSlug, articleSlug },
      {
        revalidate: 60,
        tags: [`vitrine-comments:${clubSlug}:${articleSlug}`],
      },
    );
    return data.publicVitrineArticleComments;
  } catch (err) {
    console.error('[vitrine] fetchArticleComments failed', err);
    return [];
  }
}
