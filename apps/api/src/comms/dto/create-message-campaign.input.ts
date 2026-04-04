import { Field, ID, InputType } from '@nestjs/graphql';
import { CommunicationChannel } from '@prisma/client';
import {
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

@InputType()
export class CreateMessageCampaignInput {
  @Field()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title!: string;

  @Field()
  @IsString()
  @MinLength(1)
  @MaxLength(20_000)
  body!: string;

  @Field(() => CommunicationChannel)
  @IsEnum(CommunicationChannel)
  channel!: CommunicationChannel;

  @Field(() => ID, { nullable: true })
  @IsOptional()
  @IsUUID()
  dynamicGroupId?: string;
}
