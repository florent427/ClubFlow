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
}
