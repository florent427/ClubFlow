import { Field, ID, InputType } from '@nestjs/graphql';
import { Type } from 'class-transformer';
import { CommunicationChannel } from '@prisma/client';
import {
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { AudienceFilterInput } from './audience-filter.input';

@InputType()
export class UpdateMessageCampaignInput {
  @Field(() => ID)
  @IsUUID()
  campaignId!: string;

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

  /** LEGACY single-channel. `channels[]` à privilégier. */
  @Field(() => CommunicationChannel, { nullable: true })
  @IsOptional()
  @IsEnum(CommunicationChannel)
  channel?: CommunicationChannel;

  /**
   * Multi-canal : tous ces canaux délivreront la campagne. Si `channels[]`
   * est fourni il prime sur `channel` (legacy).
   */
  @Field(() => [CommunicationChannel], { nullable: true })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @IsEnum(CommunicationChannel, { each: true })
  channels?: CommunicationChannel[];

  /** LEGACY single dynamic group. `audience.dynamicGroupIds` à privilégier. */
  @Field(() => ID, { nullable: true })
  @IsOptional()
  @IsUUID()
  dynamicGroupId?: string;

  /** Audience riche multi-critère (cf. AudienceFilterInput). */
  @Field(() => AudienceFilterInput, { nullable: true })
  @IsOptional()
  @ValidateNested()
  @Type(() => AudienceFilterInput)
  audience?: AudienceFilterInput;
}
