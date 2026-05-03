import { gql } from '@apollo/client';

/**
 * Documents à signer côté membre (portail web).
 * Backend : apps/api/src/documents/viewer-documents.resolver.ts
 */

export type ClubDocumentCategory =
  | 'REGLEMENT_INTERIEUR'
  | 'AUTORISATION_PARENTALE'
  | 'DROIT_IMAGE'
  | 'REGLEMENT_FEDERAL'
  | 'AUTRE';

export type ClubDocumentFieldType =
  | 'SIGNATURE'
  | 'TEXT'
  | 'DATE'
  | 'CHECKBOX';

export type ViewerDocumentField = {
  id: string;
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
  fieldType: ClubDocumentFieldType;
  required: boolean;
  label: string | null;
  sortOrder: number;
};

export type ViewerDocumentToSign = {
  id: string;
  name: string;
  description: string | null;
  category: ClubDocumentCategory;
  version: number;
  isRequired: boolean;
  validFrom: string;
  validTo: string | null;
  minorsOnly: boolean;
  mediaAssetId: string;
  mediaAssetUrl: string;
  fields: ViewerDocumentField[];
  createdAt: string;
};

export type ViewerSignedDocument = {
  id: string;
  signedAssetUrl: string;
  signedAt: string;
};

export const VIEWER_DOCUMENTS_TO_SIGN = gql`
  query ViewerDocumentsToSign($memberId: ID) {
    viewerDocumentsToSign(memberId: $memberId) {
      id
      name
      description
      category
      version
      isRequired
      validFrom
      validTo
      minorsOnly
      mediaAssetId
      mediaAssetUrl
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
        sortOrder
      }
      createdAt
    }
  }
`;

export const VIEWER_SIGN_CLUB_DOCUMENT = gql`
  mutation ViewerSignClubDocument($input: SignClubDocumentInput!) {
    viewerSignClubDocument(input: $input) {
      id
      signedAssetUrl
      signedAt
    }
  }
`;

export const CATEGORY_LABEL: Record<ClubDocumentCategory, string> = {
  REGLEMENT_INTERIEUR: 'Règlement intérieur',
  AUTORISATION_PARENTALE: 'Autorisation parentale',
  DROIT_IMAGE: "Droit à l'image",
  REGLEMENT_FEDERAL: 'Règlement fédéral',
  AUTRE: 'Document',
};
