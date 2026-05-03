import { gql } from '@apollo/client';

/**
 * Documents GraphQL pour l'administration plate-forme.
 * Cf apps/api/src/system-admin/system-admin.resolver.ts.
 *
 * `SystemUserGql` : id, email, displayName, systemRole. Les rôles
 * possibles sont ADMIN et SUPER_ADMIN. Les mutations promote/demote
 * sont gardées par les guards SystemAdminGuard / SuperAdminGuard.
 */

export const SYSTEM_ADMINS = gql`
  query SystemAdmins {
    systemAdmins {
      id
      email
      displayName
      systemRole
    }
  }
`;

export const SYSTEM_PROMOTE_TO_ADMIN = gql`
  mutation SystemPromoteToAdmin($userId: ID!) {
    systemPromoteToAdmin(userId: $userId) {
      id
      systemRole
    }
  }
`;

export const SYSTEM_DEMOTE_ADMIN = gql`
  mutation SystemDemoteAdmin($userId: ID!) {
    systemDemoteAdmin(userId: $userId) {
      id
      systemRole
    }
  }
`;
