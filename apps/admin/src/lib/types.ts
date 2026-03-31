import type { ModuleCodeStr } from './module-catalog';

export type LoginMutationData = {
  login: { accessToken: string; viewerProfiles?: unknown[] };
};

export type ViewerProfilesQueryData = {
  viewerProfiles: Array<{
    memberId: string;
    clubId: string;
    firstName: string;
    lastName: string;
    isPrimaryProfile: boolean;
    familyId: string | null;
  }>;
};

export type DashboardQueryData = {
  adminDashboardSummary: {
    activeMembersCount: number;
    activeModulesCount: number;
    upcomingSessionsCount: number;
    outstandingPaymentsCount: number;
    revenueCentsMonth: number;
  };
};

export type ClubModulesQueryData = {
  clubModules: { id: string; moduleCode: ModuleCodeStr; enabled: boolean }[];
};

export type MemberCustomFieldValueRow = {
  id: string;
  definitionId: string;
  valueText: string | null;
  definition: {
    id: string;
    code: string;
    label: string;
    type: string;
    required: boolean;
    sortOrder: number;
    visibleToMember: boolean;
    optionsJson: string | null;
  };
};

export type MembersQueryData = {
  clubMembers: {
    id: string;
    firstName: string;
    lastName: string;
    civility: string;
    email: string;
    phone: string | null;
    addressLine: string | null;
    postalCode: string | null;
    city: string | null;
    status: string;
    birthDate: string | null;
    photoUrl: string | null;
    medicalCertExpiresAt: string | null;
    gradeLevelId: string | null;
    gradeLevel: { id: string; label: string } | null;
    roles: string[];
    customRoles: { id: string; label: string }[];
    family: { id: string; label: string | null } | null;
    familyLink: { id: string; linkRole: string } | null;
    customFieldValues: MemberCustomFieldValueRow[];
    assignedDynamicGroups: { id: string; name: string }[];
  }[];
};

export type MemberFieldLayoutQueryData = {
  clubMemberFieldLayout: {
    catalogSettings: {
      id: string;
      fieldKey: string;
      showOnForm: boolean;
      required: boolean;
      sortOrder: number;
    }[];
    customFieldDefinitions: {
      id: string;
      code: string;
      label: string;
      type: string;
      required: boolean;
      sortOrder: number;
      visibleToMember: boolean;
      optionsJson: string | null;
    }[];
  };
};

export type GradeLevelsQueryData = {
  clubGradeLevels: { id: string; label: string; sortOrder: number }[];
};

export type RoleDefinitionsQueryData = {
  clubRoleDefinitions: { id: string; label: string; sortOrder: number }[];
};

export type UpdateMemberMutationData = {
  updateClubMember: {
    id: string;
    firstName: string;
    lastName: string;
    civility: string;
    email: string;
    phone: string | null;
    addressLine: string | null;
    postalCode: string | null;
    city: string | null;
    birthDate: string | null;
    photoUrl: string | null;
    medicalCertExpiresAt: string | null;
    gradeLevelId: string | null;
    roles: string[];
    customRoles: { id: string; label: string }[];
    customFieldValues: {
      id: string;
      definitionId: string;
      valueText: string | null;
      definition: { id: string; label: string; type: string };
    }[];
  };
};

export type DeleteMemberMutationData = {
  deleteClubMember: boolean;
};

export type DynamicGroupsQueryData = {
  clubDynamicGroups: {
    id: string;
    name: string;
    minAge: number | null;
    maxAge: number | null;
    matchingActiveMembersCount: number;
    gradeFilters: { id: string; label: string }[];
  }[];
};

export type CreateMemberMutationData = {
  createClubMember: { id: string; firstName: string; lastName: string };
};

export type VenuesQueryData = {
  clubVenues: { id: string; name: string; addressLine: string | null }[];
};

export type CourseSlotsQueryData = {
  clubCourseSlots: {
    id: string;
    venueId: string;
    coachMemberId: string;
    title: string;
    startsAt: string;
    endsAt: string;
    dynamicGroupId: string | null;
  }[];
};

export type FamiliesQueryData = {
  clubFamilies: {
    id: string;
    label: string | null;
    needsPayer: boolean;
    links: { id: string; memberId: string; linkRole: string }[];
  }[];
};

export type TransferMemberFamilyMutationData = {
  transferClubMemberToFamily: {
    id: string;
    needsPayer: boolean;
    label: string | null;
    links: { memberId: string; linkRole: string }[];
  };
};

export type SetClubFamilyPayerMutationData = {
  setClubFamilyPayer: {
    id: string;
    needsPayer: boolean;
    links: { memberId: string; linkRole: string }[];
  };
};

export type UpdateClubFamilyMutationData = {
  updateClubFamily: {
    id: string;
    label: string | null;
    needsPayer: boolean;
    links: { id: string; memberId: string; linkRole: string }[];
  };
};

/** Aligné Prisma / GraphQL `InvoiceStatus`. */
export type InvoiceStatusStr = 'DRAFT' | 'OPEN' | 'PAID' | 'VOID';

/** Aligné Prisma / GraphQL `ClubPaymentMethod`. */
export type ClubPaymentMethodStr =
  | 'STRIPE_CARD'
  | 'MANUAL_CASH'
  | 'MANUAL_CHECK'
  | 'MANUAL_TRANSFER';

export type ClubSeasonsQueryData = {
  clubSeasons: {
    id: string;
    clubId: string;
    label: string;
    startsOn: string;
    endsOn: string;
    isActive: boolean;
  }[];
};

export type ActiveClubSeasonQueryData = {
  activeClubSeason: {
    id: string;
    clubId: string;
    label: string;
    startsOn: string;
    endsOn: string;
    isActive: boolean;
  } | null;
};

export type MembershipProductsQueryData = {
  membershipProducts: {
    id: string;
    clubId: string;
    label: string;
    annualAmountCents: number;
    monthlyAmountCents: number;
    minAge: number | null;
    maxAge: number | null;
    gradeLevelIds: string[];
    allowProrata: boolean;
    allowFamily: boolean;
    allowPublicAid: boolean;
    allowExceptional: boolean;
    exceptionalCapPercentBp: number | null;
  }[];
};

export type EligibleMembershipProductsQueryData = {
  eligibleMembershipProducts: MembershipProductsQueryData['membershipProducts'];
};

export type MembershipOneTimeFeesQueryData = {
  membershipOneTimeFees: {
    id: string;
    clubId: string;
    label: string;
    amountCents: number;
  }[];
};

export type ClubInvoicesQueryData = {
  clubInvoices: {
    id: string;
    clubId: string;
    familyId: string | null;
    clubSeasonId: string | null;
    label: string;
    baseAmountCents: number;
    amountCents: number;
    status: InvoiceStatusStr;
    lockedPaymentMethod: ClubPaymentMethodStr | null;
    dueAt: string | null;
    totalPaidCents: number;
    balanceCents: number;
  }[];
};

export type RecordClubManualPaymentMutationData = {
  recordClubManualPayment: {
    id: string;
    invoiceId: string;
    amountCents: number;
    method: ClubPaymentMethodStr;
    externalRef: string | null;
    createdAt: string;
  };
};

export type ClubPricingRulesQueryData = {
  clubPricingRules: {
    id: string;
    method: ClubPaymentMethodStr;
    adjustmentType: string;
    adjustmentValue: number;
  }[];
};

export type SuggestMemberDynamicGroupsQueryData = {
  suggestMemberDynamicGroups: DynamicGroupsQueryData['clubDynamicGroups'];
};

export type CreateClubSeasonMutationData = {
  createClubSeason: ClubSeasonsQueryData['clubSeasons'][number];
};

export type UpdateClubSeasonMutationData = {
  updateClubSeason: ClubSeasonsQueryData['clubSeasons'][number];
};

export type CreateMembershipProductMutationData = {
  createMembershipProduct: MembershipProductsQueryData['membershipProducts'][number];
};

export type UpdateMembershipProductMutationData = {
  updateMembershipProduct: MembershipProductsQueryData['membershipProducts'][number];
};

export type CreateMembershipInvoiceDraftMutationData = {
  createMembershipInvoiceDraft: ClubInvoicesQueryData['clubInvoices'][number];
};

export type FinalizeMembershipInvoiceMutationData = {
  finalizeMembershipInvoice: ClubInvoicesQueryData['clubInvoices'][number];
};
