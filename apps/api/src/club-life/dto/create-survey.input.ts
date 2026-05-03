import { Field, InputType } from '@nestjs/graphql';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsBoolean,
  IsDate,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

@InputType()
export class CreateSurveyInput {
  @Field()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title!: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(5_000)
  description?: string;

  @Field(() => [String])
  @ArrayMinSize(2)
  @ArrayMaxSize(20)
  @IsString({ each: true })
  options!: string[];

  @Field({ nullable: true, defaultValue: false })
  @IsOptional()
  @IsBoolean()
  multipleChoice?: boolean;

  @Field({ nullable: true, defaultValue: false })
  @IsOptional()
  @IsBoolean()
  allowAnonymous?: boolean;

  @Field(() => Date, { nullable: true })
  @IsOptional()
  @IsDate()
  closesAt?: Date;

  @Field({ nullable: true, defaultValue: true })
  @IsOptional()
  @IsBoolean()
  publishNow?: boolean;
}
