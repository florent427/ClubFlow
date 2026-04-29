/**
 * Auth admin — utilise la mutation login partagée. Le filtrage par
 * rôle back-office se fait via la query `viewerAdminSwitch` (cf
 * VIEWER_ADMIN_SWITCH_FOR_CLUB ci-dessous) après avoir choisi un club.
 */
import { gql } from '@apollo/client';

export const ADMIN_LOGIN = gql`
  mutation AdminLogin($email: String!, $password: String!) {
    login(input: { email: $email, password: $password }) {
      accessToken
      viewerProfiles {
        memberId
        contactId
        clubId
        firstName
        lastName
        isPrimaryProfile
        familyId
        householdGroupId
      }
      contactClubId
    }
  }
`;

/**
 * Vérifie si l'utilisateur a accès au back-office du club courant.
 * Nécessite un token + header X-Club-Id (donc à appeler après set
 * session). Renvoie `canAccessClubBackOffice: boolean`.
 */
export const VIEWER_ADMIN_SWITCH = gql`
  query ViewerAdminSwitch {
    viewerAdminSwitch {
      canAccessClubBackOffice
      adminWorkspaceClubId
    }
  }
`;

/** Récupère le nom du club courant (X-Club-Id requis). */
export const CURRENT_CLUB = gql`
  query CurrentClub {
    club {
      id
      name
      slug
      logoUrl
    }
  }
`;

export { SELECT_VIEWER_PROFILE, VERIFY_EMAIL } from '@clubflow/mobile-shared';
