/**
 * Auth admin — recopie / extension du LOGIN partagé pour récupérer
 * le membershipRole de chaque profil (besoin du back-office).
 */
import { gql } from '@apollo/client';

export const ADMIN_LOGIN = gql`
  mutation AdminLogin($email: String!, $password: String!) {
    login(input: { email: $email, password: $password }) {
      accessToken
      viewerProfiles {
        id
        memberId
        displayName
        isPrimaryProfile
        familyId
        membershipRole
        club {
          id
          name
          logoUrl
        }
      }
      contactClubId
    }
  }
`;

export { SELECT_VIEWER_PROFILE, VERIFY_EMAIL } from '@clubflow/mobile-shared';
