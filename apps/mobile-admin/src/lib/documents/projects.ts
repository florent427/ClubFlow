import { gql } from '@apollo/client';

/**
 * Documents GraphQL pour le module PROJECTS (côté admin).
 * Cf apps/api/src/projects/project-admin.resolver.ts.
 *
 * `ClubProjectGraph` : id, title, slug, summary, description, status,
 * startsAt/endsAt, coverImageUrl, posterAssetUrl, budgetPlannedCents,
 * limites contributeurs, showContributorCredits.
 */

export const CLUB_PROJECTS = gql`
  query ClubProjects {
    clubProjects {
      id
      title
      slug
      summary
      status
      startsAt
      endsAt
      coverImageUrl
      budgetPlannedCents
      createdAt
      updatedAt
    }
  }
`;

export const CLUB_PROJECT = gql`
  query ClubProject($id: ID!) {
    clubProject(id: $id) {
      id
      title
      slug
      summary
      description
      status
      startsAt
      endsAt
      coverImageUrl
      posterAssetUrl
      budgetPlannedCents
      showContributorCredits
      maxPhotosPerContributorPerPhase
      maxVideosPerContributorPerPhase
      maxTextsPerContributorPerPhase
      createdAt
      updatedAt
    }
  }
`;

export const CREATE_CLUB_PROJECT = gql`
  mutation CreateClubProject($input: CreateClubProjectInput!) {
    createClubProject(input: $input) {
      id
      title
      status
    }
  }
`;

export const DELETE_CLUB_PROJECT = gql`
  mutation DeleteClubProject($id: ID!) {
    deleteClubProject(id: $id)
  }
`;
