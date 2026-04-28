import { Field, ID, InputType } from '@nestjs/graphql';
import {
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ChatRoomChannelMode, ChatRoomPermissionTarget } from '@prisma/client';

@InputType()
export class ChatRoomTargetInput {
  @Field(() => ChatRoomPermissionTarget)
  @IsEnum(ChatRoomPermissionTarget)
  targetKind!: ChatRoomPermissionTarget;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  targetValue?: string | null;

  @Field(() => ID, { nullable: true })
  @IsOptional()
  @IsUUID()
  dynamicGroupId?: string | null;
}

@InputType()
export class CreateAdminChatGroupInput {
  @Field()
  @IsString()
  @Length(2, 80)
  name!: string;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string | null;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  coverImageUrl?: string | null;

  @Field(() => ChatRoomChannelMode)
  @IsEnum(ChatRoomChannelMode)
  channelMode!: ChatRoomChannelMode;

  @Field(() => Boolean)
  @IsBoolean()
  isBroadcastChannel!: boolean;

  /** Membres explicites (ajoutés en plus du calcul automatique des scopes). */
  @Field(() => [ID])
  @IsArray()
  @ArrayUnique()
  memberIds!: string[];

  /** Scopes : chaque entrée ajoute des membres calculés automatiquement. */
  @Field(() => [ChatRoomTargetInput])
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ChatRoomTargetInput)
  membershipScopes!: ChatRoomTargetInput[];

  /** Permissions d'écriture (RESTRICTED). Vide => tout membre du salon écrit. */
  @Field(() => [ChatRoomTargetInput])
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ChatRoomTargetInput)
  writePermissions!: ChatRoomTargetInput[];
}

@InputType()
export class UpdateAdminChatGroupInput {
  @Field(() => ID)
  @IsUUID()
  roomId!: string;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  @Length(2, 80)
  name?: string;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string | null;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  coverImageUrl?: string | null;

  @Field(() => ChatRoomChannelMode, { nullable: true })
  @IsOptional()
  @IsEnum(ChatRoomChannelMode)
  channelMode?: ChatRoomChannelMode;

  @Field(() => Boolean, { nullable: true })
  @IsOptional()
  @IsBoolean()
  isBroadcastChannel?: boolean;

  @Field(() => Boolean, { nullable: true })
  @IsOptional()
  @IsBoolean()
  archived?: boolean;

  @Field(() => [ID], { nullable: true })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  memberIds?: string[];

  @Field(() => [ChatRoomTargetInput], { nullable: true })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ChatRoomTargetInput)
  membershipScopes?: ChatRoomTargetInput[];

  @Field(() => [ChatRoomTargetInput], { nullable: true })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ChatRoomTargetInput)
  writePermissions?: ChatRoomTargetInput[];
}

@InputType()
export class AdminPostAsMemberInput {
  @Field(() => ID)
  @IsUUID()
  roomId!: string;

  @Field(() => ID)
  @IsUUID()
  asMemberId!: string;

  @Field()
  @IsString()
  @Length(1, 8000)
  body!: string;
}
