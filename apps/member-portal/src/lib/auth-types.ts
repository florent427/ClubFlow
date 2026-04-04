export type ViewerProfile = {
  memberId: string | null;
  contactId: string | null;
  clubId: string;
  firstName: string;
  lastName: string;
  isPrimaryProfile: boolean;
  familyId: string | null;
  householdGroupId?: string | null;
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
    viewerProfiles: {
      memberId: string | null;
      contactId: string | null;
      clubId: string;
    }[];
  };
};

export type SelectContactProfileData = {
  selectActiveViewerContactProfile: {
    accessToken: string;
    contactClubId?: string | null;
    viewerProfiles: {
      memberId: string | null;
      contactId: string | null;
      clubId: string;
    }[];
  };
};

export type RegisterContactData = {
  registerContact: { ok: boolean };
};

export type VerifyEmailData = {
  verifyEmail: {
    accessToken: string;
    contactClubId?: string | null;
    viewerProfiles: {
      memberId: string | null;
      contactId: string | null;
      clubId: string;
    }[];
  };
};
