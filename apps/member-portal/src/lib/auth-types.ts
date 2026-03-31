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
    viewerProfiles: ViewerProfile[];
  };
};

export type ViewerProfilesQueryData = {
  viewerProfiles: ViewerProfile[];
};

export type SelectProfileData = {
  selectActiveViewerProfile: {
    accessToken: string;
    viewerProfiles: { memberId: string; clubId: string }[];
  };
};
