import { gql } from '@apollo/client';

export const CLUB = gql`
  query Club {
    club {
      id
      name
      slug
      logoUrl
      tagline
      description
    }
  }
`;

export const CLUB_MODULES = gql`
  query ClubModules {
    clubModules {
      moduleCode
      enabled
      enabledAt
      disabledAt
    }
  }
`;

export const CLUB_BRANDING = gql`
  query ClubBranding {
    clubBranding {
      id
      name
      logoUrl
      tagline
      palette {
        ink
        ink2
        paper
        accent
        goldBright
        vermillion
        line
        muted
      }
    }
  }
`;
