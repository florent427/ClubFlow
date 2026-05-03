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
export class UpdateGrantApplicationInput {
  @Field(() => ID)
  @IsUUID()
  id!: string;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title?: string;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  fundingBody?: string;

  @Field(() => Int, { nullable: true })
  @IsOptional()
  @IsInt()
  @Min(0)
  requestedAmountCents?: number | null;

  @Field(() => Int, { nullable: true })
  @IsOptional()
  @IsInt()
  @Min(0)
  grantedAmountCents?: number | null;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsUUID()
  projectId?: string | null;

  @Field(() => Date, { nullable: true })
  @IsOptional()
  startsAt?: Date | null;

  @Field(() => Date, { nullable: true })
  @IsOptional()
  endsAt?: Date | null;

  @Field(() => Date, { nullable: true })
  @IsOptional()
  reportDueAt?: Date | null;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string | null;
}

@InputType()
export class MarkGrantGrantedInput {
  @Field(() => ID)
  @IsUUID()
  id!: string;

  @Field(() => Int)
  @IsInt()
  @Min(1)
  grantedAmountCents!: number;
}

@InputType()
export class CreateGrantInstallmentInput {
  @Field(() => ID)
  @IsUUID()
  grantId!: string;

  @Field(() => Int)
  @IsInt()
  @Min(1)
  expectedAmountCents!: number;

  @Field(() => Date, { nullable: true })
  @IsOptional()
  expectedAt?: Date;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}

@InputType()
export class MarkGrantInstallmentReceivedInput {
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
