import { gql } from '@apollo/client';

export const LOGIN = gql`
  mutation Login($input: LoginInput!) {
    login(input: $input) {
      accessToken
    }
  }
`;

export const VIEWER_PROFILES = gql`
  query AdminViewerProfiles {
    viewerProfiles {
      memberId
      clubId
      firstName
      lastName
      isPrimaryProfile
      familyId
    }
  }
`;

export const DASHBOARD_SUMMARY = gql`
  query AdminDashboardSummary {
    adminDashboardSummary {
      activeMembersCount
      activeModulesCount
      upcomingSessionsCount
      outstandingPaymentsCount
      revenueCentsMonth
    }
  }
`;

export const CLUB_MODULES = gql`
  query ClubModules {
    clubModules {
      id
      moduleCode
      enabled
    }
  }
`;

export const SET_MODULE = gql`
  mutation SetClubModule($code: ModuleCode!, $enabled: Boolean!) {
    setClubModuleEnabled(moduleCode: $code, enabled: $enabled) {
      moduleCode
      enabled
    }
  }
`;

export const CLUB_MEMBERS = gql`
  query ClubMembers {
    clubMembers {
      id
      firstName
      lastName
      civility
      email
      phone
      addressLine
      postalCode
      city
      status
      birthDate
      photoUrl
      medicalCertExpiresAt
      gradeLevelId
      gradeLevel {
        id
        label
      }
      roles
      customRoles {
        id
        label
      }
      family {
        id
        label
      }
      familyLink {
        id
        linkRole
      }
      customFieldValues {
        id
        definitionId
        valueText
        definition {
          id
          code
          label
          type
          required
          sortOrder
          visibleToMember
          optionsJson
        }
      }
      assignedDynamicGroups {
        id
        name
      }
      telegramLinked
    }
  }
`;

/** État Telegram à jour (évite un cache Apollo obsolète sur la liste clubMembers). */
export const CLUB_MEMBER_TELEGRAM = gql`
  query ClubMemberTelegram($id: ID!) {
    clubMember(id: $id) {
      id
      telegramLinked
    }
  }
`;

export const ISSUE_TELEGRAM_MEMBER_LINK = gql`
  mutation IssueTelegramMemberLink($memberId: ID!) {
    issueTelegramMemberLink(memberId: $memberId) {
      url
      expiresAt
      emailSent
    }
  }
`;

export const DISCONNECT_MEMBER_TELEGRAM = gql`
  mutation DisconnectMemberTelegram($memberId: ID!) {
    disconnectMemberTelegram(memberId: $memberId)
  }
`;

export const CLUB_CONTACTS = gql`
  query ClubContacts {
    clubContacts {
      id
      clubId
      userId
      firstName
      lastName
      email
      emailVerified
      linkedMemberId
      canDeleteContact
      createdAt
      updatedAt
    }
  }
`;

export const CLUB_CONTACT = gql`
  query ClubContact($id: ID!) {
    clubContact(id: $id) {
      id
      clubId
      userId
      firstName
      lastName
      email
      emailVerified
      linkedMemberId
      canDeleteContact
      createdAt
      updatedAt
    }
  }
`;

export const UPDATE_CLUB_CONTACT = gql`
  mutation UpdateClubContact($input: UpdateClubContactInput!) {
    updateClubContact(input: $input) {
      id
      firstName
      lastName
      email
      emailVerified
      linkedMemberId
      canDeleteContact
      updatedAt
    }
  }
`;

export const DELETE_CLUB_CONTACT = gql`
  mutation DeleteClubContact($id: ID!) {
    deleteClubContact(id: $id)
  }
`;

export const PROMOTE_CONTACT_TO_MEMBER = gql`
  mutation PromoteContactToMember($id: ID!) {
    promoteContactToMember(id: $id) {
      memberId
    }
  }
`;

export const SYNC_CLUB_CONTACT_MEMBER_LINKS = gql`
  mutation SyncClubContactMemberLinks {
    syncClubContactMemberLinks
  }
`;

export const CLUB_MEMBER_FIELD_LAYOUT = gql`
  query ClubMemberFieldLayout {
    clubMemberFieldLayout {
      catalogSettings {
        id
        fieldKey
        showOnForm
        required
        sortOrder
      }
      customFieldDefinitions {
        id
        code
        label
        type
        required
        sortOrder
        visibleToMember
        optionsJson
      }
    }
  }
`;

export const UPSERT_CLUB_MEMBER_CATALOG_FIELD_SETTINGS = gql`
  mutation UpsertClubMemberCatalogFieldSettings(
    $items: [UpsertClubMemberCatalogFieldSettingInput!]!
  ) {
    upsertClubMemberCatalogFieldSettings(items: $items) {
      id
      fieldKey
      showOnForm
      required
      sortOrder
    }
  }
`;

export const CREATE_MEMBER_CUSTOM_FIELD_DEFINITION = gql`
  mutation CreateMemberCustomFieldDefinition(
    $input: CreateMemberCustomFieldDefinitionInput!
  ) {
    createMemberCustomFieldDefinition(input: $input) {
      id
      code
      label
      type
      required
      sortOrder
      visibleToMember
      optionsJson
    }
  }
`;

export const UPDATE_MEMBER_CUSTOM_FIELD_DEFINITION = gql`
  mutation UpdateMemberCustomFieldDefinition(
    $input: UpdateMemberCustomFieldDefinitionInput!
  ) {
    updateMemberCustomFieldDefinition(input: $input) {
      id
      code
      label
      type
      required
      sortOrder
      visibleToMember
      optionsJson
    }
  }
`;

export const ARCHIVE_MEMBER_CUSTOM_FIELD_DEFINITION = gql`
  mutation ArchiveMemberCustomFieldDefinition($id: ID!) {
    archiveMemberCustomFieldDefinition(id: $id) {
      id
      code
      label
    }
  }
`;

export const CLUB_GRADE_LEVELS = gql`
  query ClubGradeLevels {
    clubGradeLevels {
      id
      label
      sortOrder
    }
  }
`;

export const CLUB_ROLE_DEFINITIONS = gql`
  query ClubRoleDefinitions {
    clubRoleDefinitions {
      id
      label
      sortOrder
    }
  }
`;

export const CREATE_CLUB_GRADE_LEVEL = gql`
  mutation CreateClubGradeLevel($input: CreateGradeLevelInput!) {
    createClubGradeLevel(input: $input) {
      id
      label
      sortOrder
    }
  }
`;

export const UPDATE_CLUB_GRADE_LEVEL = gql`
  mutation UpdateClubGradeLevel($input: UpdateGradeLevelInput!) {
    updateClubGradeLevel(input: $input) {
      id
      label
      sortOrder
    }
  }
`;

export const DELETE_CLUB_GRADE_LEVEL = gql`
  mutation DeleteClubGradeLevel($id: ID!) {
    deleteClubGradeLevel(id: $id)
  }
`;

export const CREATE_CLUB_ROLE_DEFINITION = gql`
  mutation CreateClubRoleDefinition($input: CreateClubRoleDefinitionInput!) {
    createClubRoleDefinition(input: $input) {
      id
      label
      sortOrder
    }
  }
`;

export const UPDATE_CLUB_ROLE_DEFINITION = gql`
  mutation UpdateClubRoleDefinition($input: UpdateClubRoleDefinitionInput!) {
    updateClubRoleDefinition(input: $input) {
      id
      label
      sortOrder
    }
  }
`;

export const DELETE_CLUB_ROLE_DEFINITION = gql`
  mutation DeleteClubRoleDefinition($id: ID!) {
    deleteClubRoleDefinition(id: $id)
  }
`;

export const CLUB_DYNAMIC_GROUPS = gql`
  query ClubDynamicGroups {
    clubDynamicGroups {
      id
      name
      minAge
      maxAge
      matchingActiveMembersCount
      gradeFilters {
        id
        label
      }
    }
  }
`;

export const CREATE_CLUB_DYNAMIC_GROUP = gql`
  mutation CreateClubDynamicGroup($input: CreateDynamicGroupInput!) {
    createClubDynamicGroup(input: $input) {
      id
      name
      minAge
      maxAge
      matchingActiveMembersCount
      gradeFilters {
        id
        label
      }
    }
  }
`;

export const UPDATE_CLUB_DYNAMIC_GROUP = gql`
  mutation UpdateClubDynamicGroup($input: UpdateDynamicGroupInput!) {
    updateClubDynamicGroup(input: $input) {
      id
      name
      minAge
      maxAge
      matchingActiveMembersCount
      gradeFilters {
        id
        label
      }
    }
  }
`;

export const DELETE_CLUB_DYNAMIC_GROUP = gql`
  mutation DeleteClubDynamicGroup($id: ID!) {
    deleteClubDynamicGroup(id: $id)
  }
`;

export const SUGGEST_MEMBER_DYNAMIC_GROUPS = gql`
  query SuggestMemberDynamicGroups($memberId: ID!) {
    suggestMemberDynamicGroups(memberId: $memberId) {
      id
      name
      minAge
      maxAge
      matchingActiveMembersCount
      gradeFilters {
        id
        label
      }
    }
  }
`;

export const SET_MEMBER_DYNAMIC_GROUPS = gql`
  mutation SetMemberDynamicGroups($input: SetMemberDynamicGroupsInput!) {
    setMemberDynamicGroups(input: $input)
  }
`;

export const CLUB_SEASONS = gql`
  query ClubSeasons {
    clubSeasons {
      id
      clubId
      label
      startsOn
      endsOn
      isActive
    }
  }
`;

export const ACTIVE_CLUB_SEASON = gql`
  query ActiveClubSeason {
    activeClubSeason {
      id
      clubId
      label
      startsOn
      endsOn
      isActive
    }
  }
`;

export const CREATE_CLUB_SEASON = gql`
  mutation CreateClubSeason($input: CreateClubSeasonInput!) {
    createClubSeason(input: $input) {
      id
      clubId
      label
      startsOn
      endsOn
      isActive
    }
  }
`;

export const UPDATE_CLUB_SEASON = gql`
  mutation UpdateClubSeason($input: UpdateClubSeasonInput!) {
    updateClubSeason(input: $input) {
      id
      clubId
      label
      startsOn
      endsOn
      isActive
    }
  }
`;

export const MEMBERSHIP_PRODUCTS = gql`
  query MembershipProducts {
    membershipProducts {
      id
      clubId
      label
      annualAmountCents
      monthlyAmountCents
      minAge
      maxAge
      gradeLevelIds
      allowProrata
      allowFamily
      allowPublicAid
      allowExceptional
      exceptionalCapPercentBp
    }
  }
`;

export const ELIGIBLE_MEMBERSHIP_PRODUCTS = gql`
  query EligibleMembershipProducts($memberId: ID!, $referenceDate: String) {
    eligibleMembershipProducts(
      memberId: $memberId
      referenceDate: $referenceDate
    ) {
      id
      clubId
      label
      annualAmountCents
      monthlyAmountCents
      minAge
      maxAge
      gradeLevelIds
      allowProrata
      allowFamily
      allowPublicAid
      allowExceptional
      exceptionalCapPercentBp
    }
  }
`;

export const MEMBERSHIP_ONE_TIME_FEES = gql`
  query MembershipOneTimeFees {
    membershipOneTimeFees {
      id
      clubId
      label
      amountCents
    }
  }
`;

export const CREATE_MEMBERSHIP_ONE_TIME_FEE = gql`
  mutation CreateMembershipOneTimeFee($input: CreateMembershipOneTimeFeeInput!) {
    createMembershipOneTimeFee(input: $input) {
      id
      clubId
      label
      amountCents
    }
  }
`;

export const UPDATE_MEMBERSHIP_ONE_TIME_FEE = gql`
  mutation UpdateMembershipOneTimeFee($input: UpdateMembershipOneTimeFeeInput!) {
    updateMembershipOneTimeFee(input: $input) {
      id
      clubId
      label
      amountCents
    }
  }
`;

export const ARCHIVE_MEMBERSHIP_ONE_TIME_FEE = gql`
  mutation ArchiveMembershipOneTimeFee($id: ID!) {
    archiveMembershipOneTimeFee(id: $id)
  }
`;

export const DELETE_MEMBERSHIP_ONE_TIME_FEE = gql`
  mutation DeleteMembershipOneTimeFee($id: ID!) {
    deleteMembershipOneTimeFee(id: $id)
  }
`;

export const CREATE_MEMBERSHIP_PRODUCT = gql`
  mutation CreateMembershipProduct($input: CreateMembershipProductInput!) {
    createMembershipProduct(input: $input) {
      id
      clubId
      label
      annualAmountCents
      monthlyAmountCents
      minAge
      maxAge
      gradeLevelIds
      allowProrata
      allowFamily
      allowPublicAid
      allowExceptional
      exceptionalCapPercentBp
    }
  }
`;

export const UPDATE_MEMBERSHIP_PRODUCT = gql`
  mutation UpdateMembershipProduct($input: UpdateMembershipProductInput!) {
    updateMembershipProduct(input: $input) {
      id
      clubId
      label
      annualAmountCents
      monthlyAmountCents
      minAge
      maxAge
      gradeLevelIds
      allowProrata
      allowFamily
      allowPublicAid
      allowExceptional
      exceptionalCapPercentBp
    }
  }
`;

export const DELETE_MEMBERSHIP_PRODUCT = gql`
  mutation DeleteMembershipProduct($id: ID!) {
    deleteMembershipProduct(id: $id)
  }
`;

export const CLUB_INVOICES = gql`
  query ClubInvoices {
    clubInvoices {
      id
      clubId
      familyId
      clubSeasonId
      label
      baseAmountCents
      amountCents
      status
      lockedPaymentMethod
      dueAt
      totalPaidCents
      balanceCents
    }
  }
`;

export const RECORD_CLUB_MANUAL_PAYMENT = gql`
  mutation RecordClubManualPayment($input: RecordManualPaymentInput!) {
    recordClubManualPayment(input: $input) {
      id
      invoiceId
      amountCents
      method
      externalRef
      createdAt
    }
  }
`;

export const CLUB_PRICING_RULES = gql`
  query ClubPricingRules {
    clubPricingRules {
      id
      method
      adjustmentType
      adjustmentValue
    }
  }
`;

export const CLUB_INVOICE_DETAIL = gql`
  query ClubInvoice($id: String!) {
    clubInvoice(id: $id) {
      id
      clubId
      familyId
      familyLabel
      clubSeasonId
      clubSeasonLabel
      label
      baseAmountCents
      amountCents
      totalPaidCents
      balanceCents
      status
      lockedPaymentMethod
      dueAt
      createdAt
      lines {
        id
        kind
        memberId
        memberFirstName
        memberLastName
        membershipProductId
        membershipProductLabel
        membershipOneTimeFeeId
        membershipOneTimeFeeLabel
        subscriptionBillingRhythm
        baseAmountCents
        adjustments {
          id
          stepOrder
          type
          amountCents
          percentAppliedBp
          reason
        }
      }
      payments {
        id
        amountCents
        method
        externalRef
        paidByFirstName
        paidByLastName
        createdAt
      }
    }
  }
`;

export const ISSUE_CLUB_INVOICE = gql`
  mutation IssueClubInvoice($id: String!) {
    issueClubInvoice(id: $id) {
      id
      status
    }
  }
`;

export const VOID_CLUB_INVOICE = gql`
  mutation VoidClubInvoice($id: String!, $reason: String) {
    voidClubInvoice(id: $id, reason: $reason) {
      id
      status
      label
    }
  }
`;

export const UPSERT_CLUB_PRICING_RULE = gql`
  mutation UpsertClubPricingRule($input: UpsertClubPricingRuleInput!) {
    upsertClubPricingRule(input: $input) {
      id
      method
      adjustmentType
      adjustmentValue
    }
  }
`;

export const CREATE_MEMBERSHIP_INVOICE_DRAFT = gql`
  mutation CreateMembershipInvoiceDraft(
    $input: CreateMembershipInvoiceDraftInput!
  ) {
    createMembershipInvoiceDraft(input: $input) {
      id
      clubId
      familyId
      clubSeasonId
      label
      baseAmountCents
      amountCents
      status
      lockedPaymentMethod
      dueAt
      totalPaidCents
      balanceCents
    }
  }
`;

export const FINALIZE_MEMBERSHIP_INVOICE = gql`
  mutation FinalizeMembershipInvoice($input: FinalizeMembershipInvoiceInput!) {
    finalizeMembershipInvoice(input: $input) {
      id
      clubId
      familyId
      clubSeasonId
      label
      baseAmountCents
      amountCents
      status
      lockedPaymentMethod
      dueAt
      totalPaidCents
      balanceCents
    }
  }
`;

export const CLUB_MEMBER_EMAIL_DUPLICATE_INFO = gql`
  query ClubMemberEmailDuplicateInfo($email: String!) {
    clubMemberEmailDuplicateInfo(email: $email) {
      isClear
      suggestedFamilyId
      familyLabel
      sharedEmail
      existingMemberLabels
      blockedMessage
    }
  }
`;

export const CREATE_CLUB_MEMBER = gql`
  mutation CreateClubMember($input: CreateMemberInput!) {
    createClubMember(input: $input) {
      id
      firstName
      lastName
    }
  }
`;

export const UPDATE_CLUB_MEMBER = gql`
  mutation UpdateClubMember($input: UpdateMemberInput!) {
    updateClubMember(input: $input) {
      id
      firstName
      lastName
      civility
      email
      phone
      addressLine
      postalCode
      city
      birthDate
      photoUrl
      medicalCertExpiresAt
      gradeLevelId
      roles
      customRoles {
        id
        label
      }
      customFieldValues {
        id
        definitionId
        valueText
        definition {
          id
          label
          type
        }
      }
    }
  }
`;

export const DELETE_CLUB_MEMBER = gql`
  mutation DeleteClubMember($id: ID!) {
    deleteClubMember(id: $id)
  }
`;

export const CLUB_VENUES = gql`
  query ClubVenues {
    clubVenues {
      id
      name
      addressLine
    }
  }
`;

export const CREATE_CLUB_VENUE = gql`
  mutation CreateClubVenue($input: CreateVenueInput!) {
    createClubVenue(input: $input) {
      id
      name
      addressLine
    }
  }
`;

export const CLUB_COURSE_SLOTS = gql`
  query ClubCourseSlots {
    clubCourseSlots {
      id
      venueId
      coachMemberId
      title
      startsAt
      endsAt
      dynamicGroupId
      bookingEnabled
      bookingCapacity
      bookingOpensAt
      bookingClosesAt
      bookedCount
      waitlistCount
    }
  }
`;

export const CLUB_COURSE_SLOT_BOOKINGS = gql`
  query ClubCourseSlotBookings($slotId: ID!) {
    clubCourseSlotBookings(slotId: $slotId) {
      id
      memberId
      status
      bookedAt
      cancelledAt
      note
      displayName
    }
  }
`;

export const CREATE_CLUB_COURSE_SLOT = gql`
  mutation CreateClubCourseSlot($input: CreateCourseSlotInput!) {
    createClubCourseSlot(input: $input) {
      id
      title
      startsAt
      endsAt
    }
  }
`;

export const DELETE_CLUB_COURSE_SLOT = gql`
  mutation DeleteClubCourseSlot($id: ID!) {
    deleteClubCourseSlot(id: $id)
  }
`;

export const UPDATE_CLUB_COURSE_SLOT = gql`
  mutation UpdateClubCourseSlot($input: UpdateCourseSlotInput!) {
    updateClubCourseSlot(input: $input) {
      id
      venueId
      coachMemberId
      title
      startsAt
      endsAt
      dynamicGroupId
      bookingEnabled
      bookingCapacity
      bookingOpensAt
      bookingClosesAt
    }
  }
`;

export const CLUB_FAMILIES = gql`
  query ClubFamilies {
    clubFamilies {
      id
      label
      householdGroupId
      needsPayer
      links {
        id
        memberId
        contactId
        linkRole
      }
    }
  }
`;

export const CLUB_HOUSEHOLD_GROUPS = gql`
  query ClubHouseholdGroups {
    clubHouseholdGroups {
      id
      label
      carrierFamilyId
    }
  }
`;

export const CREATE_HOUSEHOLD_GROUP = gql`
  mutation CreateHouseholdGroup($input: CreateHouseholdGroupInput!) {
    createHouseholdGroup(input: $input) {
      id
      label
      carrierFamilyId
    }
  }
`;

export const SET_FAMILY_HOUSEHOLD_GROUP = gql`
  mutation SetFamilyHouseholdGroup($input: SetFamilyHouseholdGroupInput!) {
    setFamilyHouseholdGroup(input: $input) {
      id
      householdGroupId
      label
    }
  }
`;

export const SET_HOUSEHOLD_GROUP_CARRIER = gql`
  mutation SetHouseholdGroupCarrier($input: SetHouseholdGroupCarrierInput!) {
    setHouseholdGroupCarrierFamily(input: $input) {
      id
      carrierFamilyId
    }
  }
`;

export const CREATE_CLUB_FAMILY = gql`
  mutation CreateClubFamily($input: CreateClubFamilyInput!) {
    createClubFamily(input: $input) {
      id
      label
      links {
        memberId
        contactId
        linkRole
      }
    }
  }
`;

export const UPDATE_CLUB_FAMILY = gql`
  mutation UpdateClubFamily($input: UpdateClubFamilyInput!) {
    updateClubFamily(input: $input) {
      id
      label
      needsPayer
      links {
        id
        memberId
        contactId
        linkRole
      }
    }
  }
`;

export const DELETE_CLUB_FAMILY = gql`
  mutation DeleteClubFamily($familyId: ID!) {
    deleteClubFamily(familyId: $familyId)
  }
`;

export const REMOVE_CLUB_MEMBER_FROM_FAMILY = gql`
  mutation RemoveClubMemberFromFamily($memberId: ID!) {
    removeClubMemberFromFamily(memberId: $memberId)
  }
`;

export const TRANSFER_CLUB_MEMBER_TO_FAMILY = gql`
  mutation TransferClubMemberToFamily(
    $memberId: ID!
    $familyId: ID!
    $linkRole: FamilyMemberLinkRole!
  ) {
    transferClubMemberToFamily(
      memberId: $memberId
      familyId: $familyId
      linkRole: $linkRole
    ) {
      id
      needsPayer
      label
      links {
        memberId
        contactId
        linkRole
      }
    }
  }
`;

export const SET_CLUB_FAMILY_PAYER = gql`
  mutation SetClubFamilyPayer($memberId: ID!) {
    setClubFamilyPayer(memberId: $memberId) {
      id
      needsPayer
      links {
        memberId
        contactId
        linkRole
      }
    }
  }
`;

export const SET_CLUB_FAMILY_PAYER_CONTACT = gql`
  mutation SetClubFamilyPayerContact($familyId: ID!, $contactId: ID!) {
    setClubFamilyPayerContact(familyId: $familyId, contactId: $contactId) {
      id
      needsPayer
      links {
        id
        memberId
        contactId
        linkRole
      }
    }
  }
`;

export const REMOVE_CLUB_FAMILY_LINK = gql`
  mutation RemoveClubFamilyLink($linkId: ID!) {
    removeClubFamilyLink(linkId: $linkId) {
      id
      needsPayer
      links {
        id
        memberId
        contactId
        linkRole
      }
    }
  }
`;

export const ATTACH_CLUB_CONTACT_TO_FAMILY_AS_MEMBER = gql`
  mutation AttachClubContactToFamilyAsMember(
    $familyId: ID!
    $contactId: ID!
  ) {
    attachClubContactToFamilyAsMember(
      familyId: $familyId
      contactId: $contactId
    ) {
      id
      label
      needsPayer
      links {
        id
        memberId
        contactId
        linkRole
      }
    }
  }
`;

export const CLUB_HOSTED_MAIL_OFFER = gql`
  query ClubHostedMailOffer {
    clubHostedMailOffer {
      enabled
      previewFqdn
    }
  }
`;

export const CLUB_SENDING_DOMAINS = gql`
  query ClubSendingDomains {
    clubSendingDomains {
      id
      fqdn
      purpose
      verificationStatus
      lastCheckedAt
      webhookUrlHint
      isClubflowHosted
      dnsRecords {
        type
        name
        value
        ttl
        priority
      }
    }
  }
`;

export const CREATE_CLUB_HOSTED_SENDING_DOMAIN = gql`
  mutation CreateClubHostedSendingDomain($purpose: ClubSendingDomainPurpose!) {
    createClubHostedSendingDomain(purpose: $purpose) {
      id
      fqdn
      purpose
      verificationStatus
      isClubflowHosted
      dnsRecords {
        type
        name
        value
      }
    }
  }
`;

export const CREATE_CLUB_SENDING_DOMAIN = gql`
  mutation CreateClubSendingDomain($input: CreateClubSendingDomainInput!) {
    createClubSendingDomain(input: $input) {
      id
      fqdn
      purpose
      verificationStatus
      dnsRecords {
        type
        name
        value
      }
    }
  }
`;

export const REFRESH_CLUB_SENDING_DOMAIN = gql`
  mutation RefreshClubSendingDomainVerification($domainId: ID!) {
    refreshClubSendingDomainVerification(domainId: $domainId) {
      id
      verificationStatus
      lastCheckedAt
    }
  }
`;

export const DELETE_CLUB_SENDING_DOMAIN = gql`
  mutation DeleteClubSendingDomain($domainId: ID!) {
    deleteClubSendingDomain(domainId: $domainId)
  }
`;

export const SEND_CLUB_TRANSACTIONAL_TEST_EMAIL = gql`
  mutation SendClubTransactionalTestEmail(
    $input: SendTransactionalTestEmailInput!
  ) {
    sendClubTransactionalTestEmail(input: $input)
  }
`;

export const CLUB_MESSAGE_CAMPAIGNS = gql`
  query ClubMessageCampaigns {
    clubMessageCampaigns {
      id
      title
      body
      channel
      dynamicGroupId
      status
      sentAt
      recipientCount
    }
  }
`;

export const CREATE_CLUB_MESSAGE_CAMPAIGN = gql`
  mutation CreateClubMessageCampaign($input: CreateMessageCampaignInput!) {
    createClubMessageCampaign(input: $input) {
      id
      title
      status
    }
  }
`;

export const SEND_CLUB_MESSAGE_CAMPAIGN = gql`
  mutation SendClubMessageCampaign($campaignId: ID!) {
    sendClubMessageCampaign(campaignId: $campaignId) {
      id
      status
      sentAt
      recipientCount
    }
  }
`;

export const UPDATE_CLUB_MESSAGE_CAMPAIGN = gql`
  mutation UpdateClubMessageCampaign($input: UpdateMessageCampaignInput!) {
    updateClubMessageCampaign(input: $input) {
      id
      title
      body
      channel
      dynamicGroupId
      status
      sentAt
      recipientCount
    }
  }
`;

export const DELETE_CLUB_MESSAGE_CAMPAIGN = gql`
  mutation DeleteClubMessageCampaign($campaignId: ID!) {
    deleteClubMessageCampaign(campaignId: $campaignId)
  }
`;

export const SEND_CLUB_QUICK_MESSAGE = gql`
  mutation SendClubQuickMessage($input: SendQuickMessageInput!) {
    sendClubQuickMessage(input: $input) {
      success
    }
  }
`;

export const CLUB_ANNOUNCEMENTS = gql`
  query ClubAnnouncements {
    clubAnnouncements {
      id
      title
      body
      pinned
      publishedAt
      createdAt
      updatedAt
    }
  }
`;

export const CREATE_CLUB_ANNOUNCEMENT = gql`
  mutation CreateClubAnnouncement($input: CreateAnnouncementInput!) {
    createClubAnnouncement(input: $input) {
      id
      title
      body
      pinned
      publishedAt
      createdAt
      updatedAt
    }
  }
`;

export const UPDATE_CLUB_ANNOUNCEMENT = gql`
  mutation UpdateClubAnnouncement($input: UpdateAnnouncementInput!) {
    updateClubAnnouncement(input: $input) {
      id
      title
      body
      pinned
      publishedAt
      createdAt
      updatedAt
    }
  }
`;

export const PUBLISH_CLUB_ANNOUNCEMENT = gql`
  mutation PublishClubAnnouncement($id: ID!) {
    publishClubAnnouncement(id: $id) {
      id
      publishedAt
    }
  }
`;

export const DELETE_CLUB_ANNOUNCEMENT = gql`
  mutation DeleteClubAnnouncement($id: ID!) {
    deleteClubAnnouncement(id: $id)
  }
`;

const SURVEY_FIELDS = `
  id
  title
  description
  status
  multipleChoice
  allowAnonymous
  publishedAt
  closesAt
  createdAt
  updatedAt
  totalResponses
  viewerSelectedOptionIds
  options {
    id
    label
    sortOrder
    responseCount
  }
`;

export const CLUB_SURVEYS = gql`
  query ClubSurveys {
    clubSurveys {
      ${SURVEY_FIELDS}
    }
  }
`;

export const CREATE_CLUB_SURVEY = gql`
  mutation CreateClubSurvey($input: CreateSurveyInput!) {
    createClubSurvey(input: $input) {
      ${SURVEY_FIELDS}
    }
  }
`;

export const OPEN_CLUB_SURVEY = gql`
  mutation OpenClubSurvey($id: ID!) {
    openClubSurvey(id: $id) {
      ${SURVEY_FIELDS}
    }
  }
`;

export const CLOSE_CLUB_SURVEY = gql`
  mutation CloseClubSurvey($id: ID!) {
    closeClubSurvey(id: $id) {
      ${SURVEY_FIELDS}
    }
  }
`;

export const DELETE_CLUB_SURVEY = gql`
  mutation DeleteClubSurvey($id: ID!) {
    deleteClubSurvey(id: $id)
  }
`;

const EVENT_FIELDS = `
  id
  title
  description
  location
  startsAt
  endsAt
  capacity
  registrationOpensAt
  registrationClosesAt
  priceCents
  status
  publishedAt
  allowContactRegistration
  createdAt
  updatedAt
  registeredCount
  waitlistCount
  viewerRegistrationStatus
  registrations {
    id
    memberId
    contactId
    status
    registeredAt
    cancelledAt
    note
    displayName
  }
`;

export const CLUB_EVENTS = gql`
  query ClubEvents {
    clubEvents {
      ${EVENT_FIELDS}
    }
  }
`;

export const CREATE_CLUB_EVENT = gql`
  mutation CreateClubEvent($input: CreateEventInput!) {
    createClubEvent(input: $input) {
      ${EVENT_FIELDS}
    }
  }
`;

export const UPDATE_CLUB_EVENT = gql`
  mutation UpdateClubEvent($input: UpdateEventInput!) {
    updateClubEvent(input: $input) {
      ${EVENT_FIELDS}
    }
  }
`;

export const PUBLISH_CLUB_EVENT = gql`
  mutation PublishClubEvent($id: ID!) {
    publishClubEvent(id: $id) {
      ${EVENT_FIELDS}
    }
  }
`;

export const CANCEL_CLUB_EVENT = gql`
  mutation CancelClubEvent($id: ID!) {
    cancelClubEvent(id: $id) {
      ${EVENT_FIELDS}
    }
  }
`;

export const DELETE_CLUB_EVENT = gql`
  mutation DeleteClubEvent($id: ID!) {
    deleteClubEvent(id: $id)
  }
`;

const BLOG_POST_FIELDS = `
  id
  clubId
  authorUserId
  slug
  title
  excerpt
  body
  coverImageUrl
  status
  publishedAt
  createdAt
  updatedAt
`;

export const CLUB_BLOG_POSTS = gql`
  query ClubBlogPosts {
    clubBlogPosts {
      ${BLOG_POST_FIELDS}
    }
  }
`;

export const CREATE_CLUB_BLOG_POST = gql`
  mutation CreateClubBlogPost($input: CreateBlogPostInput!) {
    createClubBlogPost(input: $input) {
      ${BLOG_POST_FIELDS}
    }
  }
`;

export const UPDATE_CLUB_BLOG_POST = gql`
  mutation UpdateClubBlogPost($input: UpdateBlogPostInput!) {
    updateClubBlogPost(input: $input) {
      ${BLOG_POST_FIELDS}
    }
  }
`;

export const PUBLISH_CLUB_BLOG_POST = gql`
  mutation PublishClubBlogPost($id: ID!) {
    publishClubBlogPost(id: $id) {
      ${BLOG_POST_FIELDS}
    }
  }
`;

export const ARCHIVE_CLUB_BLOG_POST = gql`
  mutation ArchiveClubBlogPost($id: ID!) {
    archiveClubBlogPost(id: $id) {
      ${BLOG_POST_FIELDS}
    }
  }
`;

export const DELETE_CLUB_BLOG_POST = gql`
  mutation DeleteClubBlogPost($id: ID!) {
    deleteClubBlogPost(id: $id)
  }
`;

const SHOP_PRODUCT_FIELDS = `
  id
  clubId
  sku
  name
  description
  imageUrl
  priceCents
  stock
  active
  createdAt
  updatedAt
`;

const SHOP_ORDER_FIELDS = `
  id
  clubId
  memberId
  contactId
  status
  totalCents
  note
  createdAt
  updatedAt
  paidAt
  buyerFirstName
  buyerLastName
  lines {
    id
    orderId
    productId
    quantity
    unitPriceCents
    label
  }
`;

export const SHOP_PRODUCTS = gql`
  query ShopProducts {
    shopProducts {
      ${SHOP_PRODUCT_FIELDS}
    }
  }
`;

export const CREATE_SHOP_PRODUCT = gql`
  mutation CreateShopProduct($input: CreateShopProductInput!) {
    createShopProduct(input: $input) {
      ${SHOP_PRODUCT_FIELDS}
    }
  }
`;

export const UPDATE_SHOP_PRODUCT = gql`
  mutation UpdateShopProduct($input: UpdateShopProductInput!) {
    updateShopProduct(input: $input) {
      ${SHOP_PRODUCT_FIELDS}
    }
  }
`;

export const DELETE_SHOP_PRODUCT = gql`
  mutation DeleteShopProduct($id: ID!) {
    deleteShopProduct(id: $id)
  }
`;

export const SHOP_ORDERS = gql`
  query ShopOrders {
    shopOrders {
      ${SHOP_ORDER_FIELDS}
    }
  }
`;

export const MARK_SHOP_ORDER_PAID = gql`
  mutation MarkShopOrderPaid($id: ID!) {
    markShopOrderPaid(id: $id) {
      ${SHOP_ORDER_FIELDS}
    }
  }
`;

export const CANCEL_SHOP_ORDER = gql`
  mutation CancelShopOrder($id: ID!) {
    cancelShopOrder(id: $id) {
      ${SHOP_ORDER_FIELDS}
    }
  }
`;
