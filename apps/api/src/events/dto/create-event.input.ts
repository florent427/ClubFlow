import { Field, InputType, Int } from '@nestjs/graphql';
import {
  IsBoolean,
  IsDate,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

@InputType()
export class CreateEventInput {
  @Field()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title!: string;

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

  @Field(() => Date)
  @IsDate()
  startsAt!: Date;

  @Field(() => Date)
  @IsDate()
  endsAt!: Date;

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

  @Field({ nullable: true, defaultValue: false })
  @IsOptional()
  @IsBoolean()
  allowContactRegistration?: boolean;

  @Field({ nullable: true, defaultValue: true })
  @IsOptional()
  @IsBoolean()
  publishNow?: boolean;
}
