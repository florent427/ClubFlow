import { gql } from '@apollo/client';

/*
 * Frais kilométriques (côté trésorier) et reçus fiscaux d'abandon de frais.
 * Distances en mètres, montants en centimes, dates « YYYY-MM-DD ».
 */

// ── Types ───────────────────────────────────────────────────────────────

export type MileageClaimStatus = 'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'REJECTED';
export type MileageSettlement = 'REIMBURSEMENT' | 'DONATION';
export type MileageVehicleKind = 'CAR' | 'MOTORCYCLE' | 'MOPED';
export type TaxReceiptOrganismType = 'PUBLIC_UTILITY' | 'GENERAL_INTEREST';
export type TaxReceiptStatus = 'ISSUED' | 'CANCELLED';

export type MileageVehicle = {
  id: string;
  memberId: string;
  memberName: string;
  label: string;
  kind: MileageVehicleKind;
  fiscalHorsepower: number | null;
  isElectric: boolean;
  archived: boolean;
};

export type MileageRecurringTrip = {
  id: string;
  memberId: string;
  vehicleId: string;
  vehicleLabel: string;
  fromLabel: string;
  toLabel: string;
  purpose: string;
  distanceMeters: number;
  roundTrip: boolean;
  weekdays: number[];
  startsOn: string;
  endsOn: string | null;
  archived: boolean;
};

export type MileageTrip = {
  id: string;
  vehicleId: string;
  vehicleLabel: string;
  tripDate: string;
  fromLabel: string;
  toLabel: string;
  purpose: string;
  distanceMeters: number;
  roundTrip: boolean;
  totalMeters: number;
  recurringTripId: string | null;
  amountCents: number;
  scaleLabel: string | null;
};

export type MileageClaimSummary = {
  id: string;
  memberId: string;
  memberName: string;
  title: string;
  settlement: MileageSettlement;
  status: MileageClaimStatus;
  memberNote: string | null;
  submittedAt: string | null;
  reviewedAt: string | null;
  reviewComment: string | null;
  totalMeters: number;
  amountCents: number;
  estimated: boolean;
  provisional: boolean;
  reimbursed: boolean;
  entryId: string | null;
  taxReceiptId: string | null;
  taxReceiptNumber: string | null;
  firstTripDate: string | null;
  lastTripDate: string | null;
  tripCount: number;
  createdAt: string;
};

export type MileageClaim = MileageClaimSummary & { trips: MileageTrip[] };

export type TaxReceiptSettings = {
  taxReceiptEnabled: boolean;
  taxReceiptOrganismType: TaxReceiptOrganismType | null;
  taxReceiptPurpose: string | null;
  rnaNumber: string | null;
  taxReceiptSignatoryName: string | null;
  taxReceiptSignatoryTitle: string | null;
};

export type TaxReceiptPendingDonor = {
  memberId: string;
  memberName: string;
  claimCount: number;
  totalCents: number;
  missingAddress: boolean;
};

export type TaxReceipt = {
  id: string;
  memberId: string;
  memberName: string;
  year: number;
  number: string;
  amountCents: number;
  status: TaxReceiptStatus;
  issuedOn: string;
  cancelReason: string | null;
};

export type MileageMember = {
  id: string;
  firstName: string;
  lastName: string;
  status: string;
};

export type MileageMembersData = { clubMembers: MileageMember[] };
export type ClubMileageClaimsData = { clubMileageClaims: MileageClaimSummary[] };
export type ClubMileageClaimData = { clubMileageClaim: MileageClaim };
export type ClubMileageVehiclesData = { clubMileageVehicles: MileageVehicle[] };
export type ClubMileageRecurringTripsData = {
  clubMileageRecurringTrips: MileageRecurringTrip[];
};
export type AddClubMileageRecurringTripsData = {
  addClubMileageRecurringTrips: { added: number; claim: MileageClaim };
};
export type CreateClubMileageClaimData = { createClubMileageClaim: MileageClaim };
export type ClubTaxReceiptSettingsData = { clubTaxReceiptSettings: TaxReceiptSettings };
export type ClubTaxReceiptsData = {
  clubTaxReceiptPendingDonors: TaxReceiptPendingDonor[];
  clubTaxReceipts: TaxReceipt[];
};
export type IssueClubTaxReceiptsData = { issueClubTaxReceipts: TaxReceipt[] };
export type ClubTaxReceiptPdfData = { clubTaxReceiptPdf: string };

// ── Fragments ───────────────────────────────────────────────────────────

const CLAIM_SUMMARY_FIELDS = gql`
  fragment MileageClaimSummaryFields on MileageClaimGraph {
    id
    memberId
    memberName
    title
    settlement
    status
    memberNote
    submittedAt
    reviewedAt
    reviewComment
    totalMeters
    amountCents
    estimated
    provisional
    reimbursed
    entryId
    taxReceiptId
    taxReceiptNumber
    firstTripDate
    lastTripDate
    tripCount
    createdAt
  }
`;

const CLAIM_FIELDS = gql`
  fragment MileageClaimFields on MileageClaimGraph {
    ...MileageClaimSummaryFields
    trips {
      id
      vehicleId
      vehicleLabel
      tripDate
      fromLabel
      toLabel
      purpose
      distanceMeters
      roundTrip
      totalMeters
      recurringTripId
      amountCents
      scaleLabel
    }
  }
  ${CLAIM_SUMMARY_FIELDS}
`;

const VEHICLE_FIELDS = gql`
  fragment MileageVehicleFields on MileageVehicleGraph {
    id
    memberId
    memberName
    label
    kind
    fiscalHorsepower
    isElectric
    archived
  }
`;

const TAX_RECEIPT_FIELDS = gql`
  fragment TaxReceiptFields on TaxReceiptGraph {
    id
    memberId
    memberName
    year
    number
    amountCents
    status
    issuedOn
    cancelReason
  }
`;

const TAX_RECEIPT_SETTINGS_FIELDS = gql`
  fragment TaxReceiptSettingsFields on TaxReceiptSettingsGraph {
    taxReceiptEnabled
    taxReceiptOrganismType
    taxReceiptPurpose
    rnaNumber
    taxReceiptSignatoryName
    taxReceiptSignatoryTitle
  }
`;

// ── Membres ─────────────────────────────────────────────────────────────

export const MILEAGE_MEMBERS = gql`
  query MileageMembers {
    clubMembers {
      id
      firstName
      lastName
      status
    }
  }
`;

// ── Notes ───────────────────────────────────────────────────────────────

export const CLUB_MILEAGE_CLAIMS = gql`
  query ClubMileageClaims($status: MileageClaimStatus, $memberId: ID) {
    clubMileageClaims(status: $status, memberId: $memberId) {
      ...MileageClaimSummaryFields
    }
  }
  ${CLAIM_SUMMARY_FIELDS}
`;

export const CLUB_MILEAGE_CLAIM = gql`
  query ClubMileageClaim($id: ID!) {
    clubMileageClaim(id: $id) {
      ...MileageClaimFields
    }
  }
  ${CLAIM_FIELDS}
`;

export const CREATE_CLUB_MILEAGE_CLAIM = gql`
  mutation CreateClubMileageClaim($memberId: ID!, $input: MileageClaimInputGraph!) {
    createClubMileageClaim(memberId: $memberId, input: $input) {
      ...MileageClaimFields
    }
  }
  ${CLAIM_FIELDS}
`;

export const UPDATE_CLUB_MILEAGE_CLAIM = gql`
  mutation UpdateClubMileageClaim($id: ID!, $input: MileageClaimInputGraph!) {
    updateClubMileageClaim(id: $id, input: $input) {
      ...MileageClaimFields
    }
  }
  ${CLAIM_FIELDS}
`;

export const DELETE_CLUB_MILEAGE_CLAIM = gql`
  mutation DeleteClubMileageClaim($id: ID!) {
    deleteClubMileageClaim(id: $id)
  }
`;

export const ADD_CLUB_MILEAGE_TRIP = gql`
  mutation AddClubMileageTrip($claimId: ID!, $input: MileageTripInputGraph!) {
    addClubMileageTrip(claimId: $claimId, input: $input) {
      ...MileageClaimFields
    }
  }
  ${CLAIM_FIELDS}
`;

export const UPDATE_CLUB_MILEAGE_TRIP = gql`
  mutation UpdateClubMileageTrip($id: ID!, $input: MileageTripInputGraph!) {
    updateClubMileageTrip(id: $id, input: $input) {
      ...MileageClaimFields
    }
  }
  ${CLAIM_FIELDS}
`;

export const DELETE_CLUB_MILEAGE_TRIP = gql`
  mutation DeleteClubMileageTrip($id: ID!) {
    deleteClubMileageTrip(id: $id) {
      ...MileageClaimFields
    }
  }
  ${CLAIM_FIELDS}
`;

export const ADD_CLUB_MILEAGE_RECURRING_TRIPS = gql`
  mutation AddClubMileageRecurringTrips($claimId: ID!, $from: String!, $to: String!) {
    addClubMileageRecurringTrips(claimId: $claimId, from: $from, to: $to) {
      added
      claim {
        ...MileageClaimFields
      }
    }
  }
  ${CLAIM_FIELDS}
`;

export const SUBMIT_CLUB_MILEAGE_CLAIM = gql`
  mutation SubmitClubMileageClaim($id: ID!) {
    submitClubMileageClaim(id: $id) {
      ...MileageClaimFields
    }
  }
  ${CLAIM_FIELDS}
`;

export const APPROVE_CLUB_MILEAGE_CLAIM = gql`
  mutation ApproveClubMileageClaim($id: ID!) {
    approveClubMileageClaim(id: $id) {
      ...MileageClaimFields
    }
  }
  ${CLAIM_FIELDS}
`;

export const RETURN_CLUB_MILEAGE_CLAIM = gql`
  mutation ReturnClubMileageClaim($id: ID!, $comment: String!) {
    returnClubMileageClaim(id: $id, comment: $comment) {
      ...MileageClaimFields
    }
  }
  ${CLAIM_FIELDS}
`;

export const REJECT_CLUB_MILEAGE_CLAIM = gql`
  mutation RejectClubMileageClaim($id: ID!, $comment: String!) {
    rejectClubMileageClaim(id: $id, comment: $comment) {
      ...MileageClaimFields
    }
  }
  ${CLAIM_FIELDS}
`;

export const CANCEL_CLUB_MILEAGE_CLAIM_APPROVAL = gql`
  mutation CancelClubMileageClaimApproval($id: ID!) {
    cancelClubMileageClaimApproval(id: $id) {
      ...MileageClaimFields
    }
  }
  ${CLAIM_FIELDS}
`;

// ── Véhicules et trajets récurrents ─────────────────────────────────────

export const CLUB_MILEAGE_VEHICLES = gql`
  query ClubMileageVehicles($memberId: ID, $includeArchived: Boolean) {
    clubMileageVehicles(memberId: $memberId, includeArchived: $includeArchived) {
      ...MileageVehicleFields
    }
  }
  ${VEHICLE_FIELDS}
`;

export const CREATE_CLUB_MILEAGE_VEHICLE = gql`
  mutation CreateClubMileageVehicle($memberId: ID!, $input: MileageVehicleInputGraph!) {
    createClubMileageVehicle(memberId: $memberId, input: $input) {
      ...MileageVehicleFields
    }
  }
  ${VEHICLE_FIELDS}
`;

export const UPDATE_CLUB_MILEAGE_VEHICLE = gql`
  mutation UpdateClubMileageVehicle($id: ID!, $input: MileageVehicleInputGraph!) {
    updateClubMileageVehicle(id: $id, input: $input) {
      ...MileageVehicleFields
    }
  }
  ${VEHICLE_FIELDS}
`;

export const SET_CLUB_MILEAGE_VEHICLE_ARCHIVED = gql`
  mutation SetClubMileageVehicleArchived($id: ID!, $archived: Boolean!) {
    setClubMileageVehicleArchived(id: $id, archived: $archived) {
      ...MileageVehicleFields
    }
  }
  ${VEHICLE_FIELDS}
`;

export const DELETE_CLUB_MILEAGE_VEHICLE = gql`
  mutation DeleteClubMileageVehicle($id: ID!) {
    deleteClubMileageVehicle(id: $id)
  }
`;

export const CLUB_MILEAGE_RECURRING_TRIPS = gql`
  query ClubMileageRecurringTrips($memberId: ID, $includeArchived: Boolean) {
    clubMileageRecurringTrips(memberId: $memberId, includeArchived: $includeArchived) {
      id
      memberId
      vehicleId
      vehicleLabel
      fromLabel
      toLabel
      purpose
      distanceMeters
      roundTrip
      weekdays
      startsOn
      endsOn
      archived
    }
  }
`;

// ── Reçus fiscaux ───────────────────────────────────────────────────────

export const CLUB_TAX_RECEIPT_SETTINGS = gql`
  query ClubTaxReceiptSettings {
    clubTaxReceiptSettings {
      ...TaxReceiptSettingsFields
    }
  }
  ${TAX_RECEIPT_SETTINGS_FIELDS}
`;

export const UPDATE_CLUB_TAX_RECEIPT_SETTINGS = gql`
  mutation UpdateClubTaxReceiptSettings($input: TaxReceiptSettingsInputGraph!) {
    updateClubTaxReceiptSettings(input: $input) {
      ...TaxReceiptSettingsFields
    }
  }
  ${TAX_RECEIPT_SETTINGS_FIELDS}
`;

export const CLUB_TAX_RECEIPTS = gql`
  query ClubTaxReceipts($year: Int!) {
    clubTaxReceiptPendingDonors(year: $year) {
      memberId
      memberName
      claimCount
      totalCents
      missingAddress
    }
    clubTaxReceipts(year: $year) {
      ...TaxReceiptFields
    }
  }
  ${TAX_RECEIPT_FIELDS}
`;

export const ISSUE_CLUB_TAX_RECEIPTS = gql`
  mutation IssueClubTaxReceipts($year: Int!, $memberIds: [ID!]!) {
    issueClubTaxReceipts(year: $year, memberIds: $memberIds) {
      ...TaxReceiptFields
    }
  }
  ${TAX_RECEIPT_FIELDS}
`;

export const CANCEL_CLUB_TAX_RECEIPT = gql`
  mutation CancelClubTaxReceipt($id: ID!, $reason: String!) {
    cancelClubTaxReceipt(id: $id, reason: $reason) {
      ...TaxReceiptFields
    }
  }
  ${TAX_RECEIPT_FIELDS}
`;

export const CLUB_TAX_RECEIPT_PDF = gql`
  query ClubTaxReceiptPdf($id: ID!) {
    clubTaxReceiptPdf(id: $id)
  }
`;
