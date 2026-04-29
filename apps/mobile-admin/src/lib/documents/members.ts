import { gql } from '@apollo/client';

export const CLUB_MEMBERS = gql`
  query ClubMembers {
    clubMembers {
      id
      firstName
      lastName
      pseudo
      email
      phone
      birthDate
      status
      photoUrl
      gender
      gradeLevel {
        id
        label
      }
      familyId
      family {
        id
        name
      }
      currentMembership {
        id
        productLabel
        endsAt
      }
      createdAt
    }
  }
`;

export const CLUB_MEMBER = gql`
  query ClubMember($id: ID!) {
    clubMember(id: $id) {
      id
      firstName
      lastName
      pseudo
      email
      phone
      birthDate
      status
      photoUrl
      gender
      gradeLevel {
        id
        label
      }
      familyId
      family {
        id
        name
      }
      memberships {
        id
        productLabel
        startsAt
        endsAt
      }
      invoices {
        id
        number
        totalCents
        paidCents
        status
        issuedAt
      }
      eventRegistrations {
        id
        event {
          id
          title
          startsAt
        }
        status
      }
      dynamicGroups {
        id
        label
      }
      customRoles {
        id
        label
      }
      medicalCertificateExpiresAt
      notes
    }
  }
`;

export const CREATE_CLUB_MEMBER = gql`
  mutation CreateClubMember($input: CreateClubMemberInput!) {
    createClubMember(input: $input) {
      id
      firstName
      lastName
    }
  }
`;

export const UPDATE_CLUB_MEMBER = gql`
  mutation UpdateClubMember($input: UpdateClubMemberInput!) {
    updateClubMember(input: $input) {
      id
    }
  }
`;

export const DELETE_CLUB_MEMBER = gql`
  mutation DeleteClubMember($id: ID!) {
    deleteClubMember(id: $id)
  }
`;

export const SET_CLUB_MEMBER_STATUS = gql`
  mutation SetClubMemberStatus($id: ID!, $status: String!) {
    setClubMemberStatus(id: $id, status: $status) {
      id
      status
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
      label
      description
      ageMin
      ageMax
      gradeIds
      memberCount
    }
  }
`;

export const CLUB_ROLE_DEFINITIONS = gql`
  query ClubRoleDefinitions {
    clubRoleDefinitions {
      id
      label
      description
      color
    }
  }
`;
