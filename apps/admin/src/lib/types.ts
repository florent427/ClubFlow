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
    newMembersThisMonthCount: number;
    upcomingEventsCount: number;
    recentAnnouncementsCount: number;
    pendingShopOrdersCount: number;
    openGrantApplicationsCount: number;
    activeSponsorshipDealsCount: number;
    accountingBalanceCents: number;
    medicalCertExpiringSoonCount?: number;
    medicalCertExpiredCount?: number;
  };
};

export type DashboardTrendsData = {
  adminDashboardTrends: {
    revenueLast30Cents: number;
    revenuePrev30Cents: number;
    revenueTrendPct: number;
    newMembersLast30: number;
    newMembersPrev30: number;
    memberGrowthPct: number;
    overdueInvoicesCount: number;
    overdueBalanceCents: number;
    paidOnTimeRate: number;
    vitrinePublishedPagesCount: number;
    vitrinePublishedArticlesCount: number;
    vitrineContactsLast30Count: number;
  };
};

export type ClubSearchQueryData = {
  clubSearch: {
    members: { id: string; firstName: string; lastName: string; email: string | null }[];
    contacts: { id: string; firstName: string; lastName: string; email: string | null }[];
    events: { id: string; title: string; startsAt: string }[];
    blogPosts: { id: string; title: string; slug: string }[];
    announcements: { id: string; title: string }[];
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
    familyLabel: string | null;
    householdGroupId: string | null;
    householdGroupLabel: string | null;
    clubSeasonId: string | null;
    label: string;
    baseAmountCents: number;
    amountCents: number;
    status: InvoiceStatusStr;
    lockedPaymentMethod: ClubPaymentMethodStr | null;
    dueAt: string | null;
    totalPaidCents: number;
    balanceCents: number;
    creditNotesAppliedCents: number;
    isCreditNote: boolean;
    parentInvoiceId: string | null;
    creditNoteReason: string | null;
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
    creditNotesAppliedCents: number;
    status: InvoiceStatusStr;
    lockedPaymentMethod: ClubPaymentMethodStr | null;
    dueAt: string | null;
    createdAt: string;
    isCreditNote: boolean;
    parentInvoiceId: string | null;
    creditNoteReason: string | null;
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

export type CreateClubCreditNoteMutationData = {
  createClubCreditNote: ClubInvoicesQueryData['clubInvoices'][number];
};

export type ClubBrandingQueryData = {
  club: {
    id: string;
    name: string;
    slug: string;
    logoUrl: string | null;
    siret: string | null;
    address: string | null;
    legalMentions: string | null;
    contactPhone: string | null;
    contactEmail: string | null;
  };
};

export type UpdateClubBrandingMutationData = {
  updateClubBranding: ClubBrandingQueryData['club'];
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
export type CommunicationChannelStr =
  | 'EMAIL'
  | 'TELEGRAM'
  | 'PUSH'
  | 'MESSAGING';
export type MessageCampaignStatusStr = 'DRAFT' | 'SENT';

export type ChatRoomChannelModeStr = 'OPEN' | 'RESTRICTED' | 'READ_ONLY';
export type ChatRoomKindStr = 'DIRECT' | 'GROUP' | 'COMMUNITY';
export type ChatRoomPermissionTargetStr =
  | 'SYSTEM_ROLE'
  | 'MEMBER_ROLE'
  | 'CUSTOM_ROLE'
  | 'CONTACT';

export type AdminChatRoomRow = {
  id: string;
  kind: ChatRoomKindStr;
  name: string | null;
  description: string | null;
  coverImageUrl: string | null;
  channelMode: ChatRoomChannelModeStr;
  isBroadcastChannel: boolean;
  archivedAt: string | null;
  updatedAt: string;
  members: {
    memberId: string;
    role: 'MEMBER' | 'ADMIN';
    member: {
      id: string;
      firstName: string;
      lastName: string;
      pseudo: string | null;
    };
  }[];
  writePermissions: {
    id: string;
    targetKind: ChatRoomPermissionTargetStr;
    targetValue: string | null;
  }[];
  membershipScopes: {
    id: string;
    targetKind: ChatRoomPermissionTargetStr;
    targetValue: string | null;
    dynamicGroupId: string | null;
  }[];
};

export type ClubChatRoomsAdminQueryData = {
  clubChatRoomsAdmin: AdminChatRoomRow[];
};

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

export type ClubEventAttachment = {
  id: string;
  eventId: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
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
  attachments: ClubEventAttachment[];
};

export type ClubEventsQueryData = { clubEvents: ClubEvent[] };
export type CreateClubEventMutationData = { createClubEvent: ClubEvent };
export type UpdateClubEventMutationData = { updateClubEvent: ClubEvent };
export type PublishClubEventMutationData = { publishClubEvent: ClubEvent };
export type CancelClubEventMutationData = { cancelClubEvent: ClubEvent };
export type DeleteClubEventMutationData = { deleteClubEvent: boolean };

export type EventConvocationMode =
  | 'REGISTERED'
  | 'ALL_MEMBERS'
  | 'DYNAMIC_GROUP';

export type EventConvocationResult = {
  totalTargets: number;
  sent: number;
  skipped: number;
  suppressed: number;
  failed: number;
};

export type SendClubEventConvocationMutationData = {
  sendClubEventConvocation: EventConvocationResult;
};

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

export type SponsorshipDealStatusGql =
  | 'DRAFT'
  | 'ACTIVE'
  | 'CLOSED'
  | 'CANCELLED';
export type SponsorshipKindGql = 'CASH' | 'IN_KIND';
export type SponsorshipDocumentKindGql =
  | 'CONTRACT'
  | 'INVOICE'
  | 'RECEIPT'
  | 'OTHER';

export type SponsorshipInstallmentRow = {
  id: string;
  expectedAmountCents: number;
  receivedAmountCents: number | null;
  expectedAt: string | null;
  receivedAt: string | null;
  paymentId: string | null;
  accountingEntryId: string | null;
  createdAt: string;
};
export type SponsorshipDocumentRow = {
  id: string;
  mediaAssetId: string;
  kind: SponsorshipDocumentKindGql;
  fileName: string;
  publicUrl: string;
  mimeType: string;
};
export type SponsorshipDeal = {
  id: string;
  sponsorName: string;
  kind: SponsorshipKindGql;
  status: SponsorshipDealStatusGql;
  valueCents: number | null;
  amountCents: number | null;
  inKindDescription: string | null;
  projectId: string | null;
  projectTitle: string | null;
  contactId: string | null;
  contactName: string | null;
  startsAt: string | null;
  endsAt: string | null;
  notes: string | null;
  installments: SponsorshipInstallmentRow[];
  documents: SponsorshipDocumentRow[];
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

export type GrantApplicationStatusGql =
  | 'DRAFT'
  | 'REQUESTED'
  | 'GRANTED'
  | 'PARTIALLY_PAID'
  | 'PAID'
  | 'REPORTED'
  | 'SETTLED'
  | 'REJECTED'
  | 'ARCHIVED'
  // legacy value for rows not yet migrated, kept for compat
  | 'SUBMITTED';
export type GrantDocumentKindGql =
  | 'APPLICATION'
  | 'DECISION'
  | 'INVOICE'
  | 'REPORT'
  | 'OTHER';
export type GrantInstallmentRow = {
  id: string;
  expectedAmountCents: number;
  receivedAmountCents: number | null;
  expectedAt: string | null;
  receivedAt: string | null;
  paymentId: string | null;
  accountingEntryId: string | null;
  notes: string | null;
  createdAt: string;
};
export type GrantDocumentRow = {
  id: string;
  mediaAssetId: string;
  kind: GrantDocumentKindGql;
  fileName: string;
  publicUrl: string;
  mimeType: string;
};
export type GrantApplication = {
  id: string;
  title: string;
  fundingBody: string | null;
  status: GrantApplicationStatusGql;
  requestedAmountCents: number | null;
  grantedAmountCents: number | null;
  amountCents: number | null;
  projectId: string | null;
  projectTitle: string | null;
  startsAt: string | null;
  endsAt: string | null;
  reportDueAt: string | null;
  reportSubmittedAt: string | null;
  notes: string | null;
  installments: GrantInstallmentRow[];
  documents: GrantDocumentRow[];
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

export type SubmitReceiptForOcrData = {
  submitReceiptForOcr: {
    extractionId: string | null;
    entryId: string | null;
    duplicateOfEntryId: string | null;
    budgetBlocked: boolean;
  };
};

export type AccountingSuggestion = {
  accountCode: string | null;
  accountLabel: string | null;
  cohortCode: string | null;
  projectId: string | null;
  projectTitle: string | null;
  disciplineCode: string | null;
  confidenceAccount: number | null;
  confidenceCohort: number | null;
  confidenceProject: number | null;
  confidenceDiscipline: number | null;
  reasoning: string | null;
  budgetBlocked: boolean;
  errorMessage: string | null;
};
export type SuggestAccountingCategorizationData = {
  suggestAccountingCategorization: AccountingSuggestion;
};

export type ClubProjectRow = {
  id: string;
  slug: string;
  title: string;
  summary: string | null;
  status: string;
};
export type ClubProjectsData = {
  clubProjects: ClubProjectRow[];
};

export type AccountingEntryKindGql =
  | 'INCOME'
  | 'EXPENSE'
  | 'IN_KIND'
  | 'TRANSFER';
export type AccountingEntryStatusGql =
  | 'DRAFT'
  | 'NEEDS_REVIEW'
  | 'POSTED'
  | 'LOCKED'
  | 'CANCELLED';
export type AccountingEntrySourceGql =
  | 'MANUAL'
  | 'OCR_AI'
  | 'AUTO_MEMBER_PAYMENT'
  | 'AUTO_SUBSIDY'
  | 'AUTO_SPONSORSHIP'
  | 'AUTO_SHOP'
  | 'AUTO_REFUND'
  | 'AUTO_STRIPE_FEES';
export type AccountingLineSideGql = 'AUTO' | 'DEBIT' | 'CREDIT';
export type AccountingAccountKindGql =
  | 'INCOME'
  | 'EXPENSE'
  | 'ASSET'
  | 'LIABILITY'
  | 'NEUTRAL_IN_KIND';
export type AccountingGenderGql =
  | 'MALE'
  | 'FEMALE'
  | 'OTHER'
  | 'UNSPECIFIED';

export type AccountingAllocationRow = {
  id: string;
  amountCents: number;
  projectId: string | null;
  projectTitle: string | null;
  cohortCode: string | null;
  gender: AccountingGenderGql | null;
  disciplineCode: string | null;
  memberId: string | null;
  memberName: string | null;
  dynamicGroupLabels: string[];
  freeformTags: string[];
};
export type AccountingEntryLineRow = {
  id: string;
  accountCode: string;
  accountLabel: string;
  label: string | null;
  side: AccountingLineSideGql;
  debitCents: number;
  creditCents: number;
  vatRate: number | null;
  vatAmountCents: number | null;
  validatedAt: string | null;
  iaSuggestedAccountCode: string | null;
  iaReasoning: string | null;
  iaConfidencePct: number | null;
  /** Si la ligne résulte d'une consolidation, labels des articles d'origine. */
  mergedFromArticleLabels: string[];
  allocations: AccountingAllocationRow[];
};
export type AccountingDocumentRow = {
  id: string;
  mediaAssetId: string;
  fileName: string;
  publicUrl: string;
  mimeType: string;
};
export type AccountingEntry = {
  id: string;
  clubId: string;
  kind: AccountingEntryKindGql;
  status: AccountingEntryStatusGql;
  source: AccountingEntrySourceGql;
  label: string;
  amountCents: number;
  vatTotalCents: number | null;
  paymentId: string | null;
  projectId: string | null;
  contraEntryId: string | null;
  /** Compte financier de contrepartie (banque/caisse/transit). */
  financialAccountId: string | null;
  financialAccountLabel: string | null;
  financialAccountCode: string | null;
  /** Date de consolidation des lignes. Null = écriture détaillée standard. */
  consolidatedAt: string | null;
  occurredAt: string;
  createdAt: string;
  lines: AccountingEntryLineRow[];
  documents: AccountingDocumentRow[];
};
export type ClubAccountingEntriesData = {
  clubAccountingEntries: AccountingEntry[];
};
export type ClubAccountingReviewQueueData = {
  clubAccountingReviewQueue: AccountingEntry[];
};
export type AccountingSummary = {
  incomeCents: number;
  expenseCents: number;
  balanceCents: number;
  inKindCents: number;
  needsReviewCount: number;
};
export type ClubAccountingSummaryData = {
  clubAccountingSummary: AccountingSummary;
};
export type CreateClubAccountingEntryData = {
  createClubAccountingEntry: AccountingEntry;
};
export type AccountingAccountRow = {
  id: string;
  code: string;
  label: string;
  kind: AccountingAccountKindGql;
  isDefault: boolean;
  isActive: boolean;
  sortOrder: number;
};
export type ClubAccountingAccountsData = {
  clubAccountingAccounts: AccountingAccountRow[];
};
export type AccountingCohortRow = {
  id: string;
  code: string;
  label: string;
  minAge: number | null;
  maxAge: number | null;
  sortOrder: number;
  isDefault: boolean;
};
export type ClubAccountingCohortsData = {
  clubAccountingCohorts: AccountingCohortRow[];
};

// ============================================================================
// Multi-comptes financiers (banques, caisses, transit Stripe)
// ============================================================================

export type ClubFinancialAccountKindGql =
  | 'BANK'
  | 'CASH'
  | 'STRIPE_TRANSIT'
  | 'OTHER_TRANSIT';

export type ClubPaymentMethodGql =
  | 'STRIPE_CARD'
  | 'MANUAL_CASH'
  | 'MANUAL_CHECK'
  | 'MANUAL_TRANSFER';

export type ClubFinancialAccount = {
  id: string;
  kind: ClubFinancialAccountKindGql;
  label: string;
  accountingAccountId: string;
  accountingAccountCode: string;
  accountingAccountLabel: string;
  iban: string | null;
  bic: string | null;
  stripeAccountId: string | null;
  isDefault: boolean;
  isActive: boolean;
  sortOrder: number;
  notes: string | null;
};

export type ClubFinancialAccountsData = {
  clubFinancialAccounts: ClubFinancialAccount[];
};

export type ClubPaymentRoute = {
  id: string;
  method: ClubPaymentMethodGql;
  financialAccountId: string;
  financialAccountLabel: string;
  financialAccountCode: string;
};

export type ClubPaymentRoutesData = {
  clubPaymentRoutes: ClubPaymentRoute[];
};

export type ConsolidationGroup = {
  accountCode: string;
  accountLabel: string;
  lineCount: number;
  totalCents: number;
};

export type ConsolidationPreview = {
  eligible: boolean;
  reason: string | null;
  groups: ConsolidationGroup[];
};

export type AccountingEntryConsolidationPreviewData = {
  accountingEntryConsolidationPreview: ConsolidationPreview;
};

// ============================================================================
// Règles de remise pattern-based
// ============================================================================

export type MembershipPricingRulePatternGql =
  | 'FAMILY_PROGRESSIVE'
  | 'PRODUCT_BUNDLE'
  | 'AGE_RANGE_DISCOUNT'
  | 'NEW_MEMBER_DISCOUNT'
  | 'LOYALTY_DISCOUNT';

/**
 * Config typée par pattern. `configJson` arrive en string depuis GraphQL ;
 * le client la parse selon le pattern pour récupérer un objet typé.
 */
export type FamilyProgressiveConfig = {
  tiers: Array<{
    rank: number;
    type: 'PERCENT_BP' | 'FIXED_CENTS';
    value: number;
  }>;
  appliesTo: Array<'SUBSCRIPTION'>;
  /**
   * Ordre d'attribution des rangs :
   * - `AMOUNT_DESC` : la plus chère cotisation = rang 1 (plein tarif)
   * - `AMOUNT_ASC` : la moins chère = rang 1
   * - `ENROLLMENT_ORDER` : le 1ᵉʳ inscrit chronologiquement = rang 1,
   *   le 2ᵉ = rang 2, etc. (option intuitive pour les associations)
   * - `AGE_ASC` / `AGE_DESC` : par âge.
   */
  sortBy:
    | 'AMOUNT_DESC'
    | 'AMOUNT_ASC'
    | 'ENROLLMENT_ORDER'
    | 'AGE_DESC'
    | 'AGE_ASC';
};

/**
 * Config d'une règle PRODUCT_BUNDLE — un OU plusieurs primary
 * (sémantique OR : au moins un présent dans le foyer pour la saison),
 * un secondary qui reçoit la remise. Remises séparées par rythme.
 */
export type ProductBundleConfig = {
  /** Liste OR : au moins un de ces produits doit être présent. */
  primaryProductIds: string[];
  secondaryProductId: string;
  discountForAnnual: {
    type: 'PERCENT_BP' | 'FIXED_CENTS';
    value: number;
  };
  discountForMonthly: {
    type: 'PERCENT_BP' | 'FIXED_CENTS';
    value: number;
  };
};

export type AgeRangeDiscountConfig = {
  minAge: number | null;
  maxAge: number | null;
  discountType: 'PERCENT_BP' | 'FIXED_CENTS';
  discountValue: number;
};

export type MembershipPricingRule = {
  id: string;
  pattern: MembershipPricingRulePatternGql;
  label: string;
  isActive: boolean;
  priority: number;
  /** JSON sérialisé en string. À parser selon `pattern`. */
  configJson: string;
  createdAt: string;
  updatedAt: string;
};

export type ClubMembershipPricingRulesData = {
  clubMembershipPricingRules: MembershipPricingRule[];
};
