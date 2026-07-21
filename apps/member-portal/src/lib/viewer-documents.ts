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
      payerSpacePinSet
    }
  }
`;

export const VIEWER_SET_PAYER_SPACE_PIN = gql`
  mutation ViewerSetPayerSpacePin($newPin: String!, $currentPin: String) {
    viewerSetPayerSpacePin(newPin: $newPin, currentPin: $currentPin) {
      ok
    }
  }
`;

export const VIEWER_CLEAR_PAYER_SPACE_PIN = gql`
  mutation ViewerClearPayerSpacePin($currentPin: String!) {
    viewerClearPayerSpacePin(currentPin: $currentPin) {
      ok
    }
  }
`;

export const VIEWER_VERIFY_PAYER_SPACE_PIN = gql`
  mutation ViewerVerifyPayerSpacePin($pin: String!) {
    viewerVerifyPayerSpacePin(pin: $pin) {
      ok
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

/**
 * Modules activés pour le club courant.
 *
 * `clubModules` n'est gardée que par le JWT + le contexte club (pas de garde
 * de rôle admin) : un adhérent peut donc la lire. Elle sert à masquer les
 * entrées de navigation dont le module est coupé — sans quoi l'onglet mène à
 * un écran que `ClubModuleEnabledGuard` refuse côté API.
 */
export const VIEWER_CLUB_MODULES = gql`
  query ViewerClubModules {
    clubModules {
      moduleCode
      enabled
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

/**
 * Champs boutique visibles par un ADHÉRENT (ADR-0012).
 *
 * Ce qui est vendable est la DÉCLINAISON, jamais le produit : le panier et la
 * commande ne manipulent que des `variants { id }`. Un produit sans
 * déclinaison en expose exactement une, `isDefault`, que l'écran n'affiche pas.
 *
 * On ne sélectionne volontairement AUCUN compteur — ni `stock`, ni `available`,
 * ni `onHand`, ni `reorderThreshold` : côté portail l'API les renvoie à null,
 * et un adhérent n'a pas à savoir combien il reste de M ni à quel niveau le
 * club réapprovisionne. La seule information de stock est le booléen `inStock`.
 */
const VIEWER_SHOP_PRODUCT_FIELDS = `
  id
  sku
  name
  description
  imageUrl
  priceCents
  hasVariants
  priceFromCents
  active
  variants {
    id
    isDefault
    label
    sku
    unitPriceCents
    inStock
  }
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

/**
 * Champs du panier boutique visibles par un ADHÉRENT (ShopCart côté API).
 *
 * Confidentialité (ADR-0012) : on ne sélectionne AUCUN compteur de stock — ni
 * `available`, ni `onHand`, ni `stock`, ni `belowThreshold`. Le type panier
 * n'expose de toute façon que `inStock` (booléen) et `unavailable` ; c'est la
 * seule information de disponibilité transmise. Le sélecteur de quantité au
 * panier n'a donc pas de plafond client — le serveur arbitre la disponibilité.
 */
const VIEWER_SHOP_CART_FIELDS = `
  id
  totalCents
  items {
    id
    variantId
    productId
    label
    imageUrl
    quantity
    unitPriceCents
    lineTotalCents
    inStock
    unavailable
  }
`;

export const VIEWER_SHOP_CART = gql`
  query ViewerShopCart {
    viewerShopCart {
      ${VIEWER_SHOP_CART_FIELDS}
    }
  }
`;

export const VIEWER_ADD_SHOP_CART_ITEM = gql`
  mutation ViewerAddShopCartItem($input: AddShopCartItemInput!) {
    viewerAddShopCartItem(input: $input) {
      ${VIEWER_SHOP_CART_FIELDS}
    }
  }
`;

export const VIEWER_SET_SHOP_CART_ITEM_QUANTITY = gql`
  mutation ViewerSetShopCartItemQuantity($input: SetShopCartItemQuantityInput!) {
    viewerSetShopCartItemQuantity(input: $input) {
      ${VIEWER_SHOP_CART_FIELDS}
    }
  }
`;

export const VIEWER_REMOVE_SHOP_CART_ITEM = gql`
  mutation ViewerRemoveShopCartItem($itemId: ID!) {
    viewerRemoveShopCartItem(itemId: $itemId) {
      ${VIEWER_SHOP_CART_FIELDS}
    }
  }
`;

export const VIEWER_CLEAR_SHOP_CART = gql`
  mutation ViewerClearShopCart {
    viewerClearShopCart {
      ${VIEWER_SHOP_CART_FIELDS}
    }
  }
`;

/**
 * Checkout panier → commande + facture + session Stripe. `wantsInstallments`
 * DEMANDE le 3× ; le serveur le REFUSE (erreur) si le total est sous le seuil
 * du club ou si le 3× est désactivé. On redirige ensuite vers
 * `stripeCheckoutUrl` (même pattern que le paiement de facture).
 */
export const VIEWER_CHECKOUT_SHOP_CART = gql`
  mutation ViewerCheckoutShopCart($wantsInstallments: Boolean) {
    viewerCheckoutShopCart(wantsInstallments: $wantsInstallments) {
      orderId
      invoiceId
      totalCents
      installmentsCount
      stripeCheckoutUrl
    }
  }
`;

/**
 * Reprise de paiement d'une commande boutique restée EN ATTENTE (PENDING) dont
 * la facture est encore ouverte : crée une NOUVELLE session Stripe sur la
 * facture EXISTANTE, sans recréer commande/facture ni re-réserver le stock.
 * Même forme que le checkout (dont `stripeCheckoutUrl`, seul champ utile côté
 * web). `wantsInstallments` DEMANDE le 3× ; le serveur le REFUSE (erreur) sous
 * le seuil du club — on affiche son message tel quel.
 */
export const VIEWER_REPAY_SHOP_ORDER = gql`
  mutation ViewerRepayShopOrder($orderId: ID!, $wantsInstallments: Boolean) {
    viewerRepayShopOrder(orderId: $orderId, wantsInstallments: $wantsInstallments) {
      orderId
      invoiceId
      totalCents
      installmentsCount
      stripeCheckoutUrl
    }
  }
`;

/**
 * Annule une commande boutique EN ATTENTE (PENDING) appartenant au viewer et
 * LIBÈRE le stock réservé côté serveur (facture liée → VOID). Renvoie la
 * commande avec son nouveau `status`. Idempotent côté serveur.
 */
export const VIEWER_CANCEL_SHOP_ORDER = gql`
  mutation ViewerCancelShopOrder($orderId: ID!) {
    viewerCancelShopOrder(orderId: $orderId) {
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

/** Champs communs d'un échéancier (paiement en plusieurs fois). */
const VIEWER_PAYMENT_SCHEDULE_FIELDS = `
  id
  invoiceId
  method
  status
  totalCents
  installmentCount
  installments {
    id
    seq
    dueOn
    amountCents
    status
  }
`;

/** Échéancier d'une facture — renvoie null si la facture n'en a pas encore. */
export const VIEWER_INVOICE_PAYMENT_SCHEDULE = gql`
  query ViewerInvoicePaymentSchedule($invoiceId: String!) {
    viewerInvoicePaymentSchedule(invoiceId: $invoiceId) {
      ${VIEWER_PAYMENT_SCHEDULE_FIELDS}
    }
  }
`;

/** Crée l'échéancier (aucun débit à ce stade). */
export const VIEWER_CREATE_PAYMENT_SCHEDULE = gql`
  mutation ViewerCreatePaymentSchedule(
    $invoiceId: String!
    $method: PaymentScheduleMethod!
    $installmentCount: Int!
  ) {
    viewerCreatePaymentSchedule(
      invoiceId: $invoiceId
      method: $method
      installmentCount: $installmentCount
    ) {
      ${VIEWER_PAYMENT_SCHEDULE_FIELDS}
    }
  }
`;

/** Ouvre l'enregistrement du moyen de paiement chez Stripe (URL à suivre). */
export const VIEWER_START_PAYMENT_SCHEDULE_SETUP = gql`
  mutation ViewerStartPaymentScheduleSetup($scheduleId: String!) {
    viewerStartPaymentScheduleSetup(scheduleId: $scheduleId) {
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
