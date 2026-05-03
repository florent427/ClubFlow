import { gql } from '@apollo/client';

/**
 * GraphQL documents — module Club Life (annonces + sondages).
 * Le backend ne stocke pas de `status` sur les annonces : on dérive
 * DRAFT/PUBLISHED de `publishedAt`. Pour les sondages, le statut est
 * un enum natif (`ClubSurveyStatus`).
 */

export const CLUB_ANNOUNCEMENTS = gql`
  query ClubAnnouncements {
    clubAnnouncements {
      id
      title
      body
      pinned
      publishedAt
      createdAt
      updatedAt
    }
  }
`;

export const PUBLISH_CLUB_ANNOUNCEMENT = gql`
  mutation PublishClubAnnouncement($id: ID!) {
    publishClubAnnouncement(id: $id) {
      id
      publishedAt
    }
  }
`;

export const DELETE_CLUB_ANNOUNCEMENT = gql`
  mutation DeleteClubAnnouncement($id: ID!) {
    deleteClubAnnouncement(id: $id)
  }
`;

export const CLUB_SURVEYS = gql`
  query ClubSurveys {
    clubSurveys {
      id
      title
      description
      status
      publishedAt
      closesAt
      totalResponses
      createdAt
    }
  }
`;

export const OPEN_CLUB_SURVEY = gql`
  mutation OpenClubSurvey($id: ID!) {
    openClubSurvey(id: $id) {
      id
      status
    }
  }
`;

export const CLOSE_CLUB_SURVEY = gql`
  mutation CloseClubSurvey($id: ID!) {
    closeClubSurvey(id: $id) {
      id
      status
    }
  }
`;

export const DELETE_CLUB_SURVEY = gql`
  mutation DeleteClubSurvey($id: ID!) {
    deleteClubSurvey(id: $id)
  }
`;

export const CREATE_CLUB_ANNOUNCEMENT = gql`
  mutation CreateClubAnnouncement($input: CreateAnnouncementInput!) {
    createClubAnnouncement(input: $input) {
      id
      title
    }
  }
`;

export const CREATE_CLUB_SURVEY = gql`
  mutation CreateClubSurvey($input: CreateSurveyInput!) {
    createClubSurvey(input: $input) {
      id
      title
    }
  }
`;
