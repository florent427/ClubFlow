import { Field, ID, ObjectType } from '@nestjs/graphql';
import {
  ClubSendingDomainPurpose,
  ClubSendingDomainVerificationStatus,
} from '@prisma/client';
import { MailDnsRecordGraph } from './mail-dns-record.model';

@ObjectType()
export class ClubSendingDomainGraph {
  @Field(() => ID)
  id!: string;

  @Field()
  fqdn!: string;

  @Field(() => ClubSendingDomainPurpose)
  purpose!: ClubSendingDomainPurpose;

  @Field(() => ClubSendingDomainVerificationStatus)
  verificationStatus!: ClubSendingDomainVerificationStatus;

  @Field(() => Date, { nullable: true })
  lastCheckedAt!: Date | null;

  @Field(() => [MailDnsRecordGraph])
  dnsRecords!: MailDnsRecordGraph[];

  @Field(() => String, { nullable: true })
  webhookUrlHint!: string | null;

  /** true si le FQDN est sous CLUBFLOW_HOSTED_MAIL_DOMAIN (opérateur). */
  @Field()
  isClubflowHosted!: boolean;
}

@ObjectType()
export class ClubHostedMailOfferGraph {
  @Field()
  enabled!: boolean;

  /** Aperçu du FQDN (libellé issu du slug club + suffixe serveur). */
  @Field(() => String, { nullable: true })
  previewFqdn!: string | null;
}
