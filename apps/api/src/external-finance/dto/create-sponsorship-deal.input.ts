import { Field, InputType, Int } from '@nestjs/graphql';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

@InputType()
export class CreateSponsorshipDealInput {
  @Field()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  sponsorName!: string;

  @Field(() => Int, { nullable: true })
  @IsOptional()
  amountCents?: number;
}
