import { Field, ID, InputType } from '@nestjs/graphql';
import {
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';
import { EventConvocationMode } from '../enums/event-convocation-mode.enum';

@InputType()
export class SendEventConvocationInput {
  @Field(() => ID)
  @IsUUID()
  eventId!: string;

  @Field(() => EventConvocationMode)
  @IsEnum(EventConvocationMode)
  mode!: EventConvocationMode;

  /** Requis si mode === DYNAMIC_GROUP. */
  @Field(() => ID, { nullable: true })
  @IsOptional()
  @IsUUID()
  dynamicGroupId?: string | null;

  /** Objet de l’e-mail. Auto-généré côté service si vide. */
  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  subject?: string | null;

  /** Corps texte libre. Auto-généré côté service si vide. */
  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(20_000)
  body?: string | null;
}
