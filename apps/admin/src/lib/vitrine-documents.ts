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

export const CLUB_VITRINE_ARTICLES = gql`
  query ClubVitrineArticles {
    clubVitrineArticles {
      id
      slug
      title
      excerpt
      status
      publishedAt
      coverImageUrl
      updatedAt
    }
  }
`;

export const CREATE_VITRINE_ARTICLE = gql`
  mutation CreateVitrineArticle($input: CreateVitrineArticleInput!) {
    createVitrineArticle(input: $input) {
      id
      slug
      title
      status
    }
  }
`;

export const UPDATE_VITRINE_ARTICLE = gql`
  mutation UpdateVitrineArticle($input: UpdateVitrineArticleInput!) {
    updateVitrineArticle(input: $input) {
      id
      slug
      title
      excerpt
    }
  }
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

export interface AdminVitrineArticle {
  id: string;
  slug: string;
  title: string;
  excerpt: string | null;
  status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
  publishedAt: string | null;
  coverImageUrl: string | null;
  updatedAt: string;
}

export interface ClubVitrineArticlesData {
  clubVitrineArticles: AdminVitrineArticle[];
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
