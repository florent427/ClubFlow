import { gql } from '@apollo/client';

/**
 * Documents GraphQL pour le module VITRINE (côté admin).
 * Cf apps/api/src/vitrine/vitrine-admin.resolver.ts.
 *
 * Quelques particularités :
 *  - VitrinePageGraph n'a pas de "title" direct, on utilise seoTitle (et templateKey).
 *  - VitrineCommentGraph utilise `body` (pas `content`), `articleTitle` est joint côté serveur.
 *  - VitrineGalleryPhotoGraph expose `imageUrl`, `caption`, `category`, `sortOrder`.
 *  - VitrineSettingsGraph expose `customDomain` + `vitrinePublished` (pas de hero/cta).
 *  - VitrineBrandingGraph expose `paletteJson`/`fontsJson` (sérialisés en JSON).
 */

export const CLUB_VITRINE_PAGES = gql`
  query ClubVitrinePages {
    clubVitrinePages {
      id
      slug
      templateKey
      status
      seoTitle
      updatedAt
    }
  }
`;

export const CLUB_VITRINE_ARTICLES = gql`
  query ClubVitrineArticles($channel: VitrineArticleChannel) {
    clubVitrineArticles(channel: $channel) {
      id
      slug
      title
      excerpt
      status
      channel
      publishedAt
      updatedAt
      pinned
      coverImageUrl
    }
  }
`;

export const CLUB_VITRINE_CATEGORIES = gql`
  query ClubVitrineCategories {
    clubVitrineCategories {
      id
      name
      slug
      articleCount
    }
  }
`;

export const CLUB_VITRINE_COMMENTS = gql`
  query ClubVitrineComments($status: VitrineCommentStatus) {
    clubVitrineComments(status: $status) {
      id
      authorName
      authorEmail
      body
      articleTitle
      status
      createdAt
    }
  }
`;

export const CLUB_VITRINE_GALLERY_PHOTOS = gql`
  query ClubVitrineGalleryPhotos($category: String) {
    clubVitrineGalleryPhotos(category: $category) {
      id
      caption
      category
      imageUrl
      sortOrder
    }
  }
`;

export const CLUB_VITRINE_SETTINGS = gql`
  query ClubVitrineSettings {
    clubVitrineSettings {
      customDomain
      vitrinePublished
    }
  }
`;

export const CLUB_VITRINE_BRANDING = gql`
  query ClubVitrineBranding {
    clubVitrineBranding {
      clubName
      logoUrl
      kanjiTagline
      paletteJson
      fontsJson
    }
  }
`;

export const SET_VITRINE_ARTICLE_STATUS = gql`
  mutation SetVitrineArticleStatus($input: SetVitrineArticleStatusInput!) {
    setVitrineArticleStatus(input: $input) {
      id
      status
    }
  }
`;

export const DELETE_VITRINE_ARTICLE = gql`
  mutation DeleteVitrineArticle($id: ID!) {
    deleteVitrineArticle(id: $id)
  }
`;

export const SET_VITRINE_ARTICLE_PINNED = gql`
  mutation SetVitrineArticlePinned($id: ID!, $pinned: Boolean!) {
    setVitrineArticlePinned(id: $id, pinned: $pinned) {
      id
      pinned
    }
  }
`;

export const SET_VITRINE_COMMENT_STATUS = gql`
  mutation SetVitrineCommentStatus($input: SetVitrineCommentStatusInput!) {
    setVitrineCommentStatus(input: $input) {
      id
      status
    }
  }
`;

export const DELETE_VITRINE_COMMENT = gql`
  mutation DeleteVitrineComment($id: ID!) {
    deleteVitrineComment(id: $id)
  }
`;
