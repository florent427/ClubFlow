import type { MembershipRole } from '@clubflow/mobile-shared';

export type LoginProfile = {
  id: string;
  memberId: string;
  displayName: string;
  isPrimaryProfile: boolean;
  familyId: string | null;
  /** Rôle au sein du club (CLUB_ADMIN/BOARD/TREASURER/COACH/MEMBER/COMM_MANAGER). */
  membershipRole?: MembershipRole | null;
  club: {
    id: string;
    name: string;
    logoUrl?: string | null;
  };
};

export type LoginResponse = {
  accessToken: string;
  viewerProfiles: LoginProfile[];
  contactClubId?: string | null;
};
