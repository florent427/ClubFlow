import 'server-only';
import { fetchGraphQL } from './graphql-client';

/**
 * Types et queries GraphQL pour une page vitrine.
 *
 * `sectionsJson` est un tableau ordonné : [{ id, type, props }].
 * `type` = clé de bloc Next.js (hero, pageHero, manifesto, stats, …).
 * Le renderer `VitrinePageRenderer` dispatch `type` → composant dédié.
 */

export interface VitrineSection {
  id: string;
  type: string;
  props: Record<string, unknown>;
}

export interface VitrinePage {
  id: string;
  slug: string;
  templateKey: string;
  status: 'DRAFT' | 'PUBLISHED';
  seoTitle: string | null;
  seoDescription: string | null;
  seoOgImageUrl: string | null;
  sections: VitrineSection[];
}

interface PublicVitrinePageQueryData {
  publicVitrinePage: {
    id: string;
    slug: string;
    templateKey: string;
    status: 'DRAFT' | 'PUBLISHED';
    seoTitle: string | null;
    seoDescription: string | null;
    seoOgImageUrl: string | null;
    sectionsJson: string; // JSON stringifié côté API
  } | null;
}

const PUBLIC_VITRINE_PAGE = /* GraphQL */ `
  query PublicVitrinePage($clubSlug: String!, $pageSlug: String!) {
    publicVitrinePage(clubSlug: $clubSlug, pageSlug: $pageSlug) {
      id
      slug
      templateKey
      status
      seoTitle
      seoDescription
      seoOgImageUrl
      sectionsJson
    }
  }
`;

export async function fetchVitrinePage(
  clubSlug: string,
  pageSlug: string,
): Promise<VitrinePage | null> {
  try {
    const data = await fetchGraphQL<PublicVitrinePageQueryData>(
      PUBLIC_VITRINE_PAGE,
      { clubSlug, pageSlug },
      { revalidate: 60, tags: [`vitrine:${clubSlug}:${pageSlug}`] },
    );
    const page = data.publicVitrinePage;
    if (!page) return null;
    const sections = (JSON.parse(page.sectionsJson) as VitrineSection[]) ?? [];
    return {
      id: page.id,
      slug: page.slug,
      templateKey: page.templateKey,
      status: page.status,
      seoTitle: page.seoTitle,
      seoDescription: page.seoDescription,
      seoOgImageUrl: page.seoOgImageUrl,
      sections,
    };
  } catch (err) {
    console.error('[vitrine] fetchVitrinePage failed', err);
    return null;
  }
}
