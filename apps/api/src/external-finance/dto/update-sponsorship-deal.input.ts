import { Field, ID, InputType, Int } from '@nestjs/graphql';
import {
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

@InputType()
export class UpdateSponsorshipDealInput {
  @Field(() => ID)
  @IsUUID()
  id!: string;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  sponsorName?: string;

  @Field(() => Int, { nullable: true })
  @IsOptional()
  @IsInt()
  @Min(0)
  valueCents?: number | null;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  inKindDescription?: string | null;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsUUID()
  projectId?: string | null;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsUUID()
  contactId?: string | null;

  @Field(() => Date, { nullable: true })
  @IsOptional()
  startsAt?: Date | null;

  @Field(() => Date, { nullable: true })
  @IsOptional()
  endsAt?: Date | null;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string | null;
}

@InputType()
export class CreateSponsorshipInstallmentInput {
  @Field(() => ID)
  @IsUUID()
  dealId!: string;

  @Field(() => Int)
  @IsInt()
  @Min(1)
  expectedAmountCents!: number;

  @Field(() => Date, { nullable: true })
  @IsOptional()
  expectedAt?: Date;
}

@InputType()
export class MarkSponsorshipInstallmentReceivedInput {
  @Field(() => ID)
  @IsUUID()
  id!: string;

  @Field(() => Int)
  @IsInt()
  @Min(1)
  receivedAmountCents!: number;

  @Field(() => Date, { nullable: true })
  @IsOptional()
  receivedAt?: Date;

  @Field(() => ID, { nullable: true })
  @IsOptional()
  @IsUUID()
  paymentId?: string;
}
