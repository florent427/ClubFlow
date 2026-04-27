import { gql } from '@apollo/client';

/** JWT + X-Club-Id seulement — ne dépend pas du garde profil membre (contrairement à viewerMe). */
export const VIEWER_ADMIN_SWITCH = gql`
  query ViewerAdminSwitch {
    viewerAdminSwitch {
      canAccessClubBackOffice
      adminWorkspaceClubId
    }
  }
`;

export const VIEWER_ME = gql`
  query ViewerMe {
    viewerMe {
      id
      firstName
      lastName
      pseudo
      photoUrl
      email
      phone
      civility
      medicalCertExpiresAt
      gradeLevelId
      gradeLevelLabel
      canAccessClubBackOffice
      adminWorkspaceClubId
      hasClubFamily
      canSelfAttachFamilyViaPayerEmail
      isContactProfile
      hideMemberModules
      telegramLinked
      canManageMembershipCart
    }
  }
`;

export const VIEWER_JOIN_FAMILY_BY_PAYER_EMAIL = gql`
  mutation ViewerJoinFamilyByPayerEmail($input: ViewerJoinFamilyByPayerEmailInput!) {
    viewerJoinFamilyByPayerEmail(input: $input) {
      success
      message
      familyId
      familyLabel
    }
  }
`;

export const CREATE_FAMILY_INVITE = gql`
  mutation CreateFamilyInvite($input: CreateFamilyInviteInput!) {
    createFamilyInvite(input: $input) {
      code
      rawToken
      expiresAt
      familyId
    }
  }
`;

export const SEND_FAMILY_INVITE_BY_EMAIL = gql`
  mutation SendFamilyInviteByEmail($input: SendFamilyInviteByEmailInput!) {
    sendFamilyInviteByEmail(input: $input)
  }
`;

export const VIEWER_PENDING_FAMILY_INVITES = gql`
  query ViewerPendingFamilyInvites {
    viewerPendingFamilyInvites {
      id
      code
      role
      familyLabel
      inviterName
      expiresAt
    }
  }
`;

export const PREVIEW_FAMILY_INVITE = gql`
  mutation PreviewFamilyInvite($input: PreviewFamilyInviteInput!) {
    previewFamilyInvite(input: $input) {
      role
      familyLabel
      inviterFirstName
      inviterLastName
      clubName
      expiresAt
    }
  }
`;

export const ACCEPT_FAMILY_INVITE = gql`
  mutation AcceptFamilyInvite($input: AcceptFamilyInviteInput!) {
    acceptFamilyInvite(input: $input) {
      success
      message
      familyId
      familyLabel
    }
  }
`;

export const VIEWER_UPCOMING_SLOTS = gql`
  query ViewerUpcomingCourseSlots {
    viewerUpcomingCourseSlots {
      id
      title
      startsAt
      endsAt
      venueName
      coachFirstName
      coachLastName
    }
  }
`;

export const VIEWER_FAMILY_BILLING = gql`
  query ViewerFamilyBillingSummary {
    viewerFamilyBillingSummary {
      familyId
      householdGroupId
      viewerRoleInFamily
      isPayerView
      familyLabel
      isHouseholdGroupSpace
      linkedHouseholdFamilies {
        familyId
        label
        members {
          memberId
          firstName
          lastName
          photoUrl
        }
        payers {
          firstName
          lastName
        }
        observers {
          firstName
          lastName
          role
        }
      }
      invoices {
        id
        familyId
        familyLabel
        label
        status
        dueAt
        amountCents
        totalPaidCents
        balanceCents
        payments {
          id
          amountCents
          method
          createdAt
          paidByFirstName
          paidByLastName
        }
      }
      familyMembers {
        memberId
        firstName
        lastName
        photoUrl
      }
    }
  }
`;

export const VIEWER_ALL_FAMILY_BILLING = gql`
  query ViewerAllFamilyBillingSummaries {
    viewerAllFamilyBillingSummaries {
      familyId
      householdGroupId
      viewerRoleInFamily
      isPayerView
      familyLabel
      isHouseholdGroupSpace
      linkedHouseholdFamilies {
        familyId
        label
        members {
          memberId
          firstName
          lastName
          photoUrl
        }
        payers {
          firstName
          lastName
        }
        observers {
          firstName
          lastName
          role
        }
      }
      invoices {
        id
        familyId
        familyLabel
        label
        status
        dueAt
        amountCents
        totalPaidCents
        balanceCents
        payments {
          id
          amountCents
          method
          createdAt
          paidByFirstName
          paidByLastName
        }
      }
      familyMembers {
        memberId
        firstName
        lastName
        photoUrl
      }
    }
  }
`;

export const VIEWER_PROMOTE_SELF_TO_MEMBER = gql`
  mutation ViewerPromoteSelfToMember($input: ViewerPromoteSelfToMemberInput!) {
    viewerPromoteSelfToMember(input: $input) {
      memberId
      firstName
      lastName
    }
  }
`;

export const VIEWER_REGISTER_CHILD_MEMBER = gql`
  mutation ViewerRegisterChildMember($input: ViewerRegisterChildMemberInput!) {
    viewerRegisterChildMember(input: $input) {
      pendingItemId
      cartId
      firstName
      lastName
    }
  }
`;

export const VIEWER_ELIGIBLE_MEMBERSHIP_FORMULAS = gql`
  query ViewerEligibleMembershipFormulas(
    $birthDate: String!
    $identityFirstName: String
    $identityLastName: String
    $excludePendingItemId: String
  ) {
    viewerEligibleMembershipFormulas(
      birthDate: $birthDate
      identityFirstName: $identityFirstName
      identityLastName: $identityLastName
      excludePendingItemId: $excludePendingItemId
    ) {
      id
      label
      annualAmountCents
      monthlyAmountCents
      minAge
      maxAge
      allowProrata
      alreadyTakenInSeason
    }
  }
`;

export const CLUB = gql`
  query MemberClub {
    club {
      id
      name
      slug
    }
  }
`;

export const VIEWER_CLUB_ANNOUNCEMENTS = gql`
  query ViewerClubAnnouncements {
    viewerClubAnnouncements {
      id
      title
      body
      pinned
      publishedAt
    }
  }
`;

const VIEWER_SURVEY_FIELDS = `
  id
  title
  description
  status
  multipleChoice
  allowAnonymous
  publishedAt
  closesAt
  totalResponses
  viewerSelectedOptionIds
  options {
    id
    label
    sortOrder
    responseCount
  }
`;

export const VIEWER_CLUB_SURVEYS = gql`
  query ViewerClubSurveys {
    viewerClubSurveys {
      ${VIEWER_SURVEY_FIELDS}
    }
  }
`;

export const VIEWER_RESPOND_TO_CLUB_SURVEY = gql`
  mutation ViewerRespondToClubSurvey($input: RespondSurveyInput!) {
    viewerRespondToClubSurvey(input: $input) {
      ${VIEWER_SURVEY_FIELDS}
    }
  }
`;

const VIEWER_EVENT_FIELDS = `
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
  allowContactRegistration
  registeredCount
  waitlistCount
  viewerRegistrationStatus
`;

export const VIEWER_CLUB_EVENTS = gql`
  query ViewerClubEvents {
    viewerClubEvents {
      ${VIEWER_EVENT_FIELDS}
    }
  }
`;

export const VIEWER_REGISTER_TO_EVENT = gql`
  mutation ViewerRegisterToEvent($eventId: ID!, $note: String) {
    viewerRegisterToEvent(eventId: $eventId, note: $note) {
      ${VIEWER_EVENT_FIELDS}
    }
  }
`;

export const VIEWER_CANCEL_EVENT_REGISTRATION = gql`
  mutation ViewerCancelEventRegistration($eventId: ID!) {
    viewerCancelEventRegistration(eventId: $eventId) {
      ${VIEWER_EVENT_FIELDS}
    }
  }
`;

export const VIEWER_BOOKABLE_COURSE_SLOTS = gql`
  query ViewerBookableCourseSlots {
    viewerBookableCourseSlots {
      id
      title
      startsAt
      endsAt
      venueName
      coachFirstName
      coachLastName
      bookingCapacity
      bookingOpensAt
      bookingClosesAt
      bookedCount
      waitlistCount
      viewerBookingStatus
    }
  }
`;

export const VIEWER_BOOK_COURSE_SLOT = gql`
  mutation ViewerBookCourseSlot($slotId: ID!, $note: String) {
    viewerBookCourseSlot(slotId: $slotId, note: $note)
  }
`;

export const VIEWER_CANCEL_COURSE_SLOT_BOOKING = gql`
  mutation ViewerCancelCourseSlotBooking($slotId: ID!) {
    viewerCancelCourseSlotBooking(slotId: $slotId)
  }
`;

export const VIEWER_CLUB_BLOG_POSTS = gql`
  query ViewerClubBlogPosts {
    viewerClubBlogPosts {
      id
      slug
      title
      excerpt
      coverImageUrl
      publishedAt
    }
  }
`;

export const VIEWER_CLUB_BLOG_POST = gql`
  query ViewerClubBlogPost($slug: String!) {
    viewerClubBlogPost(slug: $slug) {
      id
      slug
      title
      excerpt
      body
      coverImageUrl
      publishedAt
    }
  }
`;

const VIEWER_SHOP_PRODUCT_FIELDS = `
  id
  sku
  name
  description
  imageUrl
  priceCents
  stock
  active
`;

const VIEWER_SHOP_ORDER_FIELDS = `
  id
  status
  totalCents
  note
  createdAt
  paidAt
  buyerFirstName
  buyerLastName
  lines {
    id
    productId
    quantity
    unitPriceCents
    label
  }
`;

export const VIEWER_SHOP_PRODUCTS = gql`
  query ViewerShopProducts {
    viewerShopProducts {
      ${VIEWER_SHOP_PRODUCT_FIELDS}
    }
  }
`;

export const VIEWER_SHOP_ORDERS = gql`
  query ViewerShopOrders {
    viewerShopOrders {
      ${VIEWER_SHOP_ORDER_FIELDS}
    }
  }
`;

export const VIEWER_PLACE_SHOP_ORDER = gql`
  mutation ViewerPlaceShopOrder($input: PlaceShopOrderInput!) {
    viewerPlaceShopOrder(input: $input) {
      ${VIEWER_SHOP_ORDER_FIELDS}
    }
  }
`;

export const VIEWER_CREATE_INVOICE_CHECKOUT_SESSION = gql`
  mutation ViewerCreateInvoiceCheckoutSession(
    $invoiceId: String!
    $installmentsCount: Int
  ) {
    viewerCreateInvoiceCheckoutSession(
      invoiceId: $invoiceId
      installmentsCount: $installmentsCount
    ) {
      url
      sessionId
    }
  }
`;

export const VIEWER_LOCK_INVOICE_PAYMENT_CHOICE = gql`
  mutation ViewerLockInvoicePaymentChoice(
    $invoiceId: String!
    $method: ClubPaymentMethod!
    $installmentsCount: Int
  ) {
    viewerLockInvoicePaymentChoice(
      invoiceId: $invoiceId
      method: $method
      installmentsCount: $installmentsCount
    ) {
      invoiceId
      method
      installmentsCount
      instructions
    }
  }
`;

/**
 * Mutation **atomique** : valide le panier ET verrouille le mode de
 * règlement en un seul appel. C'est elle qui crée les Members +
 * l'Invoice — pas avant. Si l'utilisateur ferme la modale sans
 * choisir, rien n'est créé en base.
 */
export const VIEWER_CHECKOUT_MEMBERSHIP_CART = gql`
  mutation ViewerCheckoutMembershipCart(
    $cartId: String!
    $method: ClubPaymentMethod!
    $installmentsCount: Int
  ) {
    viewerCheckoutMembershipCart(
      cartId: $cartId
      method: $method
      installmentsCount: $installmentsCount
    ) {
      cartId
      invoiceId
      method
      installmentsCount
      stripeCheckoutUrl
      instructions
    }
  }
`;

export const VIEWER_UPDATE_MY_PROFILE = gql`
  mutation ViewerUpdateMyProfile($input: ViewerUpdateMyProfileInput!) {
    viewerUpdateMyProfile(input: $input) {
      id
      firstName
      lastName
      email
      phone
      photoUrl
    }
  }
`;
