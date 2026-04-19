import { Field, ID, InputType, Int } from '@nestjs/graphql';
import { SponsorshipDealStatus } from '@prisma/client';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

@InputType()
export class UpdateSponsorshipDealInput {
  @Field(() => ID)
  id!: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  sponsorName?: string;

  @Field(() => Int, { nullable: true })
  @IsOptional()
  @IsInt()
  @Min(0)
  amountCents?: number | null;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string | null;

  @Field(() => SponsorshipDealStatus, { nullable: true })
  @IsOptional()
  @IsEnum(SponsorshipDealStatus)
  status?: SponsorshipDealStatus;
}
