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

  /**
   * LEGACY single-channel. Conservé pour rétrocompat des appels anciens
   * (nouvelles UI : utilise `channels[]`). Si `channels` fourni, ce champ
   * est ignoré.
   */
  @Field(() => CommunicationChannel, { nullable: true })
  @IsOptional()
  @IsEnum(CommunicationChannel)
  channel?: CommunicationChannel;

  /**
   * Multi-canal : la campagne est délivrée via tous ces canaux. Au moins
   * 1 si fourni. EMAIL / PUSH / MESSAGING (Telegram déprécié côté UI mais
   * encore accepté côté API pour rétrocompat).
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

  /**
   * Audience riche multi-critère (union des matchés). Si null + pas de
   * `dynamicGroupId`, fallback sur "tous les membres actifs".
   */
  @Field(() => AudienceFilterInput, { nullable: true })
  @IsOptional()
  @ValidateNested()
  @Type(() => AudienceFilterInput)
  audience?: AudienceFilterInput;
}
