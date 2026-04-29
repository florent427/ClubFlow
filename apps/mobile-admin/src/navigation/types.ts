import type { LoginProfile } from '../lib/auth-types';

export type RootStackParamList = {
  Login: undefined;
  SelectClub: { profiles: LoginProfile[] };
  VerifyEmail: { token?: string };
  Main: undefined;
};

export type MainTabParamList = {
  Home: undefined;
  Community: undefined;
  Activities: undefined;
  More: undefined;
};

/** Stacks imbriqués (chaque module métier). */
export type MembersStackParamList = {
  Directory: undefined;
  MemberDetail: { memberId: string };
  NewMember: undefined;
  Grades: undefined;
  DynamicGroups: undefined;
  DynamicGroupEditor: { groupId?: string };
  Roles: undefined;
  Families: undefined;
  FamilyDetail: { familyId: string };
  NewFamily: undefined;
  Contacts: undefined;
  ContactDetail: { contactId: string };
  MembershipCarts: undefined;
  MembershipCartDetail: { cartId: string };
};

export type PlanningStackParamList = {
  Planning: undefined;
  CourseSlotDetail: { slotId: string };
  NewCourseSlot: undefined;
};

export type EventsStackParamList = {
  Events: undefined;
  EventDetail: { eventId: string };
  EventRegistrations: { eventId: string };
  NewEvent: undefined;
};

export type ProjectsStackParamList = {
  Projects: undefined;
  ProjectDetail: { projectId: string };
  ProjectLivePhase: { projectId: string; phaseId: string };
  NewProject: undefined;
};

export type BookingStackParamList = {
  Booking: undefined;
  BookingSlotDetail: { slotId: string };
};

export type CommunicationStackParamList = {
  Campaigns: undefined;
  CampaignDetail: { campaignId: string };
  NewCampaign: undefined;
  QuickMessage: undefined;
};

export type MessagingStackParamList = {
  MessagingHome: undefined;
  MessagingThread: { roomId: string };
  NewChatGroup: undefined;
  ChatGroupSettings: { roomId: string };
};

export type ClubLifeStackParamList = {
  Announcements: undefined;
  NewAnnouncement: undefined;
  Surveys: undefined;
  SurveyDetail: { surveyId: string };
  NewSurvey: undefined;
};

export type BlogStackParamList = {
  BlogPosts: undefined;
  BlogPostEditor: { postId: string };
  NewBlogPost: undefined;
};

export type BillingStackParamList = {
  Invoices: undefined;
  InvoiceDetail: { invoiceId: string };
  NewInvoice: undefined;
  RecordPayment: { invoiceId?: string };
};

export type AccountingStackParamList = {
  AccountingHome: undefined;
  ReviewQueue: undefined;
  EntryDetail: { entryId: string };
  NewEntry: { mode?: 'camera' | 'quick' | 'manual' };
  ReceiptScanner: undefined;
  PeriodLock: undefined;
  AccountingSettings: undefined;
  Export: undefined;
};

export type ShopStackParamList = {
  Products: undefined;
  ProductEditor: { productId?: string };
  Orders: undefined;
  OrderDetail: { orderId: string };
};

export type SponsoringStackParamList = {
  Sponsorships: undefined;
  SponsorshipDetail: { dealId: string };
  NewSponsorship: undefined;
};

export type SubsidiesStackParamList = {
  Subsidies: undefined;
  SubsidyDetail: { grantId: string };
  NewSubsidy: undefined;
};

export type VitrineStackParamList = {
  VitrineHome: undefined;
  Pages: undefined;
  PageEditor: { slug: string };
  Articles: undefined;
  ArticleEditor: { articleId?: string };
  Categories: undefined;
  Comments: undefined;
  Gallery: undefined;
  MediaLibrary: undefined;
  Branding: undefined;
  Settings: undefined;
};

export type SettingsStackParamList = {
  SettingsHub: undefined;
  ClubBranding: undefined;
  ClubModules: undefined;
  MemberFields: undefined;
  Adhesion: undefined;
  PricingRules: undefined;
  AdhesionPricingRules: undefined;
  MailDomain: undefined;
  AiSettings: undefined;
  Profile: undefined;
};

export type AgentStackParamList = {
  AikoChat: undefined;
  AgentAudit: undefined;
};

export type SystemAdminStackParamList = {
  SystemDashboard: undefined;
  SystemAdmins: undefined;
  SystemUsers: undefined;
};
