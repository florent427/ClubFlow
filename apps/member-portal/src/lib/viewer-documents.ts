import { gql } from '@apollo/client';

/** JWT + X-Club-Id seulement — ne dépend pas du garde profil membre (contrairement à viewerMe). */
export const VIEWER_ADMIN_SWITCH = gql`
  query ViewerAdminSwitch {
    viewerAdminSwitch {
      canAccessClubBackOffice
      adminWorkspaceClubId
    }
  }
`;

export const VIEWER_ME = gql`
  query ViewerMe {
    viewerMe {
      id
      firstName
      lastName
      pseudo
      photoUrl
      civility
      medicalCertExpiresAt
      gradeLevelId
      gradeLevelLabel
      canAccessClubBackOffice
      adminWorkspaceClubId
      hasClubFamily
      canSelfAttachFamilyViaPayerEmail
      isContactProfile
      hideMemberModules
      telegramLinked
    }
  }
`;

export const VIEWER_JOIN_FAMILY_BY_PAYER_EMAIL = gql`
  mutation ViewerJoinFamilyByPayerEmail($input: ViewerJoinFamilyByPayerEmailInput!) {
    viewerJoinFamilyByPayerEmail(input: $input) {
      success
      message
      familyId
      familyLabel
    }
  }
`;

export const CREATE_FAMILY_INVITE = gql`
  mutation CreateFamilyInvite($input: CreateFamilyInviteInput!) {
    createFamilyInvite(input: $input) {
      code
      rawToken
      expiresAt
      familyId
    }
  }
`;

export const PREVIEW_FAMILY_INVITE = gql`
  mutation PreviewFamilyInvite($input: PreviewFamilyInviteInput!) {
    previewFamilyInvite(input: $input) {
      role
      familyLabel
      inviterFirstName
      inviterLastName
      clubName
      expiresAt
    }
  }
`;

export const ACCEPT_FAMILY_INVITE = gql`
  mutation AcceptFamilyInvite($input: AcceptFamilyInviteInput!) {
    acceptFamilyInvite(input: $input) {
      success
      message
      familyId
      familyLabel
    }
  }
`;

export const VIEWER_UPCOMING_SLOTS = gql`
  query ViewerUpcomingCourseSlots {
    viewerUpcomingCourseSlots {
      id
      title
      startsAt
      endsAt
      venueName
      coachFirstName
      coachLastName
    }
  }
`;

export const VIEWER_FAMILY_BILLING = gql`
  query ViewerFamilyBillingSummary {
    viewerFamilyBillingSummary {
      isPayerView
      familyLabel
      isHouseholdGroupSpace
      linkedHouseholdFamilies {
        familyId
        label
        members {
          memberId
          firstName
          lastName
          photoUrl
        }
      }
      invoices {
        id
        label
        status
        dueAt
        amountCents
        totalPaidCents
        balanceCents
        payments {
          id
          amountCents
          method
          createdAt
          paidByFirstName
          paidByLastName
        }
      }
      familyMembers {
        memberId
        firstName
        lastName
        photoUrl
      }
    }
  }
`;

export const VIEWER_PROMOTE_SELF_TO_MEMBER = gql`
  mutation ViewerPromoteSelfToMember($input: ViewerPromoteSelfToMemberInput!) {
    viewerPromoteSelfToMember(input: $input) {
      memberId
      firstName
      lastName
    }
  }
`;

export const VIEWER_REGISTER_CHILD_MEMBER = gql`
  mutation ViewerRegisterChildMember($input: ViewerRegisterChildMemberInput!) {
    viewerRegisterChildMember(input: $input) {
      memberId
      firstName
      lastName
    }
  }
`;

export const CLUB = gql`
  query MemberClub {
    club {
      id
      name
      slug
    }
  }
`;
