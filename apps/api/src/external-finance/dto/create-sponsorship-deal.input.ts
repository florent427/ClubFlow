import { Field, InputType, Int } from '@nestjs/graphql';
import { SponsorshipKind } from '@prisma/client';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

@InputType()
export class CreateSponsorshipDealInput {
  @Field(() => String)
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  sponsorName!: string;

  @Field(() => SponsorshipKind)
  @IsEnum(SponsorshipKind)
  kind!: SponsorshipKind;

  @Field(() => Int, { nullable: true })
  @IsOptional()
  @IsInt()
  @Min(0)
  valueCents?: number;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  inKindDescription?: string;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsUUID()
  projectId?: string;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsUUID()
  contactId?: string;

  @Field(() => Date, { nullable: true })
  @IsOptional()
  startsAt?: Date;

  @Field(() => Date, { nullable: true })
  @IsOptional()
  endsAt?: Date;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}
