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
export class CreateCourseSlotInput {
  @Field(() => ID)
  @IsUUID()
  venueId!: string;

  @Field(() => ID, { description: 'Membre avec rôle COACH' })
  @IsUUID()
  coachMemberId!: string;

  @Field()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title!: string;

  @Field()
  @IsISO8601()
  startsAt!: string;

  @Field()
  @IsISO8601()
  endsAt!: string;

  @Field(() => ID, { nullable: true })
  @IsOptional()
  @IsUUID()
  dynamicGroupId?: string;

  @Field({ nullable: true, defaultValue: false })
  @IsOptional()
  @IsBoolean()
  bookingEnabled?: boolean;

  @Field(() => Int, { nullable: true })
  @IsOptional()
  @IsInt()
  @Min(0)
  bookingCapacity?: number;

  @Field({ nullable: true })
  @IsOptional()
  @IsISO8601()
  bookingOpensAt?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsISO8601()
  bookingClosesAt?: string;
}
