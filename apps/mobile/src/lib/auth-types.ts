export type ViewerProfile = {
  memberId: string | null;
  contactId: string | null;
  clubId: string;
  firstName: string;
  lastName: string;
  isPrimaryProfile: boolean;
  familyId: string | null;
  householdGroupId?: string | null;
  /** URL photo de la fiche Member ou Contact (optionnel). */
  photoUrl?: string | null;
  /** Nom du club rattaché — affiché sur les cartes SelectProfile pour
   *  différencier les profils multi-clubs. */
  clubName?: string | null;
  clubLogoUrl?: string | null;
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
  registerContact: { ok: boolean; requiresEmailVerification: boolean };
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

export type ResendVerificationData = {
  resendVerificationEmail: { ok: boolean };
};
