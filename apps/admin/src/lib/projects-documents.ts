import { gql } from '@apollo/client';

// ==================== Fragments ====================

export const PROJECT_FRAGMENT = gql`
  fragment ProjectFields on ClubProjectGraph {
    id
    clubId
    slug
    title
    summary
    description
    status
    startsAt
    endsAt
    posterAssetId
    posterAssetUrl
    coverImageId
    coverImageUrl
    budgetPlannedCents
    maxPhotosPerContributorPerPhase
    maxVideosPerContributorPerPhase
    maxTextsPerContributorPerPhase
    showContributorCredits
    createdByUserId
    createdAt
    updatedAt
  }
`;

export const PROJECT_SECTION_FRAGMENT = gql`
  fragment ProjectSectionFields on ProjectSectionGraph {
    id
    projectId
    kind
    label
    sortOrder
    bodyJson
    createdAt
    updatedAt
  }
`;

export const PROJECT_LIVE_PHASE_FRAGMENT = gql`
  fragment ProjectLivePhaseFields on ProjectLivePhaseGraph {
    id
    projectId
    label
    startsAt
    endsAt
    state
    openedAt
    closedAt
  }
`;

export const PROJECT_CONTRIBUTOR_FRAGMENT = gql`
  fragment ProjectContributorFields on ProjectContributorGraph {
    id
    projectId
    memberId
    contactId
    role
    addedAt
    revokedAt
    revokedReason
    displayName
    photoUrl
  }
`;

export const PROJECT_LIVE_ITEM_FRAGMENT = gql`
  fragment ProjectLiveItemFields on ProjectLiveItemGraph {
    id
    projectId
    phaseId
    contributorId
    kind
    mediaAssetId
    textContent
    submittedAt
    submittedDuringLive
    aiDecision
    aiReason
    aiScore
    aiCheckedAt
    humanDecision
    humanDecidedBy
    humanDecidedAt
    publishedTo
    publishedRefId
    mediaAsset {
      publicUrl
      mimeType
      fileName
    }
  }
`;

export const PROJECT_REPORT_FRAGMENT = gql`
  fragment ProjectReportFields on ProjectReportGraph {
    id
    projectId
    template
    status
    customPrompt
    bodyJson
    sourceLiveItemIds
    sourceContributorMemberIds
    sourceContributorContactIds
    publishedTo
    publishedRefId
    generatedByAgentConversationId
    createdByUserId
    createdAt
    publishedAt
  }
`;

// ==================== Queries ====================

export const CLUB_PROJECTS = gql`
  query ClubProjects {
    clubProjects {
      ...ProjectFields
    }
  }
  ${PROJECT_FRAGMENT}
`;

export const CLUB_PROJECT = gql`
  query ClubProject($id: ID!) {
    clubProject(id: $id) {
      ...ProjectFields
    }
  }
  ${PROJECT_FRAGMENT}
`;

export const CLUB_PROJECT_SECTIONS = gql`
  query ClubProjectSections($projectId: ID!) {
    clubProjectSections(projectId: $projectId) {
      ...ProjectSectionFields
    }
  }
  ${PROJECT_SECTION_FRAGMENT}
`;

export const CLUB_PROJECT_LIVE_PHASES = gql`
  query ClubProjectLivePhases($projectId: ID!) {
    clubProjectLivePhases(projectId: $projectId) {
      ...ProjectLivePhaseFields
    }
  }
  ${PROJECT_LIVE_PHASE_FRAGMENT}
`;

export const PROJECT_CONTRIBUTORS = gql`
  query ProjectContributors($projectId: ID!, $includeRevoked: Boolean) {
    projectContributors(
      projectId: $projectId
      includeRevoked: $includeRevoked
    ) {
      ...ProjectContributorFields
    }
  }
  ${PROJECT_CONTRIBUTOR_FRAGMENT}
`;

export const PROJECT_LIVE_ITEMS = gql`
  query ProjectLiveItems($projectId: ID!) {
    projectLiveItems(projectId: $projectId) {
      ...ProjectLiveItemFields
    }
  }
  ${PROJECT_LIVE_ITEM_FRAGMENT}
`;

export const PROJECT_REPORTS = gql`
  query ProjectReports($projectId: ID!) {
    projectReports(projectId: $projectId) {
      ...ProjectReportFields
    }
  }
  ${PROJECT_REPORT_FRAGMENT}
`;

// ==================== Mutations : projet ====================

export const CREATE_CLUB_PROJECT = gql`
  mutation CreateClubProject($input: CreateClubProjectInput!) {
    createClubProject(input: $input) {
      ...ProjectFields
    }
  }
  ${PROJECT_FRAGMENT}
`;

export const UPDATE_CLUB_PROJECT = gql`
  mutation UpdateClubProject($input: UpdateClubProjectInput!) {
    updateClubProject(input: $input) {
      ...ProjectFields
    }
  }
  ${PROJECT_FRAGMENT}
`;

export const DELETE_CLUB_PROJECT = gql`
  mutation DeleteClubProject($id: ID!) {
    deleteClubProject(id: $id)
  }
`;

// ==================== Mutations : sections ====================

export const RENAME_PROJECT_SECTION = gql`
  mutation RenameProjectSection($input: RenameProjectSectionInput!) {
    renameProjectSection(input: $input) {
      ...ProjectSectionFields
    }
  }
  ${PROJECT_SECTION_FRAGMENT}
`;

export const REORDER_PROJECT_SECTIONS = gql`
  mutation ReorderProjectSections($projectId: ID!, $orderedSectionIds: [ID!]!) {
    reorderProjectSections(
      projectId: $projectId
      orderedSectionIds: $orderedSectionIds
    )
  }
`;

export const UPDATE_PROJECT_SECTION_BODY = gql`
  mutation UpdateProjectSectionBody($input: UpdateProjectSectionBodyInput!) {
    updateProjectSectionBody(input: $input) {
      ...ProjectSectionFields
    }
  }
  ${PROJECT_SECTION_FRAGMENT}
`;

export const PROJECT_SECTION_ATTACHMENTS = gql`
  query ProjectSectionAttachments($sectionId: ID!) {
    projectSectionAttachments(sectionId: $sectionId) {
      id
      fileName
      mimeType
      sizeBytes
      publicUrl
      uploadedAt
    }
  }
`;

export const ATTACH_PROJECT_SECTION_DOCUMENT = gql`
  mutation AttachProjectSectionDocument(
    $sectionId: ID!
    $mediaAssetId: ID!
  ) {
    attachProjectSectionDocument(
      sectionId: $sectionId
      mediaAssetId: $mediaAssetId
    )
  }
`;

export const DETACH_PROJECT_SECTION_DOCUMENT = gql`
  mutation DetachProjectSectionDocument(
    $sectionId: ID!
    $mediaAssetId: ID!
  ) {
    detachProjectSectionDocument(
      sectionId: $sectionId
      mediaAssetId: $mediaAssetId
    )
  }
`;

export interface ProjectSectionAttachmentGraph {
  id: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  publicUrl: string | null;
  uploadedAt: string;
}

// ==================== Mutations : phases LIVE ====================

export const CREATE_PROJECT_LIVE_PHASE = gql`
  mutation CreateProjectLivePhase($input: CreateProjectLivePhaseInput!) {
    createProjectLivePhase(input: $input) {
      ...ProjectLivePhaseFields
    }
  }
  ${PROJECT_LIVE_PHASE_FRAGMENT}
`;

export const UPDATE_PROJECT_LIVE_PHASE = gql`
  mutation UpdateProjectLivePhase($input: UpdateProjectLivePhaseInput!) {
    updateProjectLivePhase(input: $input) {
      ...ProjectLivePhaseFields
    }
  }
  ${PROJECT_LIVE_PHASE_FRAGMENT}
`;

export const OPEN_PROJECT_LIVE_PHASE = gql`
  mutation OpenProjectLivePhase($id: ID!) {
    openProjectLivePhase(id: $id) {
      ...ProjectLivePhaseFields
    }
  }
  ${PROJECT_LIVE_PHASE_FRAGMENT}
`;

export const CLOSE_PROJECT_LIVE_PHASE = gql`
  mutation CloseProjectLivePhase($id: ID!) {
    closeProjectLivePhase(id: $id) {
      ...ProjectLivePhaseFields
    }
  }
  ${PROJECT_LIVE_PHASE_FRAGMENT}
`;

export const DELETE_PROJECT_LIVE_PHASE = gql`
  mutation DeleteProjectLivePhase($id: ID!) {
    deleteProjectLivePhase(id: $id)
  }
`;

// ==================== Mutations : contributeurs ====================

export const INVITE_PROJECT_CONTRIBUTOR = gql`
  mutation InviteProjectContributor($input: InviteProjectContributorInput!) {
    inviteProjectContributor(input: $input) {
      ...ProjectContributorFields
    }
  }
  ${PROJECT_CONTRIBUTOR_FRAGMENT}
`;

export const REVOKE_PROJECT_CONTRIBUTOR = gql`
  mutation RevokeProjectContributor($id: ID!, $reason: String) {
    revokeProjectContributor(id: $id, reason: $reason) {
      ...ProjectContributorFields
    }
  }
  ${PROJECT_CONTRIBUTOR_FRAGMENT}
`;

// ==================== Mutations : items live ====================

export const DECIDE_PROJECT_LIVE_ITEM = gql`
  mutation DecideProjectLiveItem($input: DecideProjectLiveItemInput!) {
    decideProjectLiveItem(input: $input) {
      ...ProjectLiveItemFields
    }
  }
  ${PROJECT_LIVE_ITEM_FRAGMENT}
`;

export const PUBLISH_PROJECT_LIVE_ITEM = gql`
  mutation PublishProjectLiveItem($input: PublishProjectLiveItemInput!) {
    publishProjectLiveItem(input: $input) {
      ...ProjectLiveItemFields
    }
  }
  ${PROJECT_LIVE_ITEM_FRAGMENT}
`;

// ==================== Mutations : rapports IA ====================

export const GENERATE_PROJECT_REPORT = gql`
  mutation GenerateProjectReport($input: GenerateProjectReportInput!) {
    generateProjectReport(input: $input) {
      ...ProjectReportFields
    }
  }
  ${PROJECT_REPORT_FRAGMENT}
`;

export const UPDATE_PROJECT_REPORT = gql`
  mutation UpdateProjectReport($input: UpdateProjectReportInput!) {
    updateProjectReport(input: $input) {
      ...ProjectReportFields
    }
  }
  ${PROJECT_REPORT_FRAGMENT}
`;

export const PUBLISH_PROJECT_REPORT = gql`
  mutation PublishProjectReport($input: PublishProjectReportInput!) {
    publishProjectReport(input: $input) {
      ...ProjectReportFields
    }
  }
  ${PROJECT_REPORT_FRAGMENT}
`;

export const UNPUBLISH_PROJECT_REPORT = gql`
  mutation UnpublishProjectReport($id: ID!) {
    unpublishProjectReport(id: $id) {
      ...ProjectReportFields
    }
  }
  ${PROJECT_REPORT_FRAGMENT}
`;

export const DELETE_PROJECT_REPORT = gql`
  mutation DeleteProjectReport($id: ID!) {
    deleteProjectReport(id: $id)
  }
`;

// ==================== Types ====================

export type ProjectStatus = 'PLANNED' | 'ACTIVE' | 'CLOSED' | 'ARCHIVED';
export type ProjectLivePhaseState = 'UPCOMING' | 'LIVE' | 'CLOSED';
export type ProjectSectionKind =
  | 'VOLUNTEERS'
  | 'ADMIN'
  | 'COMMUNICATION'
  | 'LIVE'
  | 'ACCOUNTING'
  | 'CUSTOM';
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
export type ProjectLiveItemPublication =
  | 'NONE'
  | 'VITRINE_NEWS'
  | 'VITRINE_BLOG'
  | 'MEMBER_ANNOUNCEMENT';
export type ProjectReportTemplate =
  | 'COMPETITIF'
  | 'FESTIF'
  | 'BILAN'
  | 'CUSTOM';
export type ProjectReportStatus = 'DRAFT' | 'PUBLISHED';

export interface ClubProjectGraph {
  id: string;
  clubId: string;
  slug: string;
  title: string;
  summary: string | null;
  description: string | null;
  status: ProjectStatus;
  startsAt: string | null;
  endsAt: string | null;
  posterAssetId: string | null;
  posterAssetUrl: string | null;
  coverImageId: string | null;
  coverImageUrl: string | null;
  budgetPlannedCents: number | null;
  maxPhotosPerContributorPerPhase: number;
  maxVideosPerContributorPerPhase: number;
  maxTextsPerContributorPerPhase: number;
  showContributorCredits: boolean;
  createdByUserId: string;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectSectionGraph {
  id: string;
  projectId: string;
  kind: ProjectSectionKind;
  label: string;
  sortOrder: number;
  bodyJson: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectLivePhaseGraph {
  id: string;
  projectId: string;
  label: string;
  startsAt: string;
  endsAt: string;
  state: ProjectLivePhaseState;
  openedAt: string | null;
  closedAt: string | null;
}

export interface ProjectContributorGraph {
  id: string;
  projectId: string;
  memberId: string | null;
  contactId: string | null;
  role: 'CONTRIBUTOR';
  addedAt: string;
  revokedAt: string | null;
  revokedReason: string | null;
  displayName: string | null;
  photoUrl: string | null;
}

export interface ProjectLiveItemGraph {
  id: string;
  projectId: string;
  phaseId: string | null;
  contributorId: string;
  kind: ProjectLiveItemKind;
  mediaAssetId: string | null;
  textContent: string | null;
  submittedAt: string;
  submittedDuringLive: boolean;
  aiDecision: ProjectLiveItemAiDecision;
  aiReason: string | null;
  aiScore: number | null;
  aiCheckedAt: string | null;
  humanDecision: ProjectLiveItemHumanDecision;
  humanDecidedBy: string | null;
  humanDecidedAt: string | null;
  publishedTo: ProjectLiveItemPublication;
  publishedRefId: string | null;
  mediaAsset: {
    publicUrl: string | null;
    mimeType: string;
    fileName: string | null;
  } | null;
}

export interface ProjectReportGraph {
  id: string;
  projectId: string;
  template: ProjectReportTemplate;
  status: ProjectReportStatus;
  customPrompt: string | null;
  bodyJson: string;
  sourceLiveItemIds: string[];
  sourceContributorMemberIds: string[];
  sourceContributorContactIds: string[];
  publishedTo: ProjectLiveItemPublication;
  publishedRefId: string | null;
  generatedByAgentConversationId: string | null;
  createdByUserId: string;
  createdAt: string;
  publishedAt: string | null;
}
