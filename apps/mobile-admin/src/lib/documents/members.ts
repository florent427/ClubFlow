import { gql } from '@apollo/client';

/**
 * GraphQL documents — module Members.
 * Champs alignés avec les modèles backend (MemberGraph, GradeLevelGraph,
 * DynamicGroupGraph, ClubRoleDefinitionGraph). Le backend prime — toute
 * incohérence avec un précédent draft est intentionnelle.
 */

export const CLUB_MEMBERS = gql`
  query ClubMembers {
    clubMembers {
      id
      firstName
      lastName
      email
      pseudo
      phone
      birthDate
      photoUrl
      status
      medicalCertExpiresAt
      telegramLinked
      gradeLevel {
        id
        label
      }
      family {
        id
        label
      }
      customRoles {
        id
        label
      }
    }
  }
`;

export const CLUB_MEMBER = gql`
  query ClubMember($id: ID!) {
    clubMember(id: $id) {
      id
      firstName
      lastName
      email
      pseudo
      civility
      phone
      addressLine
      postalCode
      city
      birthDate
      photoUrl
      status
      medicalCertExpiresAt
      telegramLinked
      gradeLevel {
        id
        label
      }
      family {
        id
        label
      }
      customRoles {
        id
        label
      }
      customFieldValues {
        id
        definitionId
        valueText
      }
    }
  }
`;

export const DELETE_CLUB_MEMBER = gql`
  mutation DeleteClubMember($id: ID!) {
    deleteClubMember(id: $id)
  }
`;

export const SET_CLUB_MEMBER_STATUS = gql`
  mutation SetClubMemberStatus($id: ID!, $status: MemberStatus!) {
    setClubMemberStatus(id: $id, status: $status) {
      id
      status
    }
  }
`;

export const UPDATE_CLUB_MEMBER = gql`
  mutation UpdateClubMember($input: UpdateMemberInput!) {
    updateClubMember(input: $input) {
      id
      photoUrl
    }
  }
`;

export const CLUB_GRADE_LEVELS = gql`
  query ClubGradeLevels {
    clubGradeLevels {
      id
      label
      sortOrder
    }
  }
`;

export const CLUB_DYNAMIC_GROUPS = gql`
  query ClubDynamicGroups {
    clubDynamicGroups {
      id
      name
      minAge
      maxAge
      matchingActiveMembersCount
    }
  }
`;

export const CLUB_ROLE_DEFINITIONS = gql`
  query ClubRoleDefinitions {
    clubRoleDefinitions {
      id
      label
      sortOrder
    }
  }
`;

export const CREATE_CLUB_MEMBER = gql`
  mutation CreateClubMember($input: CreateMemberInput!) {
    createClubMember(input: $input) {
      id
    }
  }
`;

export const CLUB_FAMILIES = gql`
  query ClubFamilies {
    clubFamilies {
      id
      label
      householdGroupId
      needsPayer
      links {
        id
        memberId
        contactId
        linkRole
      }
    }
  }
`;

export const CREATE_CLUB_FAMILY = gql`
  mutation CreateClubFamily($input: CreateClubFamilyInput!) {
    createClubFamily(input: $input) {
      id
      label
    }
  }
`;

export const DELETE_CLUB_FAMILY = gql`
  mutation DeleteClubFamily($familyId: ID!) {
    deleteClubFamily(familyId: $familyId)
  }
`;
