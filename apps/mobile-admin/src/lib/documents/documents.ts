import { gql } from '@apollo/client';

export const CLUB_DOCUMENTS = gql`
  query ClubDocuments {
    clubDocuments {
      id
      name
      description
      category
      version
      isRequired
      isActive
      validFrom
      validTo
      minorsOnly
      mediaAssetUrl
      signedCount
      createdAt
      updatedAt
    }
  }
`;

export const CLUB_DOCUMENT = gql`
  query ClubDocument($id: ID!) {
    clubDocument(id: $id) {
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
      mediaAssetId
      mediaAssetUrl
      signedCount
      fields {
        id
        page
        x
        y
        width
        height
        fieldType
        required
        label
      }
      createdAt
      updatedAt
    }
  }
`;

export const CLUB_DOCUMENT_SIGNATURES = gql`
  query ClubDocumentSignatures($documentId: ID!) {
    clubDocumentSignatures(documentId: $documentId) {
      id
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

export const ARCHIVE_CLUB_DOCUMENT = gql`
  mutation ArchiveClubDocument($id: ID!) {
    archiveClubDocument(id: $id) {
      id
      isActive
    }
  }
`;

export const DELETE_CLUB_DOCUMENT = gql`
  mutation DeleteClubDocument($id: ID!) {
    deleteClubDocument(id: $id)
  }
`;

export const CATEGORY_LABELS: Record<string, string> = {
  REGLEMENT_INTERIEUR: 'Règlement intérieur',
  AUTORISATION_PARENTALE: 'Autorisation parentale',
  DROIT_IMAGE: 'Droit à l\'image',
  REGLEMENT_FEDERAL: 'Règlement fédéral',
  AUTRE: 'Autre',
};

/**
 * Tones acceptés par le composant `Pill` (mobile-shared).
 * Mapping sémantique des catégories de documents.
 */
export const CATEGORY_TONES: Record<
  string,
  'primary' | 'warning' | 'info' | 'neutral'
> = {
  REGLEMENT_INTERIEUR: 'primary',
  AUTORISATION_PARENTALE: 'warning',
  DROIT_IMAGE: 'info',
  REGLEMENT_FEDERAL: 'neutral',
  AUTRE: 'neutral',
};
