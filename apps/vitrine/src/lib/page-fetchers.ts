import 'server-only';
import { fetchGraphQL } from './graphql-client';

/**
 * Fetchers pour les données dynamiques que la vitrine peut injecter dans
 * certains blocs (FeaturedArticles, Announcements, Gallery).
 */

export interface VitrineArticleSummary {
  slug: string;
  title: string;
  excerpt: string | null;
  coverImageUrl: string | null;
  publishedAt: string | null;
}

export interface VitrineArticleFull extends VitrineArticleSummary {
  bodyJson: string;
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
  query PublicVitrineArticles($clubSlug: String!, $limit: Int) {
    publicVitrineArticles(clubSlug: $clubSlug, limit: $limit) {
      slug
      title
      excerpt
      coverImageUrl
      publishedAt
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
      publishedAt
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
): Promise<VitrineArticleSummary[]> {
  try {
    const data = await fetchGraphQL<{
      publicVitrineArticles: VitrineArticleSummary[];
    }>(
      LIST_ARTICLES,
      { clubSlug, limit },
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
