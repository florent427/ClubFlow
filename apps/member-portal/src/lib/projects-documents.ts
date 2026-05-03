import { gql } from '@apollo/client';

// ==================== Types ====================

export type ProjectStatus = 'PLANNED' | 'ACTIVE' | 'CLOSED' | 'ARCHIVED';
export type ProjectLiveItemKind = 'PHOTO' | 'VIDEO' | 'TEXT';
export type ProjectLiveItemAiDecision =
  | 'PENDING'
  | 'APPROVED'
  | 'REJECTED'
  | 'ERROR';
export type ProjectLiveItemHumanDecision =
  | 'PENDING'
  | 'APPROVED'
  | 'REJECTED';

export interface MyProjectGraph {
  id: string;
  clubId: string;
  slug: string;
  title: string;
  summary: string | null;
  status: ProjectStatus;
  startsAt: string | null;
  endsAt: string | null;
  coverImageUrl: string | null;
  maxPhotosPerContributorPerPhase: number;
  maxVideosPerContributorPerPhase: number;
  maxTextsPerContributorPerPhase: number;
}

export interface MyProjectLiveItem {
  id: string;
  projectId: string;
  phaseId: string | null;
  kind: ProjectLiveItemKind;
  mediaAssetId: string | null;
  textContent: string | null;
  submittedAt: string;
  submittedDuringLive: boolean;
  aiDecision: ProjectLiveItemAiDecision;
  aiReason: string | null;
  humanDecision: ProjectLiveItemHumanDecision;
  mediaAsset: {
    publicUrl: string | null;
    mimeType: string;
    fileName: string | null;
  } | null;
}

export interface LiveItemQuotaInfo {
  phaseId: string | null;
  phaseLabel: string | null;
  phaseIsLive: boolean;
  maxPhotos: number;
  usedPhotos: number;
  maxVideos: number;
  usedVideos: number;
  maxTexts: number;
  usedTexts: number;
}

// ==================== Queries ====================

export const MY_PROJECT_CONTRIBUTIONS = gql`
  query MyProjectContributions {
    myProjectContributions {
      id
      clubId
      slug
      title
      summary
      status
      startsAt
      endsAt
      coverImageUrl
      maxPhotosPerContributorPerPhase
      maxVideosPerContributorPerPhase
      maxTextsPerContributorPerPhase
    }
  }
`;

export const MY_PROJECT_LIVE_ITEMS = gql`
  query MyProjectLiveItems($projectId: ID!) {
    myProjectLiveItems(projectId: $projectId) {
      id
      projectId
      phaseId
      kind
      mediaAssetId
      textContent
      submittedAt
      submittedDuringLive
      aiDecision
      aiReason
      humanDecision
      mediaAsset {
        publicUrl
        mimeType
        fileName
      }
    }
  }
`;

export const MY_PROJECT_LIVE_ITEM_QUOTA = gql`
  query MyProjectLiveItemQuota($projectId: ID!) {
    myProjectLiveItemQuota(projectId: $projectId) {
      phaseId
      phaseLabel
      phaseIsLive
      maxPhotos
      usedPhotos
      maxVideos
      usedVideos
      maxTexts
      usedTexts
    }
  }
`;

export const MY_PROJECT_PHASES = gql`
  query MyProjectPhases($projectId: ID!) {
    myProjectPhases(projectId: $projectId) {
      id
      projectId
      label
      startsAt
      endsAt
      state
      openedAt
      closedAt
    }
  }
`;

export type ProjectLivePhaseState = 'UPCOMING' | 'LIVE' | 'CLOSED';

export interface MyProjectPhase {
  id: string;
  projectId: string;
  label: string;
  startsAt: string;
  endsAt: string;
  state: ProjectLivePhaseState;
  openedAt: string | null;
  closedAt: string | null;
}

// ==================== Mutations ====================

export const SUBMIT_PROJECT_LIVE_ITEM = gql`
  mutation SubmitProjectLiveItem($input: SubmitProjectLiveItemInput!) {
    submitProjectLiveItem(input: $input) {
      id
      kind
      humanDecision
      aiDecision
      submittedAt
    }
  }
`;

export const DELETE_MY_PROJECT_LIVE_ITEM = gql`
  mutation DeleteMyProjectLiveItem($id: ID!) {
    deleteMyProjectLiveItem(id: $id)
  }
`;
