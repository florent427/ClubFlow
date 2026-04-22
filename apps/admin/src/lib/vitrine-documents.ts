import { gql } from '@apollo/client';

export const CLUB_VITRINE_PAGES = gql`
  query ClubVitrinePages {
    clubVitrinePages {
      id
      slug
      templateKey
      status
      seoTitle
      seoDescription
      seoOgImageUrl
      sectionsJson
      updatedAt
    }
  }
`;

export const CLUB_VITRINE_PAGE = gql`
  query ClubVitrinePage($slug: String!) {
    clubVitrinePage(slug: $slug) {
      id
      slug
      templateKey
      status
      seoTitle
      seoDescription
      seoOgImageUrl
      sectionsJson
      updatedAt
    }
  }
`;

export const UPDATE_VITRINE_PAGE_SECTION = gql`
  mutation UpdateVitrinePageSection($input: UpdateVitrinePageSectionInput!) {
    updateVitrinePageSection(input: $input) {
      id
      sectionsJson
      updatedAt
    }
  }
`;

export const UPDATE_VITRINE_PAGE_SEO = gql`
  mutation UpdateVitrinePageSeo($input: UpdateVitrinePageSeoInput!) {
    updateVitrinePageSeo(input: $input) {
      id
      seoTitle
      seoDescription
      seoOgImageUrl
    }
  }
`;

export const SET_VITRINE_PAGE_STATUS = gql`
  mutation SetVitrinePageStatus($input: SetVitrinePageStatusInput!) {
    setVitrinePageStatus(input: $input) {
      id
      status
    }
  }
`;

export const CLUB_VITRINE_PAGE_REVISIONS = gql`
  query ClubVitrinePageRevisions($pageId: ID!) {
    clubVitrinePageRevisions(pageId: $pageId) {
      id
      sectionsJson
      authorUserId
      createdAt
    }
  }
`;

export const RESTORE_VITRINE_REVISION = gql`
  mutation RestoreVitrineRevision($input: RestoreVitrineRevisionInput!) {
    restoreVitrineRevision(input: $input) {
      id
      sectionsJson
      updatedAt
    }
  }
`;

// Fragment commun pour un article vitrine (admin) — tous les champs SEO + meta
// + état de génération IA (pour les articles lancés en background).
export const VITRINE_ARTICLE_FULL_FRAGMENT = gql`
  fragment VitrineArticleFull on VitrineArticleGraph {
    id
    slug
    title
    excerpt
    bodyJson
    status
    publishedAt
    updatedAt
    coverImageUrl
    coverImageId
    coverImageAlt
    seoTitle
    seoDescription
    seoKeywords
    seoH1
    seoFaq {
      question
      answer
    }
    seoCanonicalUrl
    seoNoindex
    seoOgImageId
    seoOgImageUrl
    generationStatus
    generationProgress
    generationError
    generationWarnings
    categories {
      id
      slug
      name
      color
    }
  }
`;

export const CLUB_VITRINE_ARTICLES = gql`
  query ClubVitrineArticles {
    clubVitrineArticles {
      ...VitrineArticleFull
    }
  }
  ${VITRINE_ARTICLE_FULL_FRAGMENT}
`;

export const CREATE_VITRINE_ARTICLE = gql`
  mutation CreateVitrineArticle($input: CreateVitrineArticleInput!) {
    createVitrineArticle(input: $input) {
      ...VitrineArticleFull
    }
  }
  ${VITRINE_ARTICLE_FULL_FRAGMENT}
`;

export const UPDATE_VITRINE_ARTICLE = gql`
  mutation UpdateVitrineArticle($input: UpdateVitrineArticleInput!) {
    updateVitrineArticle(input: $input) {
      ...VitrineArticleFull
    }
  }
  ${VITRINE_ARTICLE_FULL_FRAGMENT}
`;

export const SET_VITRINE_ARTICLE_STATUS = gql`
  mutation SetVitrineArticleStatus($input: SetVitrineArticleStatusInput!) {
    setVitrineArticleStatus(input: $input) {
      id
      status
      publishedAt
    }
  }
`;

export const DELETE_VITRINE_ARTICLE = gql`
  mutation DeleteVitrineArticle($id: ID!) {
    deleteVitrineArticle(id: $id)
  }
`;

export const CLUB_VITRINE_ANNOUNCEMENTS = gql`
  query ClubVitrineAnnouncements {
    clubVitrineAnnouncements {
      id
      title
      body
      pinned
      publishedAt
    }
  }
`;

export const CREATE_VITRINE_ANNOUNCEMENT = gql`
  mutation CreateVitrineAnnouncement($input: CreateVitrineAnnouncementInput!) {
    createVitrineAnnouncement(input: $input) {
      id
      title
      body
      pinned
      publishedAt
    }
  }
`;

export const UPDATE_VITRINE_ANNOUNCEMENT = gql`
  mutation UpdateVitrineAnnouncement($input: UpdateVitrineAnnouncementInput!) {
    updateVitrineAnnouncement(input: $input) {
      id
      title
      body
      pinned
      publishedAt
    }
  }
`;

export const DELETE_VITRINE_ANNOUNCEMENT = gql`
  mutation DeleteVitrineAnnouncement($id: ID!) {
    deleteVitrineAnnouncement(id: $id)
  }
`;

export const CLUB_VITRINE_GALLERY = gql`
  query ClubVitrineGalleryPhotos {
    clubVitrineGalleryPhotos {
      id
      imageUrl
      caption
      category
      sortOrder
    }
  }
`;

export const ADD_VITRINE_GALLERY_PHOTO = gql`
  mutation AddVitrineGalleryPhoto($input: AddVitrineGalleryPhotoInput!) {
    addVitrineGalleryPhoto(input: $input) {
      id
      imageUrl
      caption
      category
      sortOrder
    }
  }
`;

export const UPDATE_VITRINE_GALLERY_PHOTO = gql`
  mutation UpdateVitrineGalleryPhoto($input: UpdateVitrineGalleryPhotoInput!) {
    updateVitrineGalleryPhoto(input: $input) {
      id
      imageUrl
      caption
      category
      sortOrder
    }
  }
`;

export const DELETE_VITRINE_GALLERY_PHOTO = gql`
  mutation DeleteVitrineGalleryPhoto($id: ID!) {
    deleteVitrineGalleryPhoto(id: $id)
  }
`;

export interface ClubGalleryPhoto {
  id: string;
  imageUrl: string;
  caption: string | null;
  category: string | null;
  sortOrder: number;
}

export interface ClubVitrineGalleryData {
  clubVitrineGalleryPhotos: ClubGalleryPhoto[];
}

export const CLUB_VITRINE_SETTINGS = gql`
  query ClubVitrineSettings {
    clubVitrineSettings {
      customDomain
      vitrinePublished
    }
  }
`;

export const UPDATE_VITRINE_SETTINGS = gql`
  mutation UpdateClubVitrineSettings($input: UpdateVitrineSettingsInput!) {
    updateClubVitrineSettings(input: $input) {
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
      footerJson
      paletteJson
      fontsJson
    }
  }
`;

export const UPDATE_VITRINE_BRANDING = gql`
  mutation UpdateClubVitrineBranding($input: UpdateVitrineBrandingInput!) {
    updateClubVitrineBranding(input: $input) {
      clubName
      logoUrl
      kanjiTagline
      footerJson
      paletteJson
      fontsJson
    }
  }
`;

export interface ClubVitrineBrandingData {
  clubVitrineBranding: {
    clubName: string;
    logoUrl: string | null;
    kanjiTagline: string | null;
    footerJson: string | null;
    paletteJson: string | null;
    fontsJson: string | null;
  };
}

export const ISSUE_VITRINE_EDIT_TOKEN = gql`
  mutation IssueVitrineEditToken {
    issueVitrineEditToken {
      token
      expiresInSeconds
      vitrineBaseUrl
    }
  }
`;

// Types pour Apollo
export type VitrinePageStatus = 'DRAFT' | 'PUBLISHED';

export interface ClubVitrineSettingsData {
  clubVitrineSettings: {
    customDomain: string | null;
    vitrinePublished: boolean;
  };
}

export interface IssueVitrineEditTokenData {
  issueVitrineEditToken: {
    token: string;
    expiresInSeconds: number;
    vitrineBaseUrl: string;
  };
}

export interface AdminVitrinePage {
  id: string;
  slug: string;
  templateKey: string;
  status: VitrinePageStatus;
  seoTitle: string | null;
  seoDescription: string | null;
  seoOgImageUrl: string | null;
  sectionsJson: string;
  updatedAt: string;
}

export interface ClubVitrinePagesData {
  clubVitrinePages: AdminVitrinePage[];
}

export interface ClubVitrinePageData {
  clubVitrinePage: AdminVitrinePage | null;
}

export interface VitrineArticleFaqItem {
  question: string;
  answer: string;
}

export type VitrineArticleGenerationStatus =
  | 'NONE'
  | 'PENDING'
  | 'DONE'
  | 'FAILED';

export interface ArticleCategoryLink {
  id: string;
  slug: string;
  name: string;
  color: string | null;
}

export interface AdminVitrineArticle {
  id: string;
  slug: string;
  title: string;
  excerpt: string | null;
  bodyJson: string;
  status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
  publishedAt: string | null;
  updatedAt: string;
  coverImageUrl: string | null;
  coverImageId: string | null;
  coverImageAlt: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
  seoKeywords: string[];
  seoH1: string | null;
  seoFaq: VitrineArticleFaqItem[];
  seoCanonicalUrl: string | null;
  seoNoindex: boolean;
  seoOgImageId: string | null;
  seoOgImageUrl: string | null;
  generationStatus: VitrineArticleGenerationStatus;
  generationProgress: string | null;
  generationError: string | null;
  generationWarnings: string[];
  categories: ArticleCategoryLink[];
}

export interface ClubVitrineArticlesData {
  clubVitrineArticles: AdminVitrineArticle[];
}

export interface CreateVitrineArticleData {
  createVitrineArticle: AdminVitrineArticle;
}

export interface UpdateVitrineArticleData {
  updateVitrineArticle: AdminVitrineArticle;
}

export interface AdminVitrineAnnouncement {
  id: string;
  title: string;
  body: string;
  pinned: boolean;
  publishedAt: string | null;
}

export interface ClubVitrineAnnouncementsData {
  clubVitrineAnnouncements: AdminVitrineAnnouncement[];
}

// ============================================
// Catégories
// ============================================

export const CLUB_VITRINE_CATEGORIES = gql`
  query ClubVitrineCategories {
    clubVitrineCategories {
      id
      slug
      name
      description
      color
      sortOrder
      articleCount
      createdAt
      updatedAt
    }
  }
`;

export const CREATE_VITRINE_CATEGORY = gql`
  mutation CreateVitrineCategory($input: CreateVitrineCategoryInput!) {
    createVitrineCategory(input: $input) {
      id
      slug
      name
      description
      color
      sortOrder
      articleCount
    }
  }
`;

export const UPDATE_VITRINE_CATEGORY = gql`
  mutation UpdateVitrineCategory($input: UpdateVitrineCategoryInput!) {
    updateVitrineCategory(input: $input) {
      id
      slug
      name
      description
      color
      sortOrder
      articleCount
    }
  }
`;

export const DELETE_VITRINE_CATEGORY = gql`
  mutation DeleteVitrineCategory($id: ID!) {
    deleteVitrineCategory(id: $id)
  }
`;

export const SET_VITRINE_ARTICLE_CATEGORIES = gql`
  mutation SetVitrineArticleCategories(
    $input: SetVitrineArticleCategoriesInput!
  ) {
    setVitrineArticleCategories(input: $input)
  }
`;

export interface AdminVitrineCategory {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  color: string | null;
  sortOrder: number;
  articleCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface ClubVitrineCategoriesData {
  clubVitrineCategories: AdminVitrineCategory[];
}

// ============================================
// Commentaires
// ============================================

export type VitrineCommentStatus =
  | 'PENDING'
  | 'APPROVED'
  | 'NEEDS_REVIEW'
  | 'REJECTED'
  | 'SPAM';

export const CLUB_VITRINE_COMMENTS = gql`
  query ClubVitrineComments($status: VitrineCommentStatus) {
    clubVitrineComments(status: $status) {
      id
      articleId
      articleSlug
      articleTitle
      authorName
      authorEmail
      body
      status
      aiScore
      aiCategory
      aiReason
      adminReplyBody
      adminReplyAuthorName
      adminReplyAt
      createdAt
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

export const GENERATE_VITRINE_COMMENT_REPLY = gql`
  mutation GenerateVitrineCommentReply($input: GenerateCommentReplyInput!) {
    generateVitrineCommentReply(input: $input)
  }
`;

export const SET_VITRINE_COMMENT_REPLY = gql`
  mutation SetVitrineCommentReply($input: SetVitrineCommentReplyInput!) {
    setVitrineCommentReply(input: $input) {
      id
      adminReplyBody
      adminReplyAuthorName
      adminReplyAt
    }
  }
`;

export interface AdminVitrineComment {
  id: string;
  articleId: string;
  articleSlug: string;
  articleTitle: string;
  authorName: string;
  authorEmail: string;
  body: string;
  status: VitrineCommentStatus;
  aiScore: number | null;
  aiCategory: string | null;
  aiReason: string | null;
  adminReplyBody: string | null;
  adminReplyAuthorName: string | null;
  adminReplyAt: string | null;
  createdAt: string;
}

export interface ClubVitrineCommentsData {
  clubVitrineComments: AdminVitrineComment[];
}
