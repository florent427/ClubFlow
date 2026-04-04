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

  @Field(() => CommunicationChannel)
  channel!: CommunicationChannel;

  @Field(() => ID, { nullable: true })
  dynamicGroupId!: string | null;

  @Field(() => MessageCampaignStatus)
  status!: MessageCampaignStatus;

  @Field(() => Date, { nullable: true })
  sentAt!: Date | null;

  @Field(() => Int)
  recipientCount!: number;
}
