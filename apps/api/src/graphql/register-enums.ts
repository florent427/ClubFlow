import { registerEnumType } from '@nestjs/graphql';
import {
  AccountingEntryKind,
  ClubPaymentMethod,
  ClubSendingDomainPurpose,
  ClubSendingDomainVerificationStatus,
  CommunicationChannel,
  FamilyInviteRole,
  FamilyMemberLinkRole,
  GrantApplicationStatus,
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
  SubscriptionBillingRhythm,
  ChatRoomKind,
  ChatRoomMemberRole,
  ClubSurveyStatus,
  ClubEventStatus,
  ClubEventRegistrationStatus,
  CourseSlotBookingStatus,
  BlogPostStatus,
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
registerEnumType(GrantApplicationStatus, {
  name: 'GrantApplicationStatus',
});
registerEnumType(SponsorshipDealStatus, {
  name: 'SponsorshipDealStatus',
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
