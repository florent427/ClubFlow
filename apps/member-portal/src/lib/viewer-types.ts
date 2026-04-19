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

export type ViewerClubAnnouncement = {
  id: string;
  title: string;
  body: string;
  pinned: boolean;
  publishedAt: string | null;
};

export type ViewerClubAnnouncementsData = {
  viewerClubAnnouncements: ViewerClubAnnouncement[];
};

export type ViewerClubSurveyOption = {
  id: string;
  label: string;
  sortOrder: number;
  responseCount: number;
};

export type ViewerClubSurveyStatus = 'DRAFT' | 'OPEN' | 'CLOSED';

export type ViewerClubSurvey = {
  id: string;
  title: string;
  description: string | null;
  status: ViewerClubSurveyStatus;
  multipleChoice: boolean;
  allowAnonymous: boolean;
  publishedAt: string | null;
  closesAt: string | null;
  totalResponses: number;
  viewerSelectedOptionIds: string[];
  options: ViewerClubSurveyOption[];
};

export type ViewerClubSurveysData = {
  viewerClubSurveys: ViewerClubSurvey[];
};

export type ViewerRespondToClubSurveyData = {
  viewerRespondToClubSurvey: ViewerClubSurvey;
};

export type ViewerClubEventStatus = 'DRAFT' | 'PUBLISHED' | 'CANCELLED';
export type ViewerClubEventRegistrationStatus =
  | 'REGISTERED'
  | 'WAITLISTED'
  | 'CANCELLED';

export type ViewerClubEvent = {
  id: string;
  title: string;
  description: string | null;
  location: string | null;
  startsAt: string;
  endsAt: string;
  capacity: number | null;
  registrationOpensAt: string | null;
  registrationClosesAt: string | null;
  priceCents: number | null;
  status: ViewerClubEventStatus;
  allowContactRegistration: boolean;
  registeredCount: number;
  waitlistCount: number;
  viewerRegistrationStatus: ViewerClubEventRegistrationStatus | null;
};

export type ViewerClubEventsData = {
  viewerClubEvents: ViewerClubEvent[];
};

export type ViewerRegisterToEventData = {
  viewerRegisterToEvent: ViewerClubEvent;
};

export type ViewerCancelEventRegistrationData = {
  viewerCancelEventRegistration: ViewerClubEvent;
};

export type ViewerBookingStatus = 'BOOKED' | 'WAITLISTED' | 'CANCELLED';

export type ViewerBookableSlot = {
  id: string;
  title: string;
  startsAt: string;
  endsAt: string;
  venueName: string;
  coachFirstName: string;
  coachLastName: string;
  bookingCapacity: number | null;
  bookingOpensAt: string | null;
  bookingClosesAt: string | null;
  bookedCount: number;
  waitlistCount: number;
  viewerBookingStatus: ViewerBookingStatus | null;
};

export type ViewerBookableCourseSlotsData = {
  viewerBookableCourseSlots: ViewerBookableSlot[];
};

export type ViewerBlogPostSummary = {
  id: string;
  slug: string;
  title: string;
  excerpt: string | null;
  coverImageUrl: string | null;
  publishedAt: string | null;
};

export type ViewerBlogPost = {
  id: string;
  slug: string;
  title: string;
  excerpt: string | null;
  body: string;
  coverImageUrl: string | null;
  publishedAt: string | null;
};

export type ViewerClubBlogPostsData = {
  viewerClubBlogPosts: ViewerBlogPostSummary[];
};

export type ViewerClubBlogPostData = {
  viewerClubBlogPost: ViewerBlogPost | null;
};
