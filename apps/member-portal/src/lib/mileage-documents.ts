import { gql } from '@apollo/client';

/*
 * Frais kilométriques côté bénévole (résolveur `MileageViewerResolver`).
 * Distances en mètres (Int), dates 'YYYY-MM-DD', montants en centimes.
 */

// ==================== Types ====================

export type MileageVehicleKind = 'CAR' | 'MOTORCYCLE' | 'MOPED';
export type MileageClaimStatus = 'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'REJECTED';
export type MileageSettlement = 'REIMBURSEMENT' | 'DONATION';

export interface MileageVehicle {
  id: string;
  label: string;
  kind: MileageVehicleKind;
  fiscalHorsepower: number | null;
  isElectric: boolean;
  archived: boolean;
}

export interface MileageRecurringTrip {
  id: string;
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
}

export interface MileageTrip {
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
}

export interface MileageClaimSummary {
  id: string;
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
  taxReceiptId: string | null;
  taxReceiptNumber: string | null;
  firstTripDate: string | null;
  lastTripDate: string | null;
  tripCount: number;
  createdAt: string;
}

export interface MileageClaim extends MileageClaimSummary {
  trips: MileageTrip[];
}

export interface TaxReceipt {
  id: string;
  year: number;
  number: string;
  amountCents: number;
  issuedOn: string;
}

export interface MileageClaimInput {
  title: string;
  settlement: MileageSettlement;
  memberNote: string | null;
}

export interface MileageTripInput {
  vehicleId: string;
  tripDate: string;
  fromLabel: string;
  toLabel: string;
  purpose: string;
  distanceMeters: number;
  roundTrip: boolean;
}

export interface MileageVehicleInput {
  label: string;
  kind: MileageVehicleKind;
  fiscalHorsepower: number | null;
  isElectric: boolean;
}

export interface MileageRecurringTripInput {
  vehicleId: string;
  fromLabel: string;
  toLabel: string;
  purpose: string;
  distanceMeters: number;
  roundTrip: boolean;
  weekdays: number[];
  startsOn: string;
  endsOn: string | null;
}

// ==================== Fragments ====================

const CLAIM_SUMMARY_FIELDS = gql`
  fragment ViewerMileageClaimSummaryFields on MileageClaimGraph {
    id
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
    taxReceiptId
    taxReceiptNumber
    firstTripDate
    lastTripDate
    tripCount
    createdAt
  }
`;

const CLAIM_FIELDS = gql`
  fragment ViewerMileageClaimFields on MileageClaimGraph {
    ...ViewerMileageClaimSummaryFields
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
  fragment ViewerMileageVehicleFields on MileageVehicleGraph {
    id
    label
    kind
    fiscalHorsepower
    isElectric
    archived
  }
`;

const RECURRING_FIELDS = gql`
  fragment ViewerMileageRecurringFields on MileageRecurringTripGraph {
    id
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
`;

// ==================== Notes ====================

export const VIEWER_MILEAGE_DONATION_AVAILABLE = gql`
  query ViewerMileageDonationAvailable {
    viewerMileageDonationAvailable
  }
`;
export type ViewerMileageDonationAvailableData = {
  viewerMileageDonationAvailable: boolean;
};

export const VIEWER_MILEAGE_CLAIMS = gql`
  query ViewerMileageClaims {
    viewerMileageClaims {
      ...ViewerMileageClaimSummaryFields
    }
  }
  ${CLAIM_SUMMARY_FIELDS}
`;
export type ViewerMileageClaimsData = {
  viewerMileageClaims: MileageClaimSummary[];
};

export const VIEWER_MILEAGE_CLAIM = gql`
  query ViewerMileageClaim($id: ID!) {
    viewerMileageClaim(id: $id) {
      ...ViewerMileageClaimFields
    }
  }
  ${CLAIM_FIELDS}
`;
export type ViewerMileageClaimData = { viewerMileageClaim: MileageClaim };

export const VIEWER_CREATE_MILEAGE_CLAIM = gql`
  mutation ViewerCreateMileageClaim($input: MileageClaimInputGraph!) {
    viewerCreateMileageClaim(input: $input) {
      ...ViewerMileageClaimFields
    }
  }
  ${CLAIM_FIELDS}
`;
export type ViewerCreateMileageClaimData = {
  viewerCreateMileageClaim: MileageClaim;
};

export const VIEWER_UPDATE_MILEAGE_CLAIM = gql`
  mutation ViewerUpdateMileageClaim($id: ID!, $input: MileageClaimInputGraph!) {
    viewerUpdateMileageClaim(id: $id, input: $input) {
      ...ViewerMileageClaimFields
    }
  }
  ${CLAIM_FIELDS}
`;

export const VIEWER_DELETE_MILEAGE_CLAIM = gql`
  mutation ViewerDeleteMileageClaim($id: ID!) {
    viewerDeleteMileageClaim(id: $id)
  }
`;

export const VIEWER_ADD_MILEAGE_TRIP = gql`
  mutation ViewerAddMileageTrip($claimId: ID!, $input: MileageTripInputGraph!) {
    viewerAddMileageTrip(claimId: $claimId, input: $input) {
      ...ViewerMileageClaimFields
    }
  }
  ${CLAIM_FIELDS}
`;

export const VIEWER_UPDATE_MILEAGE_TRIP = gql`
  mutation ViewerUpdateMileageTrip($id: ID!, $input: MileageTripInputGraph!) {
    viewerUpdateMileageTrip(id: $id, input: $input) {
      ...ViewerMileageClaimFields
    }
  }
  ${CLAIM_FIELDS}
`;

export const VIEWER_DELETE_MILEAGE_TRIP = gql`
  mutation ViewerDeleteMileageTrip($id: ID!) {
    viewerDeleteMileageTrip(id: $id) {
      ...ViewerMileageClaimFields
    }
  }
  ${CLAIM_FIELDS}
`;

export const VIEWER_ADD_MILEAGE_RECURRING_TRIPS = gql`
  mutation ViewerAddMileageRecurringTrips(
    $claimId: ID!
    $from: String!
    $to: String!
  ) {
    viewerAddMileageRecurringTrips(claimId: $claimId, from: $from, to: $to) {
      added
      claim {
        ...ViewerMileageClaimFields
      }
    }
  }
  ${CLAIM_FIELDS}
`;
export type ViewerAddMileageRecurringTripsData = {
  viewerAddMileageRecurringTrips: { added: number; claim: MileageClaim };
};

export const VIEWER_SUBMIT_MILEAGE_CLAIM = gql`
  mutation ViewerSubmitMileageClaim($id: ID!) {
    viewerSubmitMileageClaim(id: $id) {
      ...ViewerMileageClaimFields
    }
  }
  ${CLAIM_FIELDS}
`;

// ==================== Véhicules ====================

export const VIEWER_MILEAGE_VEHICLES = gql`
  query ViewerMileageVehicles($includeArchived: Boolean) {
    viewerMileageVehicles(includeArchived: $includeArchived) {
      ...ViewerMileageVehicleFields
    }
  }
  ${VEHICLE_FIELDS}
`;
export type ViewerMileageVehiclesData = {
  viewerMileageVehicles: MileageVehicle[];
};

export const VIEWER_CREATE_MILEAGE_VEHICLE = gql`
  mutation ViewerCreateMileageVehicle($input: MileageVehicleInputGraph!) {
    viewerCreateMileageVehicle(input: $input) {
      ...ViewerMileageVehicleFields
    }
  }
  ${VEHICLE_FIELDS}
`;

export const VIEWER_UPDATE_MILEAGE_VEHICLE = gql`
  mutation ViewerUpdateMileageVehicle(
    $id: ID!
    $input: MileageVehicleInputGraph!
  ) {
    viewerUpdateMileageVehicle(id: $id, input: $input) {
      ...ViewerMileageVehicleFields
    }
  }
  ${VEHICLE_FIELDS}
`;

export const VIEWER_SET_MILEAGE_VEHICLE_ARCHIVED = gql`
  mutation ViewerSetMileageVehicleArchived($id: ID!, $archived: Boolean!) {
    viewerSetMileageVehicleArchived(id: $id, archived: $archived) {
      ...ViewerMileageVehicleFields
    }
  }
  ${VEHICLE_FIELDS}
`;

export const VIEWER_DELETE_MILEAGE_VEHICLE = gql`
  mutation ViewerDeleteMileageVehicle($id: ID!) {
    viewerDeleteMileageVehicle(id: $id)
  }
`;

// ==================== Trajets récurrents ====================

export const VIEWER_MILEAGE_RECURRING_TRIPS = gql`
  query ViewerMileageRecurringTrips($includeArchived: Boolean) {
    viewerMileageRecurringTrips(includeArchived: $includeArchived) {
      ...ViewerMileageRecurringFields
    }
  }
  ${RECURRING_FIELDS}
`;
export type ViewerMileageRecurringTripsData = {
  viewerMileageRecurringTrips: MileageRecurringTrip[];
};

export const VIEWER_CREATE_MILEAGE_RECURRING_TRIP = gql`
  mutation ViewerCreateMileageRecurringTrip(
    $input: MileageRecurringTripInputGraph!
  ) {
    viewerCreateMileageRecurringTrip(input: $input) {
      ...ViewerMileageRecurringFields
    }
  }
  ${RECURRING_FIELDS}
`;

export const VIEWER_UPDATE_MILEAGE_RECURRING_TRIP = gql`
  mutation ViewerUpdateMileageRecurringTrip(
    $id: ID!
    $input: MileageRecurringTripInputGraph!
  ) {
    viewerUpdateMileageRecurringTrip(id: $id, input: $input) {
      ...ViewerMileageRecurringFields
    }
  }
  ${RECURRING_FIELDS}
`;

export const VIEWER_SET_MILEAGE_RECURRING_TRIP_ARCHIVED = gql`
  mutation ViewerSetMileageRecurringTripArchived(
    $id: ID!
    $archived: Boolean!
  ) {
    viewerSetMileageRecurringTripArchived(id: $id, archived: $archived) {
      ...ViewerMileageRecurringFields
    }
  }
  ${RECURRING_FIELDS}
`;

export const VIEWER_DELETE_MILEAGE_RECURRING_TRIP = gql`
  mutation ViewerDeleteMileageRecurringTrip($id: ID!) {
    viewerDeleteMileageRecurringTrip(id: $id)
  }
`;

// ==================== Reçus fiscaux ====================

export const VIEWER_TAX_RECEIPTS = gql`
  query ViewerTaxReceipts {
    viewerTaxReceipts {
      id
      year
      number
      amountCents
      issuedOn
    }
  }
`;
export type ViewerTaxReceiptsData = { viewerTaxReceipts: TaxReceipt[] };

export const VIEWER_TAX_RECEIPT_PDF = gql`
  query ViewerTaxReceiptPdf($id: ID!) {
    viewerTaxReceiptPdf(id: $id)
  }
`;
export type ViewerTaxReceiptPdfData = { viewerTaxReceiptPdf: string };
