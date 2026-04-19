export type ViewerAdminSwitchData = {
  viewerAdminSwitch: {
    canAccessClubBackOffice: boolean;
    adminWorkspaceClubId: string | null;
  };
};

export type ViewerMeData = {
  viewerMe: {
    id: string;
    firstName: string;
    lastName: string;
    pseudo: string | null;
    photoUrl: string | null;
    civility: string;
    medicalCertExpiresAt: string | null;
    gradeLevelId: string | null;
    gradeLevelLabel: string | null;
    canAccessClubBackOffice: boolean;
    adminWorkspaceClubId: string | null;
    hasClubFamily: boolean;
    canSelfAttachFamilyViaPayerEmail: boolean;
    isContactProfile: boolean;
    hideMemberModules: boolean;
    telegramLinked: boolean;
  };
};

export type ViewerJoinFamilyByPayerEmailData = {
  viewerJoinFamilyByPayerEmail: {
    success: boolean;
    message: string | null;
    familyId: string | null;
    familyLabel: string | null;
  };
};

export type FamilyInviteRole = 'COPAYER' | 'VIEWER';

export type CreateFamilyInviteData = {
  createFamilyInvite: {
    code: string;
    rawToken: string;
    expiresAt: string;
    familyId: string;
  };
};

export type PreviewFamilyInviteData = {
  previewFamilyInvite: {
    role: FamilyInviteRole;
    familyLabel: string | null;
    inviterFirstName: string | null;
    inviterLastName: string | null;
    clubName: string | null;
    expiresAt: string;
  };
};

export type AcceptFamilyInviteData = {
  acceptFamilyInvite: {
    success: boolean;
    message: string | null;
    familyId: string | null;
    familyLabel: string | null;
  };
};

export type ViewerSlot = {
  id: string;
  title: string;
  startsAt: string;
  endsAt: string;
  venueName: string;
  coachFirstName: string;
  coachLastName: string;
};

export type ViewerUpcomingData = {
  viewerUpcomingCourseSlots: ViewerSlot[];
};

export type ViewerBillingData = {
  viewerFamilyBillingSummary: {
    isPayerView: boolean;
    familyLabel: string | null;
    isHouseholdGroupSpace: boolean;
    linkedHouseholdFamilies: Array<{
      familyId: string;
      label: string | null;
      members: Array<{
        memberId: string;
        firstName: string;
        lastName: string;
        photoUrl: string | null;
      }>;
    }>;
    invoices: Array<{
      id: string;
      label: string;
      status: string;
      dueAt: string | null;
      amountCents: number;
      totalPaidCents: number;
      balanceCents: number;
      payments: Array<{
        id: string;
        amountCents: number;
        method: string;
        createdAt: string;
        paidByFirstName: string | null;
        paidByLastName: string | null;
      }>;
    }>;
    familyMembers: Array<{
      memberId: string;
      firstName: string;
      lastName: string;
      photoUrl: string | null;
    }>;
  };
};

export type ClubQueryData = {
  club: { id: string; name: string; slug: string };
};

export type ViewerMemberCreatedResult = {
  memberId: string;
  firstName: string;
  lastName: string;
};

export type ViewerPromoteSelfToMemberData = {
  viewerPromoteSelfToMember: ViewerMemberCreatedResult;
};

export type ViewerRegisterChildMemberData = {
  viewerRegisterChildMember: ViewerMemberCreatedResult;
};

export type ViewerMembershipFormula = {
  id: string;
  label: string;
  annualAmountCents: number;
  monthlyAmountCents: number;
  minAge: number | null;
  maxAge: number | null;
  allowProrata: boolean;
};

export type ViewerEligibleMembershipFormulasData = {
  viewerEligibleMembershipFormulas: ViewerMembershipFormula[];
};

export type SubscriptionBillingRhythm = 'ANNUAL' | 'MONTHLY';
