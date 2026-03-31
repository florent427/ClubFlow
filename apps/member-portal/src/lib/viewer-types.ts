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
    photoUrl: string | null;
    civility: string;
    medicalCertExpiresAt: string | null;
    gradeLevelId: string | null;
    gradeLevelLabel: string | null;
    canAccessClubBackOffice: boolean;
    adminWorkspaceClubId: string | null;
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
