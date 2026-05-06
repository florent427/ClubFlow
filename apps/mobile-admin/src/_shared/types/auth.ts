export type ViewerProfile = {
  id: string;
  memberId: string;
  displayName: string;
  isPrimaryProfile: boolean;
  familyId: string | null;
  club: {
    id: string;
    name: string;
    logoUrl?: string | null;
  };
};

export type SystemRole = 'ADMIN' | 'SUPER_ADMIN';

export type MembershipRole =
  | 'CLUB_ADMIN'
  | 'BOARD'
  | 'TREASURER'
  | 'COACH'
  | 'MEMBER'
  | 'COMM_MANAGER';

export const BACK_OFFICE_ROLES: MembershipRole[] = [
  'CLUB_ADMIN',
  'BOARD',
  'TREASURER',
];

export const COMM_ROLES: MembershipRole[] = [
  'CLUB_ADMIN',
  'BOARD',
  'TREASURER',
  'COMM_MANAGER',
];
