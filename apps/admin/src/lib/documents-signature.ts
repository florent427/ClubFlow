import { gql } from '@apollo/client';

/**
 * Documents GraphQL pour le module **Documents à signer** côté admin.
 *
 * Le backend expose :
 *   - `clubDocuments` / `clubDocument(id)` — listes et détail (incl. fields).
 *   - `clubDocumentSignatures(documentId)` — historique des signatures.
 *   - `clubDocumentSignatureStats(documentId)` — KPI de couverture.
 *   - Mutations CRUD documents + `upsertClubDocumentFields` pour positionner
 *     les zones interactives sur le PDF (signature, texte, date, case).
 *
 * Toutes les coordonnées des fields sont en % du format de la page (0..1) —
 * indépendant de la résolution de rendu côté UI.
 */

const CLUB_DOCUMENT_FIELDS_FRAGMENT = gql`
  fragment ClubDocumentFieldFragment on ClubDocumentFieldGraph {
    id
    page
    x
    y
    width
    height
    fieldType
    required
    label
    sortOrder
  }
`;

const CLUB_DOCUMENT_FRAGMENT = gql`
  fragment ClubDocumentFragment on ClubDocumentGraph {
    id
    name
    description
    category
    version
    fileSha256
    isRequired
    isActive
    validFrom
    validTo
    minorsOnly
    targetSystemRoles
    targetCustomRoleIds
    mediaAssetId
    mediaAssetUrl
    signedCount
    createdAt
    updatedAt
    fields {
      ...ClubDocumentFieldFragment
    }
  }
  ${CLUB_DOCUMENT_FIELDS_FRAGMENT}
`;

export const CLUB_DOCUMENTS = gql`
  query ClubDocuments {
    clubDocuments {
      ...ClubDocumentFragment
    }
  }
  ${CLUB_DOCUMENT_FRAGMENT}
`;

export const CLUB_DOCUMENT = gql`
  query ClubDocument($id: ID!) {
    clubDocument(id: $id) {
      ...ClubDocumentFragment
    }
  }
  ${CLUB_DOCUMENT_FRAGMENT}
`;

export const CLUB_DOCUMENT_SIGNATURES = gql`
  query ClubDocumentSignatures($documentId: ID!) {
    clubDocumentSignatures(documentId: $documentId) {
      id
      documentId
      version
      userId
      memberId
      signedAssetUrl
      signedSha256
      ipAddress
      userAgent
      signerDisplayName
      signedAt
      invalidatedAt
    }
  }
`;

export const CLUB_DOCUMENT_SIGNATURE_STATS = gql`
  query ClubDocumentSignatureStats($documentId: ID!) {
    clubDocumentSignatureStats(documentId: $documentId) {
      totalRequired
      totalSigned
      percentSigned
      unsignedMemberIds
    }
  }
`;

export const CREATE_CLUB_DOCUMENT = gql`
  mutation CreateClubDocument($input: CreateClubDocumentInput!) {
    createClubDocument(input: $input) {
      ...ClubDocumentFragment
    }
  }
  ${CLUB_DOCUMENT_FRAGMENT}
`;

export const UPDATE_CLUB_DOCUMENT = gql`
  mutation UpdateClubDocument($input: UpdateClubDocumentInput!) {
    updateClubDocument(input: $input) {
      ...ClubDocumentFragment
    }
  }
  ${CLUB_DOCUMENT_FRAGMENT}
`;

export const ARCHIVE_CLUB_DOCUMENT = gql`
  mutation ArchiveClubDocument($id: ID!) {
    archiveClubDocument(id: $id) {
      ...ClubDocumentFragment
    }
  }
  ${CLUB_DOCUMENT_FRAGMENT}
`;

export const DELETE_CLUB_DOCUMENT = gql`
  mutation DeleteClubDocument($id: ID!) {
    deleteClubDocument(id: $id)
  }
`;

export const UPSERT_CLUB_DOCUMENT_FIELDS = gql`
  mutation UpsertClubDocumentFields(
    $documentId: ID!
    $fields: [ClubDocumentFieldInput!]!
  ) {
    upsertClubDocumentFields(documentId: $documentId, fields: $fields) {
      id
      page
      x
      y
      width
      height
      fieldType
      required
      label
      sortOrder
    }
  }
`;
