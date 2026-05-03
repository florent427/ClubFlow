import { Field, ID, Int, ObjectType } from '@nestjs/graphql';
import { CommunicationChannel, MessageCampaignStatus } from '@prisma/client';

@ObjectType()
export class MessageCampaignGraph {
  @Field(() => ID)
  id!: string;

  @Field()
  title!: string;

  @Field()
  body!: string;

  /** LEGACY single-channel — toujours populé (`channels[0]` si nouveau format). */
  @Field(() => CommunicationChannel)
  channel!: CommunicationChannel;

  /**
   * Multi-canal : la campagne est délivrée via tous ces canaux. Vide
   * pour les anciennes campagnes (utiliser `channel` en fallback).
   */
  @Field(() => [CommunicationChannel])
  channels!: CommunicationChannel[];

  @Field(() => ID, { nullable: true })
  dynamicGroupId!: string | null;

  /**
   * Audience riche sérialisée en JSON (string). Le client parse avec
   * `JSON.parse` selon la forme `AudienceFilterInput`. `null` pour les
   * anciennes campagnes (utiliser `dynamicGroupId` en fallback).
   * Évite la dépendance graphql-type-json non présente sur ce projet.
   */
  @Field(() => String, { nullable: true })
  audienceFilterJson!: string | null;

  @Field(() => MessageCampaignStatus)
  status!: MessageCampaignStatus;

  @Field(() => Date, { nullable: true })
  sentAt!: Date | null;

  @Field(() => Int)
  recipientCount!: number;
}
