import { Field, ID, InputType } from '@nestjs/graphql';
import {
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

@InputType()
export class UpdateCourseSlotInput {
  @Field(() => ID)
  @IsUUID()
  id!: string;

  @Field(() => ID, { nullable: true })
  @IsOptional()
  @IsUUID()
  venueId?: string;

  @Field(() => ID, { nullable: true })
  @IsOptional()
  @IsUUID()
  coachMemberId?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsISO8601()
  startsAt?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsISO8601()
  endsAt?: string;

  @Field(() => ID, { nullable: true })
  @IsOptional()
  @IsUUID()
  dynamicGroupId?: string | null;
}
