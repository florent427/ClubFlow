import { Field, ID, InputType } from '@nestjs/graphql';
import { CommunicationChannel } from '@prisma/client';
import {
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';
import { QuickMessageRecipientType } from '../enums/quick-message-recipient.enum';

@InputType()
export class SendQuickMessageInput {
  @Field(() => QuickMessageRecipientType)
  @IsEnum(QuickMessageRecipientType)
  recipientType!: QuickMessageRecipientType;

  @Field(() => ID)
  @IsUUID()
  recipientId!: string;

  @Field(() => [CommunicationChannel])
  @IsArray()
  @ArrayMinSize(1)
  @IsEnum(CommunicationChannel, { each: true })
  channels!: CommunicationChannel[];

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
}
