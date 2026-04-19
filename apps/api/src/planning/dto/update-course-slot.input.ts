import { Field, ID, Int, InputType } from '@nestjs/graphql';
import {
  IsBoolean,
  IsISO8601,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
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

  @Field({ nullable: true })
  @IsOptional()
  @IsBoolean()
  bookingEnabled?: boolean;

  @Field(() => Int, { nullable: true })
  @IsOptional()
  @IsInt()
  @Min(0)
  bookingCapacity?: number | null;

  @Field({ nullable: true })
  @IsOptional()
  @IsISO8601()
  bookingOpensAt?: string | null;

  @Field({ nullable: true })
  @IsOptional()
  @IsISO8601()
  bookingClosesAt?: string | null;
}
