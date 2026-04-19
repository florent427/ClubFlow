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
    medicalCertExpiringSoonCount?: number;
    medicalCertExpiredCount?: number;
  };
};

export type ClubModulesQueryData = {
  clubModules: { id: string; moduleCode: ModuleCodeStr; enabled: boolean }[];
};

export type ClubHostedMailOfferQueryData = {
  clubHostedMailOffer: {
    enabled: boolean;
    previewFqdn: string | null;
  };
};

export type ClubSendingDomainsQueryData = {
  clubSendingDomains: {
    id: string;
    fqdn: string;
    purpose: string;
    verificationStatus: string;
    lastCheckedAt: string | null;
    webhookUrlHint: string | null;
    isClubflowHosted: boolean;
    dnsRecords: {
      type: string;
      name: string;
      value: string;
      ttl: number | null;
      priority: number | null;
    }[];
  }[];
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

export type ClubMemberTelegramQueryData = {
  clubMember: {
    id: string;
    telegramLinked: boolean;
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
    telegramLinked: boolean;
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

export type ClubMemberEmailDuplicateInfoQueryData = {
  clubMemberEmailDuplicateInfo: {
    isClear: boolean;
    suggestedFamilyId: string | null;
    familyLabel: string | null;
    sharedEmail: string | null;
    existingMemberLabels: string[] | null;
    blockedMessage: string | null;
  };
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
    bookingEnabled: boolean;
    bookingCapacity: number | null;
    bookingOpensAt: string | null;
    bookingClosesAt: string | null;
    bookedCount: number;
    waitlistCount: number;
  }[];
};

export type UpdateClubCourseSlotMutationData = {
  updateClubCourseSlot: {
    id: string;
    venueId: string;
    coachMemberId: string;
    title: string;
    startsAt: string;
    endsAt: string;
    dynamicGroupId: string | null;
    bookingEnabled: boolean;
    bookingCapacity: number | null;
    bookingOpensAt: string | null;
    bookingClosesAt: string | null;
  };
};

export type ClubCourseSlotBookingsQueryData = {
  clubCourseSlotBookings: {
    id: string;
    memberId: string;
    status: 'BOOKED' | 'WAITLISTED' | 'CANCELLED';
    bookedAt: string;
    cancelledAt: string | null;
    note: string | null;
    displayName: string;
  }[];
};

export type FamiliesQueryData = {
  clubFamilies: {
    id: string;
    label: string | null;
    householdGroupId: string | null;
    needsPayer: boolean;
    links: {
      id: string;
      memberId: string | null;
      contactId: string | null;
      linkRole: string;
    }[];
  }[];
};

export type TransferMemberFamilyMutationData = {
  transferClubMemberToFamily: {
    id: string;
    needsPayer: boolean;
    label: string | null;
    links: {
      memberId: string | null;
      contactId: string | null;
      linkRole: string;
    }[];
  };
};

export type SetClubFamilyPayerMutationData = {
  setClubFamilyPayer: {
    id: string;
    needsPayer: boolean;
    links: {
      memberId: string | null;
      contactId: string | null;
      linkRole: string;
    }[];
  };
};

export type UpdateClubFamilyMutationData = {
  updateClubFamily: {
    id: string;
    label: string | null;
    needsPayer: boolean;
    links: {
      id: string;
      memberId: string | null;
      contactId: string | null;
      linkRole: string;
    }[];
  };
};

export type AttachClubContactToFamilyAsMemberMutationData = {
  attachClubContactToFamilyAsMember: {
    id: string;
    label: string | null;
    needsPayer: boolean;
    links: {
      id: string;
      memberId: string | null;
      contactId: string | null;
      linkRole: string;
    }[];
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

export type PricingAdjustmentTypeStr = 'PERCENT_BP' | 'FIXED_CENTS';

export type ClubPricingRulesQueryData = {
  clubPricingRules: {
    id: string;
    method: ClubPaymentMethodStr;
    adjustmentType: PricingAdjustmentTypeStr;
    adjustmentValue: number;
  }[];
};

export type UpsertClubPricingRuleMutationData = {
  upsertClubPricingRule: ClubPricingRulesQueryData['clubPricingRules'][number];
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

export type InvoiceLineAdjustmentStr =
  | 'DISCOUNT_FAMILY_FLAT'
  | 'DISCOUNT_FAMILY_PERCENT'
  | 'DISCOUNT_PUBLIC_AID'
  | 'DISCOUNT_EXCEPTIONAL';

export type InvoiceLineKindStr =
  | 'MEMBERSHIP_SUBSCRIPTION'
  | 'MEMBERSHIP_ONE_TIME_FEE';

export type SubscriptionBillingRhythmStr = 'ANNUAL' | 'MONTHLY';

export type ClubInvoiceDetailQueryData = {
  clubInvoice: {
    id: string;
    clubId: string;
    familyId: string | null;
    familyLabel: string | null;
    clubSeasonId: string | null;
    clubSeasonLabel: string | null;
    label: string;
    baseAmountCents: number;
    amountCents: number;
    totalPaidCents: number;
    balanceCents: number;
    status: InvoiceStatusStr;
    lockedPaymentMethod: ClubPaymentMethodStr | null;
    dueAt: string | null;
    createdAt: string;
    lines: {
      id: string;
      kind: InvoiceLineKindStr;
      memberId: string;
      memberFirstName: string;
      memberLastName: string;
      membershipProductId: string | null;
      membershipProductLabel: string | null;
      membershipOneTimeFeeId: string | null;
      membershipOneTimeFeeLabel: string | null;
      subscriptionBillingRhythm: SubscriptionBillingRhythmStr | null;
      baseAmountCents: number;
      adjustments: {
        id: string;
        stepOrder: number;
        type: InvoiceLineAdjustmentStr;
        amountCents: number;
        percentAppliedBp: number | null;
        reason: string | null;
      }[];
    }[];
    payments: {
      id: string;
      amountCents: number;
      method: ClubPaymentMethodStr;
      externalRef: string | null;
      paidByFirstName: string | null;
      paidByLastName: string | null;
      createdAt: string;
    }[];
  };
};

export type IssueClubInvoiceMutationData = {
  issueClubInvoice: { id: string; status: InvoiceStatusStr };
};

export type VoidClubInvoiceMutationData = {
  voidClubInvoice: { id: string; status: InvoiceStatusStr; label: string };
};

export type ClubContactRow = {
  id: string;
  clubId: string;
  userId: string;
  firstName: string;
  lastName: string;
  email: string;
  emailVerified: boolean;
  linkedMemberId: string | null;
  canDeleteContact: boolean;
  createdAt: string;
  updatedAt: string;
};

export type ClubContactsQueryData = {
  clubContacts: ClubContactRow[];
};

export type ClubContactQueryData = {
  clubContact: ClubContactRow;
};

export type UpdateClubContactMutationData = {
  updateClubContact: Pick<
    ClubContactRow,
    | 'id'
    | 'firstName'
    | 'lastName'
    | 'email'
    | 'emailVerified'
    | 'linkedMemberId'
    | 'canDeleteContact'
    | 'updatedAt'
  >;
};

export type DeleteClubContactMutationData = {
  deleteClubContact: boolean;
};

export type PromoteContactToMemberMutationData = {
  promoteContactToMember: { memberId: string };
};

export type SyncClubContactMemberLinksMutationData = {
  syncClubContactMemberLinks: boolean;
};

/** Aligné sur Prisma / GraphQL (CommunicationChannel, MessageCampaignStatus). */
export type CommunicationChannelStr = 'EMAIL' | 'TELEGRAM' | 'PUSH';
export type MessageCampaignStatusStr = 'DRAFT' | 'SENT';

export type MessageCampaignsQueryData = {
  clubMessageCampaigns: {
    id: string;
    title: string;
    body: string;
    channel: CommunicationChannelStr;
    dynamicGroupId: string | null;
    status: MessageCampaignStatusStr;
    sentAt: string | null;
    recipientCount: number;
  }[];
};

export type CreateMessageCampaignMutationData = {
  createClubMessageCampaign: {
    id: string;
    title: string;
    status: MessageCampaignStatusStr;
  };
};

export type SendMessageCampaignMutationData = {
  sendClubMessageCampaign: {
    id: string;
    status: MessageCampaignStatusStr;
    sentAt: string | null;
    recipientCount: number;
  };
};

export type UpdateMessageCampaignMutationData = {
  updateClubMessageCampaign: {
    id: string;
    title: string;
    body: string;
    channel: CommunicationChannelStr;
    dynamicGroupId: string | null;
    status: MessageCampaignStatusStr;
    sentAt: string | null;
    recipientCount: number;
  };
};

export type DeleteMessageCampaignMutationData = {
  deleteClubMessageCampaign: boolean;
};

export type QuickMessageRecipientTypeStr = 'MEMBER' | 'CONTACT';

export type SendClubQuickMessageMutationData = {
  sendClubQuickMessage: { success: boolean };
};

export type ClubAnnouncement = {
  id: string;
  title: string;
  body: string;
  pinned: boolean;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ClubAnnouncementsQueryData = {
  clubAnnouncements: ClubAnnouncement[];
};

export type CreateClubAnnouncementMutationData = {
  createClubAnnouncement: ClubAnnouncement;
};

export type UpdateClubAnnouncementMutationData = {
  updateClubAnnouncement: ClubAnnouncement;
};

export type PublishClubAnnouncementMutationData = {
  publishClubAnnouncement: Pick<ClubAnnouncement, 'id' | 'publishedAt'>;
};

export type DeleteClubAnnouncementMutationData = {
  deleteClubAnnouncement: boolean;
};

export type ClubSurveyStatusStr = 'DRAFT' | 'OPEN' | 'CLOSED';

export type ClubSurveyOption = {
  id: string;
  label: string;
  sortOrder: number;
  responseCount: number;
};

export type ClubSurvey = {
  id: string;
  title: string;
  description: string | null;
  status: ClubSurveyStatusStr;
  multipleChoice: boolean;
  allowAnonymous: boolean;
  publishedAt: string | null;
  closesAt: string | null;
  createdAt: string;
  updatedAt: string;
  totalResponses: number;
  viewerSelectedOptionIds: string[];
  options: ClubSurveyOption[];
};

export type ClubSurveysQueryData = {
  clubSurveys: ClubSurvey[];
};

export type CreateClubSurveyMutationData = {
  createClubSurvey: ClubSurvey;
};

export type OpenClubSurveyMutationData = {
  openClubSurvey: ClubSurvey;
};

export type CloseClubSurveyMutationData = {
  closeClubSurvey: ClubSurvey;
};

export type DeleteClubSurveyMutationData = {
  deleteClubSurvey: boolean;
};

export type ClubEventStatusStr = 'DRAFT' | 'PUBLISHED' | 'CANCELLED';
export type ClubEventRegistrationStatusStr =
  | 'REGISTERED'
  | 'WAITLISTED'
  | 'CANCELLED';

export type ClubEventRegistration = {
  id: string;
  memberId: string | null;
  contactId: string | null;
  status: ClubEventRegistrationStatusStr;
  registeredAt: string;
  cancelledAt: string | null;
  note: string | null;
  displayName: string | null;
};

export type ClubEvent = {
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
  status: ClubEventStatusStr;
  publishedAt: string | null;
  allowContactRegistration: boolean;
  createdAt: string;
  updatedAt: string;
  registeredCount: number;
  waitlistCount: number;
  viewerRegistrationStatus: ClubEventRegistrationStatusStr | null;
  registrations: ClubEventRegistration[];
};

export type ClubEventsQueryData = { clubEvents: ClubEvent[] };
export type CreateClubEventMutationData = { createClubEvent: ClubEvent };
export type UpdateClubEventMutationData = { updateClubEvent: ClubEvent };
export type PublishClubEventMutationData = { publishClubEvent: ClubEvent };
export type CancelClubEventMutationData = { cancelClubEvent: ClubEvent };
export type DeleteClubEventMutationData = { deleteClubEvent: boolean };

export type BlogPostStatusGql = 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';

export type BlogPost = {
  id: string;
  clubId: string;
  authorUserId: string;
  slug: string;
  title: string;
  excerpt: string | null;
  body: string;
  coverImageUrl: string | null;
  status: BlogPostStatusGql;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ClubBlogPostsQueryData = { clubBlogPosts: BlogPost[] };
export type CreateClubBlogPostMutationData = { createClubBlogPost: BlogPost };
export type UpdateClubBlogPostMutationData = { updateClubBlogPost: BlogPost };
export type PublishClubBlogPostMutationData = { publishClubBlogPost: BlogPost };
export type ArchiveClubBlogPostMutationData = { archiveClubBlogPost: BlogPost };
export type DeleteClubBlogPostMutationData = { deleteClubBlogPost: boolean };

export type ShopProduct = {
  id: string;
  clubId: string;
  sku: string | null;
  name: string;
  description: string | null;
  imageUrl: string | null;
  priceCents: number;
  stock: number | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

export type ShopOrderStatusGql = 'PENDING' | 'PAID' | 'CANCELLED';

export type ShopOrderLine = {
  id: string;
  orderId: string;
  productId: string;
  quantity: number;
  unitPriceCents: number;
  label: string;
};

export type ShopOrder = {
  id: string;
  clubId: string;
  memberId: string | null;
  contactId: string | null;
  status: ShopOrderStatusGql;
  totalCents: number;
  note: string | null;
  createdAt: string;
  updatedAt: string;
  paidAt: string | null;
  lines: ShopOrderLine[];
  buyerFirstName: string | null;
  buyerLastName: string | null;
};

export type ShopProductsQueryData = { shopProducts: ShopProduct[] };
export type CreateShopProductMutationData = { createShopProduct: ShopProduct };
export type UpdateShopProductMutationData = { updateShopProduct: ShopProduct };
export type DeleteShopProductMutationData = { deleteShopProduct: boolean };
export type ShopOrdersQueryData = { shopOrders: ShopOrder[] };
export type MarkShopOrderPaidMutationData = { markShopOrderPaid: ShopOrder };
export type CancelShopOrderMutationData = { cancelShopOrder: ShopOrder };

export type SponsorshipDealStatusGql = 'ACTIVE' | 'CLOSED';
export type SponsorshipDeal = {
  id: string;
  sponsorName: string;
  status: SponsorshipDealStatusGql;
  amountCents: number | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};
export type ClubSponsorshipDealsData = {
  clubSponsorshipDeals: SponsorshipDeal[];
};
export type CreateClubSponsorshipDealData = {
  createClubSponsorshipDeal: SponsorshipDeal;
};
export type UpdateClubSponsorshipDealData = {
  updateClubSponsorshipDeal: SponsorshipDeal;
};

export type GrantApplicationStatusGql = 'DRAFT' | 'SUBMITTED' | 'ARCHIVED';
export type GrantApplication = {
  id: string;
  title: string;
  status: GrantApplicationStatusGql;
  amountCents: number | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};
export type ClubGrantApplicationsData = {
  clubGrantApplications: GrantApplication[];
};
export type CreateClubGrantApplicationData = {
  createClubGrantApplication: GrantApplication;
};
export type UpdateClubGrantApplicationData = {
  updateClubGrantApplication: GrantApplication;
};
export type SubmitClubGrantApplicationData = {
  submitClubGrantApplication: GrantApplication;
};
export type ArchiveClubGrantApplicationData = {
  archiveClubGrantApplication: GrantApplication;
};

export type AccountingEntryKindGql = 'INCOME' | 'EXPENSE';
export type AccountingEntry = {
  id: string;
  clubId: string;
  kind: AccountingEntryKindGql;
  label: string;
  amountCents: number;
  paymentId: string | null;
  occurredAt: string;
};
export type ClubAccountingEntriesData = {
  clubAccountingEntries: AccountingEntry[];
};
export type AccountingSummary = {
  incomeCents: number;
  expenseCents: number;
  balanceCents: number;
};
export type ClubAccountingSummaryData = {
  clubAccountingSummary: AccountingSummary;
};
export type CreateClubAccountingEntryData = {
  createClubAccountingEntry: AccountingEntry;
};
