import { registerEnumType } from '@nestjs/graphql';
import {
  AccountingEntryKind,
  ClubPaymentMethod,
  ClubSendingDomainPurpose,
  ClubSendingDomainVerificationStatus,
  CommunicationChannel,
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
} from '@prisma/client';
import { ModuleCode } from '../domain/module-registry/module-codes';

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
registerEnumType(AccountingEntryKind, { name: 'AccountingEntryKind' });
registerEnumType(GrantApplicationStatus, {
  name: 'GrantApplicationStatus',
});
registerEnumType(SponsorshipDealStatus, {
  name: 'SponsorshipDealStatus',
});
