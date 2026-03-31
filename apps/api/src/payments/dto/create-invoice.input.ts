import { Field, ID, InputType, Int } from '@nestjs/graphql';
import { ClubPaymentMethod } from '@prisma/client';
import {
  IsEnum,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
  Min,
} from 'class-validator';

@InputType()
export class CreateInvoiceInput {
  @Field()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  label!: string;

  @Field(() => Int)
  @IsInt()
  @Min(0)
  baseAmountCents!: number;

  @Field(() => ClubPaymentMethod, {
    description: 'Mode servant à appliquer la règle tarifaire (MVP)',
  })
  @IsEnum(ClubPaymentMethod)
  pricingMethod!: ClubPaymentMethod;

  @Field(() => ID, { nullable: true })
  @IsOptional()
  @IsUUID()
  familyId?: string;

  @Field(() => ID, {
    nullable: true,
    description: 'Groupe foyer étendu ; familyId peut être déduit du foyer porteur.',
  })
  @IsOptional()
  @IsUUID()
  householdGroupId?: string | null;

  @Field({ nullable: true })
  @IsOptional()
  @IsISO8601()
  dueAt?: string;
}
