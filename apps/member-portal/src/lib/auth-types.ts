export type ViewerProfile = {
  memberId: string;
  clubId: string;
  firstName: string;
  lastName: string;
  isPrimaryProfile: boolean;
  familyId: string | null;
};

export type LoginWithProfilesData = {
  login: {
    accessToken: string;
    contactClubId?: string | null;
    viewerProfiles: ViewerProfile[];
  };
};

export type ViewerProfilesQueryData = {
  viewerProfiles: ViewerProfile[];
};

export type SelectProfileData = {
  selectActiveViewerProfile: {
    accessToken: string;
    contactClubId?: string | null;
    viewerProfiles: { memberId: string; clubId: string }[];
  };
};

export type RegisterContactData = {
  registerContact: { ok: boolean };
};

export type VerifyEmailData = {
  verifyEmail: {
    accessToken: string;
    contactClubId?: string | null;
    viewerProfiles: { memberId: string; clubId: string }[];
  };
};
