import { registerEnumType } from '@nestjs/graphql';
import {
  AccountingAccountKind,
  AccountingAuditAction,
  AccountingDocumentKind,
  AccountingEntryKind,
  AccountingEntrySource,
  AccountingEntryStatus,
  AccountingLineSide,
  ClubPaymentMethod,
  ClubSendingDomainPurpose,
  ClubSendingDomainVerificationStatus,
  CommunicationChannel,
  FamilyInviteRole,
  FamilyMemberLinkRole,
  Gender,
  GrantApplicationStatus,
  GrantDocumentKind,
  InvoiceLineAdjustmentType,
  InvoiceLineKind,
  InvoiceStatus,
  MemberCatalogFieldKey,
  MemberCivility,
  MemberClubRole,
  MemberCustomFieldType,
  MemberStatus,
  MembershipRole,
  MessageCampaignStatus,
  PricingAdjustmentType,
  SponsorshipDealStatus,
  SponsorshipDocumentKind,
  SponsorshipKind,
  SubscriptionBillingRhythm,
  VatMode,
  ChatRoomKind,
  ChatRoomMemberRole,
  ClubSurveyStatus,
  ClubEventStatus,
  ClubEventRegistrationStatus,
  CourseSlotBookingStatus,
  BlogPostStatus,
  ShopOrderStatus,
} from '@prisma/client';
import { ModuleCode } from '../domain/module-registry/module-codes';
import { QuickMessageRecipientType } from '../comms/enums/quick-message-recipient.enum';

registerEnumType(MembershipRole, { name: 'MembershipRole' });
registerEnumType(ModuleCode, { name: 'ModuleCode' });
registerEnumType(MemberStatus, { name: 'MemberStatus' });
registerEnumType(MemberClubRole, { name: 'MemberClubRole' });
registerEnumType(MemberCatalogFieldKey, {
  name: 'MemberCatalogFieldKey',
});
registerEnumType(MemberCivility, { name: 'MemberCivility' });
registerEnumType(MemberCustomFieldType, {
  name: 'MemberCustomFieldType',
});
registerEnumType(FamilyMemberLinkRole, { name: 'FamilyMemberLinkRole' });
registerEnumType(FamilyInviteRole, { name: 'FamilyInviteRole' });
registerEnumType(InvoiceStatus, { name: 'InvoiceStatus' });
registerEnumType(InvoiceLineKind, { name: 'InvoiceLineKind' });
registerEnumType(SubscriptionBillingRhythm, {
  name: 'SubscriptionBillingRhythm',
});
registerEnumType(InvoiceLineAdjustmentType, {
  name: 'InvoiceLineAdjustmentType',
});
registerEnumType(ClubPaymentMethod, { name: 'ClubPaymentMethod' });
registerEnumType(PricingAdjustmentType, {
  name: 'PricingAdjustmentType',
});
registerEnumType(ClubSendingDomainPurpose, {
  name: 'ClubSendingDomainPurpose',
});
registerEnumType(ClubSendingDomainVerificationStatus, {
  name: 'ClubSendingDomainVerificationStatus',
});
registerEnumType(CommunicationChannel, { name: 'CommunicationChannel' });
registerEnumType(MessageCampaignStatus, {
  name: 'MessageCampaignStatus',
});
registerEnumType(QuickMessageRecipientType, {
  name: 'QuickMessageRecipientType',
});
registerEnumType(AccountingEntryKind, { name: 'AccountingEntryKind' });
registerEnumType(AccountingEntryStatus, {
  name: 'AccountingEntryStatus',
});
registerEnumType(AccountingEntrySource, {
  name: 'AccountingEntrySource',
});
registerEnumType(AccountingAccountKind, { name: 'AccountingAccountKind' });
registerEnumType(AccountingLineSide, { name: 'AccountingLineSide' });
registerEnumType(AccountingAuditAction, {
  name: 'AccountingAuditAction',
});
registerEnumType(AccountingDocumentKind, {
  name: 'AccountingDocumentKind',
});
registerEnumType(Gender, { name: 'Gender' });
registerEnumType(VatMode, { name: 'VatMode' });
registerEnumType(GrantApplicationStatus, {
  name: 'GrantApplicationStatus',
});
registerEnumType(GrantDocumentKind, { name: 'GrantDocumentKind' });
registerEnumType(SponsorshipDealStatus, {
  name: 'SponsorshipDealStatus',
});
registerEnumType(SponsorshipKind, { name: 'SponsorshipKind' });
registerEnumType(SponsorshipDocumentKind, {
  name: 'SponsorshipDocumentKind',
});
registerEnumType(ChatRoomKind, { name: 'ChatRoomKind' });
registerEnumType(ChatRoomMemberRole, { name: 'ChatRoomMemberRole' });
registerEnumType(ClubSurveyStatus, { name: 'ClubSurveyStatus' });
registerEnumType(ClubEventStatus, { name: 'ClubEventStatus' });
registerEnumType(ClubEventRegistrationStatus, {
  name: 'ClubEventRegistrationStatus',
});
registerEnumType(CourseSlotBookingStatus, {
  name: 'CourseSlotBookingStatus',
});
registerEnumType(BlogPostStatus, { name: 'BlogPostStatus' });
registerEnumType(ShopOrderStatus, { name: 'ShopOrderStatus' });
