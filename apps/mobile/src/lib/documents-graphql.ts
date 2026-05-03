import { gql } from '@apollo/client';

/**
 * Documents à signer côté membre — queries / mutations utilisées par
 * l'écran "Documents à signer" et son badge sur le HomeDashboard.
 *
 * Backend : commit b76fad0 (module signature électronique, livraison 1/6).
 */

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

// =====================================================
// Types TypeScript correspondants
// =====================================================

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

export type ClubDocumentField = {
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

export type ClubDocumentToSign = {
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
  mediaAssetUrl: string | null;
  fields: ClubDocumentField[];
  createdAt: string;
};

export type ViewerDocumentsToSignData = {
  viewerDocumentsToSign: ClubDocumentToSign[];
};

export type ViewerSignClubDocumentData = {
  viewerSignClubDocument: {
    id: string;
    signedAssetUrl: string | null;
    signedAt: string;
  };
};

export type SignClubDocumentFieldValueInput = {
  fieldId: string;
  type: ClubDocumentFieldType;
  valuePngBase64?: string | null;
  text?: string | null;
  bool?: boolean | null;
};

export type SignClubDocumentInput = {
  documentId: string;
  memberId?: string | null;
  fieldValues: SignClubDocumentFieldValueInput[];
};

/**
 * Catégorie → libellé humain + icône Ionicons. Source unique de vérité
 * pour l'affichage de la pill catégorie sur l'écran liste.
 */
export const CATEGORY_LABEL: Record<ClubDocumentCategory, string> = {
  REGLEMENT_INTERIEUR: 'Règlement intérieur',
  AUTORISATION_PARENTALE: 'Autorisation parentale',
  DROIT_IMAGE: "Droit à l'image",
  REGLEMENT_FEDERAL: 'Règlement fédéral',
  AUTRE: 'Document',
};

export const CATEGORY_ICON: Record<
  ClubDocumentCategory,
  | 'ribbon-outline'
  | 'shield-outline'
  | 'image-outline'
  | 'flag-outline'
  | 'document-outline'
> = {
  REGLEMENT_INTERIEUR: 'ribbon-outline',
  AUTORISATION_PARENTALE: 'shield-outline',
  DROIT_IMAGE: 'image-outline',
  REGLEMENT_FEDERAL: 'flag-outline',
  AUTRE: 'document-outline',
};
