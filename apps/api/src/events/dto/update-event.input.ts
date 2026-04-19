import { Field, ID, InputType, Int } from '@nestjs/graphql';
import {
  IsBoolean,
  IsDate,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

@InputType()
export class UpdateEventInput {
  @Field(() => ID)
  @IsUUID()
  id!: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(10_000)
  description?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  location?: string;

  @Field(() => Date, { nullable: true })
  @IsOptional()
  @IsDate()
  startsAt?: Date;

  @Field(() => Date, { nullable: true })
  @IsOptional()
  @IsDate()
  endsAt?: Date;

  @Field(() => Int, { nullable: true })
  @IsOptional()
  @IsInt()
  @Min(0)
  capacity?: number;

  @Field(() => Date, { nullable: true })
  @IsOptional()
  @IsDate()
  registrationOpensAt?: Date;

  @Field(() => Date, { nullable: true })
  @IsOptional()
  @IsDate()
  registrationClosesAt?: Date;

  @Field(() => Int, { nullable: true })
  @IsOptional()
  @IsInt()
  @Min(0)
  priceCents?: number;

  @Field({ nullable: true })
  @IsOptional()
  @IsBoolean()
  allowContactRegistration?: boolean;
}
